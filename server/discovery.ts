import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { Actor } from './auth.js';
import { requireConsent } from './auth.js';
import { baseEvidence, type AiGateway } from './ai.js';
import { ApiError } from './errors.js';
import type { Db } from './db.js';
import { parseRequestSchema, type ConnectionIntent, type DiscoveryView, type Goal, type IntentView, type MatchCard, type PlaceInput } from '../shared/contracts.js';

interface IntentRow { id: string; message: string; parsed: ConnectionIntent; location: PlaceInput; location_label: string; model: string }
const toIntentView = (row: IntentRow): IntentView => ({ id:row.id,message:row.message,intent:row.parsed,location:row.location,locationLabel:row.location_label,model:row.model });

async function locationLabel(pool: Pool, place: PlaceInput): Promise<string> {
  if (place.cafeId) {
    const result = await pool.query<{name:string;neighborhood:string}>('SELECT name,neighborhood FROM cafes WHERE id=$1 AND fictional', [place.cafeId]);
    const row = result.rows[0];
    if (!row) throw new ApiError(404, 'CAFE_NOT_FOUND', 'Choose one of the participating fictional demo cafes.');
    return `${row.name}, ${row.neighborhood}`;
  }
  if (place.coarseLocation) return place.coarseLocation;
  throw new ApiError(422, 'LOCATION_REQUIRED', 'Choose a cafe or a coarse location.');
}
export async function parseIntent(pool: Pool, ai: AiGateway, current: Actor, input: z.infer<typeof parseRequestSchema>): Promise<IntentView> {
  await requireConsent(pool,current);
  const label = await locationLabel(pool,input.location);
  const topics = await pool.query<{label:string}>('SELECT label FROM interests ORDER BY label');
  const parsed = await ai.parse({ message:input.message, timeZone:input.timeZone, now:new Date().toISOString(), goal:input.goal, topics:topics.rows.map((v)=>v.label) });
  const id = randomUUID();
  const confirmed = input.goal ? { ...parsed, goal:input.goal } : parsed;
  await pool.query(`INSERT INTO intents(id,world_id,profile_id,message,parsed,location,location_label,model)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id,current.worldId,current.profileId,input.message,confirmed,input.location,label,ai.model]);
  return { id,message:input.message,intent:confirmed,location:input.location,locationLabel:label,model:ai.model };
}

interface CandidateRow {
  id:string; profile_id:string; gathering_id:string|null; kind:'one_to_one'|'small_group'|'event';
  name:string; initials:string; color:string; bio:string; topics:string[]; shared_topics:string[];
  cafe_name:string; cafe_id:string; neighborhood:string; city:string; starts_at:Date; ends_at:Date;
  gathering_title:string|null; seats_remaining:number|null;
}
export async function findCandidates(db: Db, current: Pick<Actor,'worldId'|'profileId'>, intent: ConnectionIntent, location: PlaceInput): Promise<MatchCard[]> {
  const catalog = await db.query<{slug:string;label:string}>('SELECT slug,label FROM interests');
  const requested = new Set(intent.topics.map((v)=>v.toLocaleLowerCase('en').trim()));
  const slugs = catalog.rows.filter((v)=>requested.has(v.label.toLocaleLowerCase('en')) || requested.has(v.slug)).map((v)=>v.slug);
  const params = [current.worldId,current.profileId,location.cafeId || null,location.coarseLocation?.trim() || null,
    intent.goal,intent.activity,slugs,intent.topics.length>0,intent.startsAt,intent.endsAt];
  const peopleSql = `SELECT p.id,p.id AS profile_id,NULL::uuid AS gathering_id,'one_to_one' AS kind,
    p.name,p.initials,p.color,p.bio,p.cafe_id,c.name AS cafe_name,c.neighborhood,c.city,a.starts_at,a.ends_at,
    NULL::text AS gathering_title,NULL::integer AS seats_remaining,
    ARRAY(SELECT i.label FROM profile_interests pi JOIN interests i ON i.slug=pi.interest_slug WHERE pi.profile_id=p.id ORDER BY i.label) AS topics,
    ARRAY(SELECT i.label FROM profile_interests pi JOIN interests i ON i.slug=pi.interest_slug WHERE pi.profile_id=p.id AND i.slug=ANY($7::text[]) ORDER BY i.label) AS shared_topics
    FROM profiles p JOIN cafes c ON c.id=p.cafe_id
    JOIN LATERAL (SELECT starts_at,ends_at FROM availability WHERE profile_id=p.id AND starts_at<$10::timestamptz AND ends_at>$9::timestamptz ORDER BY starts_at LIMIT 1) a ON true
    WHERE p.world_id=$1 AND p.id<>$2 AND p.discoverable AND p.introductions_allowed
    AND ($3::uuid IS NULL OR p.cafe_id=$3)
    AND ($4::text IS NULL OR lower(c.neighborhood)=lower($4) OR lower(c.city)=lower($4) OR lower(p.coarse_location)=lower($4))
    AND EXISTS(SELECT 1 FROM profile_goals pg WHERE pg.profile_id=p.id AND pg.goal=$5)
    AND ($6='any' OR EXISTS(SELECT 1 FROM profile_activities pa WHERE pa.profile_id=p.id AND pa.activity IN ($6,'any')))
    AND (NOT $8::boolean OR EXISTS(SELECT 1 FROM profile_interests pi WHERE pi.profile_id=p.id AND pi.interest_slug=ANY($7::text[])))
    ORDER BY cardinality(ARRAY(SELECT interest_slug FROM profile_interests WHERE profile_id=p.id AND interest_slug=ANY($7::text[]))) DESC,p.name LIMIT 6`;
  const groupsSql = `SELECT g.id,p.id AS profile_id,g.id AS gathering_id,g.kind,
    p.name,p.initials,p.color,g.description AS bio,g.cafe_id,c.name AS cafe_name,c.neighborhood,c.city,g.starts_at,g.ends_at,
    g.title AS gathering_title,(g.capacity-(SELECT count(*)::integer FROM gathering_members gm WHERE gm.gathering_id=g.id)) AS seats_remaining,
    ARRAY(SELECT i.label FROM gathering_interests gi JOIN interests i ON i.slug=gi.interest_slug WHERE gi.gathering_id=g.id ORDER BY i.label) AS topics,
    ARRAY(SELECT i.label FROM gathering_interests gi JOIN interests i ON i.slug=gi.interest_slug WHERE gi.gathering_id=g.id AND i.slug=ANY($7::text[]) ORDER BY i.label) AS shared_topics
    FROM gatherings g JOIN profiles p ON p.id=g.host_id JOIN cafes c ON c.id=g.cafe_id
    WHERE g.world_id=$1 AND g.host_id<>$2 AND g.open AND p.discoverable AND p.introductions_allowed
    AND ($3::uuid IS NULL OR g.cafe_id=$3)
    AND ($4::text IS NULL OR lower(c.neighborhood)=lower($4) OR lower(c.city)=lower($4))
    AND EXISTS(SELECT 1 FROM profile_goals pg WHERE pg.profile_id=p.id AND pg.goal=$5)
    AND ($6 IN ('any','coffee','conversation') OR g.activity=$6)
    AND (NOT $8::boolean OR EXISTS(SELECT 1 FROM gathering_interests gi WHERE gi.gathering_id=g.id AND gi.interest_slug=ANY($7::text[])))
    AND g.starts_at<$10::timestamptz AND g.ends_at>$9::timestamptz
    AND EXISTS(SELECT 1 FROM availability a WHERE a.profile_id=p.id AND a.starts_at<LEAST($10::timestamptz,g.ends_at) AND a.ends_at>GREATEST($9::timestamptz,g.starts_at))
    AND g.kind=$11 AND g.capacity>(SELECT count(*) FROM gathering_members gm WHERE gm.gathering_id=g.id)
    AND NOT EXISTS(SELECT 1 FROM gathering_members gm WHERE gm.gathering_id=g.id AND gm.profile_id=$2)
    ORDER BY cardinality(ARRAY(SELECT interest_slug FROM gathering_interests WHERE gathering_id=g.id AND interest_slug=ANY($7::text[]))) DESC,g.starts_at LIMIT 6`;
  const result = await db.query<CandidateRow>(intent.kind === 'one_to_one' ? peopleSql : groupsSql, intent.kind === 'one_to_one' ? params : [...params,intent.kind]);
  return result.rows.map((row) => {
    const locationText = `${row.cafe_name}, ${row.neighborhood}`;
    return {
      id:row.id,profileId:row.profile_id,gatheringId:row.gathering_id,kind:row.kind,
      name:row.name,initials:row.initials,color:row.color,bio:row.bio,topics:row.topics,sharedTopics:row.shared_topics,
      cafeName:row.cafe_name,cafeId:row.cafe_id,location:locationText,explanation:'',icebreaker:'',
      evidence:baseEvidence(row.shared_topics,locationText,intent.goal),
      availability:`Fictional sample window: ${row.starts_at.toISOString()} to ${row.ends_at.toISOString()}`,
      gatheringTitle:row.gathering_title,gatheringTime:row.gathering_id ? row.starts_at.toISOString() : null,
      seatsRemaining:row.seats_remaining,fictional:true,
    };
  });
}

export async function discover(pool: Pool, ai: AiGateway, current: Actor, intentId: string, goal: Goal): Promise<DiscoveryView> {
  await requireConsent(pool,current);
  const result = await pool.query<IntentRow>(`SELECT id,message,parsed,location,location_label,model FROM intents
    WHERE id=$1 AND world_id=$2 AND profile_id=$3 AND created_at>now()-interval '1 hour'`, [intentId,current.worldId,current.profileId]);
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'INTENT_NOT_FOUND', 'This request has expired or belongs to another identity. Please enter it again.');
  const view = toIntentView(row);
  view.intent = { ...view.intent, goal };
  if (Date.parse(view.intent.endsAt) <= Date.now()) throw new ApiError(422,'TIME_WINDOW_PASSED','That time window has passed. Try a new request.');
  const ownAvailability = await pool.query(`SELECT 1 FROM availability WHERE profile_id=$1 AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz LIMIT 1`,
    [current.profileId,view.intent.startsAt,view.intent.endsAt]);
  if (!ownAvailability.rowCount) throw new ApiError(409,'NO_SAMPLE_AVAILABILITY','This fictional identity has no sample availability in that window. Choose another demo identity or time.');
  const candidates = await findCandidates(pool,current,view.intent,view.location);
  const explanations = candidates.length ? await ai.explain(view.intent,candidates) : [];
  const matches = candidates.map((candidate) => {
    const explanation = explanations.find((v)=>v.id===candidate.id);
    if (!explanation) throw new ApiError(502,'AI_GROUNDING_FAILED','The candidate explanation is missing. Please try again.');
    return { ...candidate,explanation:explanation.explanation,icebreaker:explanation.icebreaker,
      evidence:candidate.evidence.filter((fact)=>explanation.evidenceIds.includes(fact.id)) };
  });
  const id = randomUUID();
  const output: DiscoveryView = {
    id,intent:view,matches,model:ai.model,createdAt:new Date().toISOString(),demo:true,
    summary:matches.length ? `${matches.length} ${matches.length===1?'possibility':'possibilities'} worth a hello. These fictional matches share your interests or intent, with overlapping sample availability and opt-in consent.`
      : 'No opted-in fictional records match that combination yet. Try Hyderabad, another demo cafe, a broader topic, or a different time. No people or events were invented.',
  };
  await pool.query('INSERT INTO discoveries(id,intent_id,world_id,profile_id,result,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id,intentId,current.worldId,current.profileId,output,new Date(Date.now()+20*60_000)]);
  return output;
}
