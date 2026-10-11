import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Actor } from './auth.js';
import { transaction } from './db.js';
import { ApiError } from './errors.js';
import { findCandidates } from './discovery.js';
import type { DiscoveryView, IntroductionView, MatchCard, RequestStatus } from '../shared/contracts.js';

interface RequestRow {
  id:string; world_id:string; sender_id:string; recipient_id:string; discovery_id:string;
  gathering_id:string|null; status:RequestStatus; expires_at:Date;
}
interface DiscoveryRow { result:DiscoveryView; expires_at:Date }
interface IntroductionRow {
  id:string; sender_id:string; sender_name:string; sender_initials:string; sender_color:string;
  recipient_id:string; recipient_name:string; recipient_initials:string; recipient_color:string;
  status:RequestStatus; message:string; icebreaker:string; cafe_name:string; gathering_title:string|null;
  created_at:Date; responded_at:Date|null; connection_id:string|null;
}

export async function listIntroductions(pool: Pool, current: Pick<Actor,'worldId'|'profileId'>): Promise<IntroductionView[]> {
  await pool.query(`UPDATE introduction_requests SET status='expired',responded_at=now()
    WHERE world_id=$1 AND (sender_id=$2 OR recipient_id=$2) AND status='pending' AND expires_at<=now()`,
  [current.worldId,current.profileId]);
  const result = await pool.query<IntroductionRow>(`SELECT r.id,r.sender_id,r.recipient_id,r.status,r.message,r.icebreaker,r.created_at,r.responded_at,
    s.name AS sender_name,s.initials AS sender_initials,s.color AS sender_color,
    p.name AS recipient_name,p.initials AS recipient_initials,p.color AS recipient_color,
    c.name AS cafe_name,g.title AS gathering_title,cn.id AS connection_id
    FROM introduction_requests r JOIN profiles s ON s.id=r.sender_id JOIN profiles p ON p.id=r.recipient_id
    JOIN cafes c ON c.id=r.cafe_id LEFT JOIN gatherings g ON g.id=r.gathering_id
    LEFT JOIN connections cn ON cn.request_id=r.id
    WHERE r.world_id=$1 AND (r.sender_id=$2 OR r.recipient_id=$2)
    ORDER BY r.created_at DESC LIMIT 100`, [current.worldId,current.profileId]);
  return result.rows.map((r)=>({
    id:r.id,sender:{id:r.sender_id,name:r.sender_name,initials:r.sender_initials,color:r.sender_color},
    recipient:{id:r.recipient_id,name:r.recipient_name,initials:r.recipient_initials,color:r.recipient_color},
    status:r.status,direction:r.recipient_id===current.profileId?'incoming':'outgoing',
    message:r.message,icebreaker:r.icebreaker,cafeName:r.cafe_name,gatheringTitle:r.gathering_title,
    createdAt:r.created_at.toISOString(),respondedAt:r.responded_at?.toISOString() || null,
    connectionId:r.connection_id,fictional:true,
  }));
}
async function loadOne(pool:Pool,current:Pick<Actor,'worldId'|'profileId'>,id:string) {
  const result = (await listIntroductions(pool,current)).find((r)=>r.id===id);
  if (!result) throw new ApiError(404,'REQUEST_NOT_FOUND','This introduction is not available to this identity.');
  return result;
}
async function lockPeople(client:PoolClient,worldId:string,ids:string[]) {
  const result = await client.query<{id:string;discoverable:boolean;introductions_allowed:boolean}>(
    `SELECT id,discoverable,introductions_allowed FROM profiles WHERE world_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE`, [worldId,ids]);
  if (result.rows.length !== 2) throw new ApiError(404,'PROFILE_NOT_FOUND','Both fictional identities must belong to this demo.');
  return result.rows;
}
function bothConsented(people:Array<{discoverable:boolean;introductions_allowed:boolean}>) {
  if (people.some((p)=>!p.discoverable || !p.introductions_allowed)) {
    throw new ApiError(409,'CONSENT_CHANGED','One of these fictional identities has paused discovery or introductions. No connection was made.');
  }
}
async function currentMatch(client:PoolClient,worldId:string,senderId:string,result:DiscoveryView,match:MatchCard) {
  const candidates = await findCandidates(client,{worldId,profileId:senderId},result.intent.intent,result.intent.location);
  if (!candidates.some((candidate)=>candidate.id===match.id && candidate.profileId===match.profileId)) {
    throw new ApiError(409,'MATCH_CHANGED','The sample availability, consent, or group capacity changed. Refresh your discovery before trying again.');
  }
  const senderAvailable = await client.query(`SELECT 1 FROM availability WHERE profile_id=$1
    AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz LIMIT 1`, [senderId,result.intent.intent.startsAt,result.intent.intent.endsAt]);
  if (!senderAvailable.rowCount) throw new ApiError(409,'MATCH_CHANGED','The sender no longer has matching sample availability.');
}

