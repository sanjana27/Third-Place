import { z } from 'zod';

export const goals = ['exchange_ideas', 'make_friends', 'collaborate', 'shared_activity'] as const;
export const kinds = ['one_to_one', 'small_group', 'event'] as const;
export const activities = ['coffee', 'conversation', 'running', 'walking', 'reading', 'any'] as const;
export const goalSchema = z.enum(goals);
export type Goal = z.infer<typeof goalSchema>;
export type Kind = (typeof kinds)[number];
export const goalLabels: Record<Goal, string> = {
  exchange_ideas: 'Exchange ideas',
  make_friends: 'Make new friends',
  collaborate: 'Build something together',
  shared_activity: 'Share an activity',
};
export const kindLabels: Record<Kind, string> = {
  one_to_one: 'One-to-one conversation',
  small_group: 'A small group',
  event: 'A community event',
};

export const locationSchema = z.object({
  cafeId: z.string().uuid().optional(),
  coarseLocation: z.string().trim().min(2).max(100).optional(),
}).strict().refine((v) => Boolean(v.cafeId) !== Boolean(v.coarseLocation), {
  message: 'Choose one cafe or one coarse location.',
});
export type PlaceInput = z.infer<typeof locationSchema>;

export const intentSchema = z.object({
  topics: z.array(z.string().trim().min(1).max(60)).max(8),
  activity: z.enum(activities),
  goal: goalSchema,
  kind: z.enum(kinds),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timeLabel: z.string().min(1).max(100),
}).strict();
export type ConnectionIntent = z.infer<typeof intentSchema>;

export const parseRequestSchema = z.object({
  message: z.string().trim().min(8).max(600),
  location: locationSchema,
  timeZone: z.string().min(1).max(80).refine((value) => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
    catch { return false; }
  }, 'Use a valid IANA time zone.'),
  goal: goalSchema.optional(),
}).strict();
export const discoveryRequestSchema = z.object({
  intentId: z.string().uuid(),
  goal: goalSchema,
}).strict();
export const introductionSchema = z.object({
  discoveryId: z.string().uuid(),
  matchId: z.string().uuid(),
  message: z.string().trim().min(1).max(400),
}).strict();
export const responseSchema = z.object({
  action: z.enum(['accept', 'decline', 'cancel']),
}).strict();
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';

export interface Cafe {
  id: string;
  name: string;
  neighborhood: string;
  city: string;
  description: string;
  atmosphere: string;
  illustration: 'arch' | 'books' | 'plants';
  fictional: true;
}
export interface DemoProfile {
  id: string;
  name: string;
  bio: string;
  initials: string;
  color: string;
  topics: string[];
  cafeId: string;
  discoverable: boolean;
  introductionsAllowed: boolean;
  fictional: true;
}
export interface SessionView {
  worldId: string;
  profile: DemoProfile;
  profiles: DemoProfile[];
  cafes: Cafe[];
  csrfToken: string;
  expiresAt: string;
  model: string;
  demo: true;
}
export interface IntentView {
  id: string;
  message: string;
  intent: ConnectionIntent;
  location: PlaceInput;
  locationLabel: string;
  model: string;
}
export interface EvidenceFact { id: string; text: string }
export interface MatchCard {
  id: string;
  profileId: string;
  gatheringId: string | null;
  kind: Kind;
  name: string;
  initials: string;
  color: string;
  bio: string;
  topics: string[];
  sharedTopics: string[];
  cafeName: string;
  cafeId: string;
  location: string;
  explanation: string;
  icebreaker: string;
  evidence: EvidenceFact[];
  availability: string;
  gatheringTitle: string | null;
  gatheringTime: string | null;
  seatsRemaining: number | null;
  fictional: true;
}
export interface DiscoveryView {
  id: string;
  intent: IntentView;
  matches: MatchCard[];
  summary: string;
  model: string;
  createdAt: string;
  demo: true;
}
export interface IntroductionView {
  id: string;
  sender: Pick<DemoProfile, 'id' | 'name' | 'initials' | 'color'>;
  recipient: Pick<DemoProfile, 'id' | 'name' | 'initials' | 'color'>;
  status: RequestStatus;
  direction: 'incoming' | 'outgoing';
  message: string;
  icebreaker: string;
  cafeName: string;
  gatheringTitle: string | null;
  createdAt: string;
  respondedAt: string | null;
  connectionId: string | null;
  fictional: true;
}
export interface ApiErrorBody {
  error: { code: string; message: string; requestId: string };
}
