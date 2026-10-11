import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './db.js';
import type { Goal } from '../shared/contracts.js';

export const hashToken = (value: string) => createHash('sha256').update(value).digest('hex');
export const cafes = [
  { id: 'c1000000-0000-4000-8000-000000000001', name: 'Common Ground', neighborhood: 'Jubilee Hills', city: 'Hyderabad', description: 'Good coffee. Long tables. Room for a new perspective.', atmosphere: 'Easy conversations', illustration: 'arch' },
  { id: 'c1000000-0000-4000-8000-000000000002', name: 'Paperback Cafe', neighborhood: 'Banjara Hills', city: 'Hyderabad', description: 'A quiet corner for well-loved books and unexpected ideas.', atmosphere: 'Slow afternoons', illustration: 'books' },
  { id: 'c1000000-0000-4000-8000-000000000003', name: 'The Green Room', neighborhood: 'Gachibowli', city: 'Hyderabad', description: 'Leafy windows, a morning brew, and your next walking companion.', atmosphere: 'A breath of fresh air', illustration: 'plants' },
] as const;
export const interestCatalog = [
  ['ai', 'AI'], ['startups', 'Startups'], ['product', 'Product design'], ['technology', 'Technology'],
  ['books', 'Books'], ['philosophy', 'Philosophy'], ['running', 'Running'], ['outdoors', 'Outdoors'],
  ['coffee', 'Coffee'], ['photography', 'Photography'], ['art', 'Art'], ['music', 'Music'],
  ['climate', 'Climate'], ['writing', 'Writing'], ['community', 'Community'],
] as const;