export async function sendIntroduction(pool:Pool,current:Actor,input:{discoveryId:string;matchId:string;message:string}):Promise<IntroductionView> {
  const id = await transaction(pool,async(client)=>{
    const discovery = await client.query<DiscoveryRow>(`SELECT result,expires_at FROM discoveries WHERE id=$1 AND world_id=$2 AND profile_id=$3`,
      [input.discoveryId,current.worldId,current.profileId]);
    const saved = discovery.rows[0];
    if (!saved || saved.expires_at.getTime()<=Date.now()) throw new ApiError(404,'DISCOVERY_EXPIRED','This discovery has expired or belongs to another identity. Search again.');
    const match = saved.result.matches.find((candidate)=>candidate.id===input.matchId);
    if (!match || match.profileId===current.profileId) throw new ApiError(404,'MATCH_NOT_FOUND','Choose a candidate returned by your own discovery.');
    const people = await lockPeople(client,current.worldId,[current.profileId,match.profileId]);
    bothConsented(people);
    await currentMatch(client,current.worldId,current.profileId,saved.result,match);
    await client.query(`UPDATE introduction_requests SET status='expired',responded_at=now()
      WHERE world_id=$1 AND sender_id=ANY($2::uuid[]) AND recipient_id=ANY($2::uuid[]) AND status='pending' AND expires_at<=now()`,
    [current.worldId,[current.profileId,match.profileId]]);
    const existing = await client.query<{id:string;sender_id:string}>(`SELECT id,sender_id FROM introduction_requests
      WHERE world_id=$1 AND sender_id=ANY($2::uuid[]) AND recipient_id=ANY($2::uuid[])
      AND gathering_id IS NOT DISTINCT FROM $3::uuid AND status IN ('pending','accepted') LIMIT 1`,
    [current.worldId,[current.profileId,match.profileId],match.gatheringId]);
    if (existing.rows[0]) {
      if (existing.rows[0].sender_id===current.profileId) return existing.rows[0].id;
      throw new ApiError(409,'INTRODUCTION_EXISTS','There is already an introduction between you. Open your inbox to respond.');
    }
    const expiresAt = new Date(Math.min(Date.now()+2*60*60_000,Date.parse(saved.result.intent.intent.endsAt)));
    if (expiresAt.getTime()<=Date.now()) throw new ApiError(409,'TIME_WINDOW_PASSED','This connection window has ended. Try a fresh request.');
    const requestId = randomUUID();
    await client.query(`INSERT INTO introduction_requests(id,world_id,sender_id,recipient_id,discovery_id,gathering_id,cafe_id,message,icebreaker,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [requestId,current.worldId,current.profileId,match.profileId,input.discoveryId,match.gatheringId,match.cafeId,input.message,match.icebreaker,expiresAt]);
    return requestId;
  });
  return loadOne(pool,current,id);
}

export async function respondToIntroduction(pool:Pool,current:Actor,id:string,action:'accept'|'decline'|'cancel'):Promise<IntroductionView> {
  const resolution = await transaction(pool,async(client)=>{
    const initial = await client.query<RequestRow>('SELECT * FROM introduction_requests WHERE id=$1 AND world_id=$2', [id,current.worldId]);
    const preview = initial.rows[0];
    if (!preview || (preview.sender_id!==current.profileId && preview.recipient_id!==current.profileId)) throw new ApiError(404,'REQUEST_NOT_FOUND','This introduction is not available to this identity.');
    if (action==='cancel' ? preview.sender_id!==current.profileId : preview.recipient_id!==current.profileId) {
      throw new ApiError(403,'NOT_YOUR_DECISION','Only the recipient may accept or decline, and only the sender may cancel.');
    }
    // Every state-changing path locks identities before requests to avoid lock-order inversions.
    const people = await lockPeople(client,current.worldId,[preview.sender_id,preview.recipient_id]);
    const locked = await client.query<RequestRow>('SELECT * FROM introduction_requests WHERE id=$1 FOR UPDATE', [id]);
    const request = locked.rows[0];
    if (!request) throw new ApiError(404,'REQUEST_NOT_FOUND','Introduction not found.');
    const desired:RequestStatus = action==='accept'?'accepted':action==='decline'?'declined':'cancelled';
    if (request.status===desired) return;
    if (request.status!=='pending') throw new ApiError(409,'REQUEST_ALREADY_RESOLVED','This introduction has already been resolved. Refresh its status.');
    if (request.expires_at.getTime()<=Date.now()) {
      await client.query(`UPDATE introduction_requests SET status='expired',responded_at=now() WHERE id=$1`,[id]);
      return 'expired';
    }
    if (action==='accept') {
      bothConsented(people);
      const saved = await client.query<DiscoveryRow>('SELECT result,expires_at FROM discoveries WHERE id=$1', [request.discovery_id]);
      const discovery = saved.rows[0]?.result;
      const match = discovery?.matches.find((candidate)=>candidate.profileId===request.recipient_id && candidate.gatheringId===request.gathering_id);
      if (!discovery || !match) throw new ApiError(409,'MATCH_CHANGED','The original matching evidence is no longer available.');
      if (request.gathering_id) {
        await client.query('SELECT id FROM gatherings WHERE id=$1 FOR UPDATE', [request.gathering_id]);
      }
      await currentMatch(client,current.worldId,request.sender_id,discovery,match);
      if (request.gathering_id) {
        await client.query('INSERT INTO gathering_members(gathering_id,profile_id) VALUES($1,$2)',[request.gathering_id,request.sender_id]);
      }
      await client.query(`INSERT INTO connections(id,request_id,world_id,first_profile_id,second_profile_id) VALUES($1,$2,$3,$4,$5)`,
        [randomUUID(),id,current.worldId,request.sender_id,request.recipient_id]);
    }
    await client.query('UPDATE introduction_requests SET status=$1,responded_at=now() WHERE id=$2', [desired,id]);
  });
  if (resolution==='expired') throw new ApiError(409,'REQUEST_EXPIRED','This introduction expired before it could be accepted. Ask for a fresh introduction.');
  return loadOne(pool,current,id);
}

export async function setConsent(pool:Pool,current:Actor,input:{discoverable:boolean;introductionsAllowed:boolean}) {
  await transaction(pool,async(client)=>{
    await client.query('SELECT id FROM profiles WHERE id=$1 AND world_id=$2 FOR UPDATE',[current.profileId,current.worldId]);
    await client.query(`UPDATE profiles SET discoverable=$1,introductions_allowed=$2,consent_updated_at=now() WHERE id=$3 AND world_id=$4`,
      [input.discoverable,input.introductionsAllowed,current.profileId,current.worldId]);
    await client.query(`INSERT INTO consent_events(id,profile_id,discoverable,introductions_allowed,source) VALUES($1,$2,$3,$4,'demo_user')`,
      [randomUUID(),current.profileId,input.discoverable,input.introductionsAllowed]);
    if (!input.discoverable || !input.introductionsAllowed) {
      await client.query(`UPDATE introduction_requests SET status='cancelled',responded_at=now()
        WHERE world_id=$1 AND (sender_id=$2 OR recipient_id=$2) AND status='pending'`,[current.worldId,current.profileId]);
    }
  });
}
