import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { ApiError } from './errors.js';
import { hashToken } from './seed.js';
import type { Cafe, DemoProfile, SessionView } from '../shared/contracts.js';

export interface Actor {
  worldId: string;
  profileId: string;
  kind: 'session' | 'assistant';
  credentialHash: string;
  csrfToken: string | null;
  expiresAt: Date;
}
declare global {
  namespace Express {
    interface Request { actor?: Actor; requestId: string }
  }
}
interface CredentialRow { world_id: string; profile_id: string; csrf_token: string | null; expires_at: Date }

export async function authenticate(pool: Pool, request: Request): Promise<Actor> {
  const authorization = request.get('authorization');
  const cookie: unknown = request.cookies?.tp_session;
  const isBearer = authorization !== undefined;
  const token = isBearer && authorization?.startsWith('Bearer ') ? authorization.slice(7) : !isBearer && typeof cookie === 'string' ? cookie : '';
  if (!token || token.length > 180) throw new ApiError(401, 'AUTH_REQUIRED', 'Start the fictional demo or provide a valid user-scoped assistant token.');
  const hash = hashToken(token);
  const result = isBearer
    ? await pool.query<CredentialRow>(`SELECT t.world_id,t.profile_id,NULL::text AS csrf_token,t.expires_at
        FROM assistant_tokens t JOIN demo_worlds w ON w.id=t.world_id
        WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at>now() AND w.expires_at>now()`, [hash])
    : await pool.query<CredentialRow>(`SELECT s.world_id,s.profile_id,s.csrf_token,s.expires_at
        FROM sessions s JOIN demo_worlds w ON w.id=s.world_id
        WHERE s.token_hash=$1 AND s.expires_at>now() AND w.expires_at>now()`, [hash]);
  const row = result.rows[0];
  if (!row) throw new ApiError(401, 'SESSION_EXPIRED', 'Your demo session or assistant token has expired. Start a new fictional demo.');
  return { worldId: row.world_id, profileId: row.profile_id, kind: isBearer ? 'assistant' : 'session', credentialHash: hash, csrfToken: row.csrf_token, expiresAt: row.expires_at };
}

export function actor(request: Request): Actor {
  if (!request.actor) throw new ApiError(401, 'AUTH_REQUIRED', 'Authentication is required.');
  return request.actor;
}
export function userSession(request: Request): Actor {
  const current = actor(request);
  if (current.kind !== 'session') throw new ApiError(403, 'USER_ACTION_REQUIRED', 'This action requires the demo user interface, not an assistant token.');
  return current;
}
export function checkCsrf(request: Request) {
  const current = actor(request);
  if (current.kind === 'assistant') return;
  const supplied = Buffer.from(request.get('x-csrf-token') || '');
  const expected = Buffer.from(current.csrfToken || '');
  if (!expected.length || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ApiError(403, 'CSRF_REQUIRED', 'This action needs a current demo session. Reload the page and try again.');
  }
}
export function checkOrigin(request: Request) {
  const origin = request.get('origin');
  if (origin && origin !== `${request.protocol}://${request.get('host')}`) {
    throw new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Use the demo on its own website. External assistants should call the API server-to-server with a scoped token.');
  }
}

interface ProfileRow {
  id: string; name: string; bio: string; initials: string; color: string;
  cafe_id: string; topics: string[]; discoverable: boolean; introductions_allowed: boolean;
}
export async function getProfiles(pool: Pool, worldId: string): Promise<DemoProfile[]> {
  const result = await pool.query<ProfileRow>(`SELECT p.id,p.name,p.bio,p.initials,p.color,p.cafe_id,p.discoverable,p.introductions_allowed,
    ARRAY(SELECT i.label FROM profile_interests pi JOIN interests i ON i.slug=pi.interest_slug WHERE pi.profile_id=p.id ORDER BY i.label) AS topics
    FROM profiles p WHERE p.world_id=$1 AND p.fictional ORDER BY p.name`, [worldId]);
  return result.rows.map((p) => ({ id:p.id,name:p.name,bio:p.bio,initials:p.initials,color:p.color,cafeId:p.cafe_id,topics:p.topics,discoverable:p.discoverable,introductionsAllowed:p.introductions_allowed,fictional:true }));
}
export async function getCafes(pool: Pool): Promise<Cafe[]> {
  const result = await pool.query<Cafe>('SELECT id,name,neighborhood,city,description,atmosphere,illustration,fictional FROM cafes WHERE fictional ORDER BY name');
  return result.rows;
}
export async function sessionView(pool: Pool, current: Actor, model: string): Promise<SessionView> {
  if (current.kind !== 'session' || !current.csrfToken) throw new ApiError(403, 'USER_ACTION_REQUIRED', 'A browser demo session is required.');
  const [profiles, cafes] = await Promise.all([getProfiles(pool, current.worldId), getCafes(pool)]);
  const profile = profiles.find((p) => p.id === current.profileId);
  if (!profile) throw new ApiError(401, 'PROFILE_UNAVAILABLE', 'This fictional identity is no longer available.');
  return { worldId:current.worldId, profile, profiles, cafes, csrfToken:current.csrfToken, expiresAt:current.expiresAt.toISOString(), model, demo:true };
}
export async function requireConsent(pool: Pool, current: Pick<Actor, 'worldId' | 'profileId'>) {
  const result = await pool.query('SELECT id FROM profiles WHERE world_id=$1 AND id=$2 AND discoverable AND introductions_allowed', [current.worldId,current.profileId]);
  if (!result.rowCount) throw new ApiError(409, 'CONSENT_REQUIRED', 'Enable discovery and introduction consent for this fictional identity before continuing.');
}
export async function limitRequests(pool: Pool, bucket: string, subject: string, limit: number, seconds = 3600) {
  const result = await pool.query<{count:number}>(`INSERT INTO rate_limits(bucket,subject,window_number)
    VALUES($1,$2,floor(extract(epoch FROM now())/$3)::bigint)
    ON CONFLICT(bucket,subject,window_number) DO UPDATE SET count=rate_limits.count+1 RETURNING count`, [bucket,subject,seconds]);
  if ((result.rows[0]?.count || 0) > limit) throw new ApiError(429, 'RATE_LIMITED', 'This demo has received too many requests. Please wait before trying again.');
}
export async function createAssistantToken(pool: Pool, current: Actor, label: string) {
  const id = randomUUID();
  const token = `tp_${randomBytes(32).toString('base64url')}`;
  const expiresAt = new Date(Math.min(current.expiresAt.getTime(), Date.now() + 12 * 60 * 60_000));
  await pool.query('INSERT INTO assistant_tokens(id,token_hash,world_id,profile_id,label,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [id,hashToken(token),current.worldId,current.profileId,label,expiresAt]);
  return { id, token, expiresAt: expiresAt.toISOString() };
}