export async function seedCatalog(client: PoolClient) {
  for (const cafe of cafes) {
    await client.query(`INSERT INTO cafes(id,name,neighborhood,city,description,atmosphere,illustration)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,
    [cafe.id, cafe.name, cafe.neighborhood, cafe.city, cafe.description, cafe.atmosphere, cafe.illustration]);
  }
  for (const [slug, label] of interestCatalog) {
    await client.query('INSERT INTO interests(slug,label) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING', [slug, label]);
  }
}

interface SeedPerson {
  key: string; name: string; initials: string; bio: string; color: string; cafe: number;
  topics: string[]; goals: Goal[]; activities: string[]; optIn?: boolean; expired?: boolean;
}
const people: SeedPerson[] = [
  { key: 'riya', name: 'Riya', initials: 'RI', color: 'clay', cafe: 0, bio: 'Curious about good ideas, good books, and the people behind them.', topics: ['ai','startups','product','books','running','community'], goals: ['exchange_ideas','make_friends','collaborate','shared_activity'], activities: ['any','coffee','conversation','running','walking','reading'] },
  { key: 'samir', name: 'Samir', initials: 'SA', color: 'sage', cafe: 0, bio: 'Always up for comparing notes on AI and early-stage ideas.', topics: ['ai','startups','product','coffee'], goals: ['exchange_ideas','collaborate','make_friends'], activities: ['coffee','conversation'] },
  { key: 'kavya', name: 'Kavya', initials: 'KA', color: 'gold', cafe: 0, bio: 'Drawn to thoughtful products and the conversations that start them.', topics: ['ai','startups','art','technology'], goals: ['exchange_ideas','collaborate','make_friends'], activities: ['coffee','conversation'] },
  { key: 'mira', name: 'Mira', initials: 'MI', color: 'rose', cafe: 0, bio: 'Usually carrying a book and at least one question without an easy answer.', topics: ['books','philosophy','writing','coffee'], goals: ['exchange_ideas','make_friends'], activities: ['reading','conversation','coffee'] },
  { key: 'dev', name: 'Dev', initials: 'DE', color: 'blue', cafe: 0, bio: 'A fan of easy runs, quiet trails, and post-run coffee.', topics: ['running','outdoors','photography','coffee'], goals: ['make_friends','shared_activity'], activities: ['running','walking','coffee'] },
  { key: 'neha', name: 'Neha', initials: 'NE', color: 'sage', cafe: 2, bio: 'Happiest finding a new route with someone who enjoys being outside.', topics: ['running','outdoors','community','coffee'], goals: ['make_friends','shared_activity'], activities: ['running','walking','coffee'] },
  { key: 'ishan', name: 'Ishan', initials: 'IS', color: 'gold', cafe: 0, bio: 'A fictional profile with discovery switched off for the consent demo.', topics: ['ai','startups'], goals: ['exchange_ideas'], activities: ['coffee'], optIn: false },
  { key: 'tara', name: 'Tara', initials: 'TA', color: 'rose', cafe: 0, bio: 'A fictional profile whose sample availability has already ended.', topics: ['ai','startups'], goals: ['exchange_ideas'], activities: ['coffee'], expired: true },
];

export async function createDemoWorld(pool: Pool) {
  const token = randomBytes(32).toString('base64url');
  const csrfToken = randomBytes(24).toString('base64url');
  const worldId = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60_000);
  const profileId = await transaction(pool, async (client) => {
    await seedCatalog(client);
    await client.query('INSERT INTO demo_worlds(id,expires_at) VALUES($1,$2)', [worldId, expiresAt]);
    const ids = new Map<string, string>();
    for (const person of people) {
      const id = randomUUID();
      ids.set(person.key, id);
      const cafe = cafes[person.cafe];
      if (!cafe) throw new Error('Invalid fictional cafe seed.');
      const optedIn = person.optIn !== false;
      await client.query(`INSERT INTO profiles(id,world_id,name,bio,initials,color,cafe_id,coarse_location,discoverable,introductions_allowed)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,
      [id,worldId,person.name,person.bio,person.initials,person.color,cafe.id,cafe.neighborhood,optedIn]);
      for (const topic of person.topics) await client.query('INSERT INTO profile_interests VALUES($1,$2)', [id,topic]);
      for (const goal of person.goals) await client.query('INSERT INTO profile_goals VALUES($1,$2)', [id,goal]);
      for (const activity of person.activities) await client.query('INSERT INTO profile_activities VALUES($1,$2)', [id,activity]);
      const start = new Date(now.getTime() - (person.expired ? 120 : 5) * 60_000);
      const end = new Date(now.getTime() + (person.expired ? -60 : 12 * 60) * 60_000);
      await client.query('INSERT INTO availability(id,profile_id,starts_at,ends_at) VALUES($1,$2,$3,$4)', [randomUUID(),id,start,end]);
      await client.query(`INSERT INTO consent_events(id,profile_id,discoverable,introductions_allowed,source)
        VALUES($1,$2,$3,$3,'fictional_seed')`, [randomUUID(),id,optedIn]);
    }
    const groups = [
      { host: 'mira', kind: 'small_group', cafe: 0, title: 'One book. A few big questions.', description: 'A small, fictional reading circle for books and philosophy.', topics: ['books','philosophy'], goal: 'exchange_ideas', activity: 'reading', capacity: 4, minutes: 45 },
      { host: 'samir', kind: 'small_group', cafe: 0, title: 'Ideas over a flat white', description: 'A fictional small group comparing AI and startup ideas.', topics: ['ai','startups'], goal: 'exchange_ideas', activity: 'coffee', capacity: 4, minutes: 30 },
      { host: 'kavya', kind: 'event', cafe: 0, title: 'The builders table', description: 'A fictional cafe meetup for curious people and early-stage ideas.', topics: ['ai','startups','community'], goal: 'exchange_ideas', activity: 'coffee', capacity: 8, minutes: 60 },
      { host: 'neha', kind: 'event', cafe: 2, title: 'A little run, a little coffee', description: 'A fictional easy-paced run starting at The Green Room.', topics: ['running','outdoors','community'], goal: 'shared_activity', activity: 'running', capacity: 6, minutes: 60 },
    ];
    for (const group of groups) {
      const id = randomUUID();
      const host = ids.get(group.host);
      const cafe = cafes[group.cafe];
      if (!host || !cafe) throw new Error('Invalid fictional group seed.');
      await client.query(`INSERT INTO gatherings(id,world_id,host_id,cafe_id,kind,title,description,goal,activity,starts_at,ends_at,capacity)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id,worldId,host,cafe.id,group.kind,group.title,group.description,group.goal,group.activity,
        new Date(now.getTime()+group.minutes*60_000),new Date(now.getTime()+(group.minutes+90)*60_000),group.capacity]);
      await client.query('INSERT INTO gathering_members VALUES($1,$2)', [id,host]);
      for (const topic of group.topics) await client.query('INSERT INTO gathering_interests VALUES($1,$2)', [id,topic]);
    }
    const profileId = ids.get('riya');
    if (!profileId) throw new Error('Default fictional identity was not seeded.');
    await client.query('INSERT INTO sessions(token_hash,world_id,profile_id,csrf_token,expires_at) VALUES($1,$2,$3,$4,$5)',
      [hashToken(token),worldId,profileId,csrfToken,expiresAt]);
    return profileId;
  });
  return { token, expiresAt, worldId, profileId, csrfToken };
}
