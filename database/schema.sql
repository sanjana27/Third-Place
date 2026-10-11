CREATE SCHEMA IF NOT EXISTS third_place;
SET search_path TO third_place, public;

CREATE TABLE IF NOT EXISTS demo_worlds (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cafes (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  neighborhood text NOT NULL,
  city text NOT NULL,
  description text NOT NULL,
  atmosphere text NOT NULL,
  illustration text NOT NULL CHECK (illustration IN ('arch', 'books', 'plants')),
  fictional boolean NOT NULL DEFAULT true CHECK (fictional)
);

CREATE TABLE IF NOT EXISTS interests (
  slug text PRIMARY KEY,
  label text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text NOT NULL,
  initials text NOT NULL,
  color text NOT NULL CHECK (color IN ('sage', 'clay', 'gold', 'rose', 'blue')),
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  coarse_location text NOT NULL,
  discoverable boolean NOT NULL DEFAULT false,
  introductions_allowed boolean NOT NULL DEFAULT false,
  consent_updated_at timestamptz NOT NULL DEFAULT now(),
  fictional boolean NOT NULL DEFAULT true CHECK (fictional),
  UNIQUE (world_id, id)
);

CREATE TABLE IF NOT EXISTS profile_interests (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  interest_slug text NOT NULL REFERENCES interests(slug),
  PRIMARY KEY (profile_id, interest_slug)
);
CREATE TABLE IF NOT EXISTS profile_goals (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal text NOT NULL CHECK (goal IN ('exchange_ideas', 'make_friends', 'collaborate', 'shared_activity')),
  PRIMARY KEY (profile_id, goal)
);
CREATE TABLE IF NOT EXISTS profile_activities (
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity text NOT NULL CHECK (activity IN ('coffee', 'conversation', 'running', 'walking', 'reading', 'any')),
  PRIMARY KEY (profile_id, activity)
);
CREATE TABLE IF NOT EXISTS availability (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS availability_profile_window ON availability(profile_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS consent_events (
  id uuid PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  discoverable boolean NOT NULL,
  introductions_allowed boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('fictional_seed', 'demo_user')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  csrf_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (world_id, profile_id) REFERENCES profiles(world_id, id)
);
CREATE TABLE IF NOT EXISTS assistant_tokens (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  FOREIGN KEY (world_id, profile_id) REFERENCES profiles(world_id, id)
);

CREATE TABLE IF NOT EXISTS gatherings (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  kind text NOT NULL CHECK (kind IN ('small_group', 'event')),
  title text NOT NULL,
  description text NOT NULL,
  goal text NOT NULL CHECK (goal IN ('exchange_ideas', 'make_friends', 'collaborate', 'shared_activity')),
  activity text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 12),
  open boolean NOT NULL DEFAULT true,
  fictional boolean NOT NULL DEFAULT true CHECK (fictional),
  CHECK (ends_at > starts_at),
  FOREIGN KEY (world_id, host_id) REFERENCES profiles(world_id, id)
);
CREATE TABLE IF NOT EXISTS gathering_interests (
  gathering_id uuid NOT NULL REFERENCES gatherings(id) ON DELETE CASCADE,
  interest_slug text NOT NULL REFERENCES interests(slug),
  PRIMARY KEY (gathering_id, interest_slug)
);
CREATE TABLE IF NOT EXISTS gathering_members (
  gathering_id uuid NOT NULL REFERENCES gatherings(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (gathering_id, profile_id)
);

CREATE TABLE IF NOT EXISTS intents (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  message text NOT NULL CHECK (length(message) <= 600),
  parsed jsonb NOT NULL,
  location jsonb NOT NULL,
  location_label text NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (world_id, profile_id) REFERENCES profiles(world_id, id)
);
CREATE TABLE IF NOT EXISTS discoveries (
  id uuid PRIMARY KEY,
  intent_id uuid NOT NULL REFERENCES intents(id),
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (world_id, profile_id) REFERENCES profiles(world_id, id)
);

CREATE TABLE IF NOT EXISTS introduction_requests (
  id uuid PRIMARY KEY,
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid NOT NULL,
  discovery_id uuid NOT NULL REFERENCES discoveries(id),
  gathering_id uuid REFERENCES gatherings(id),
  cafe_id uuid NOT NULL REFERENCES cafes(id),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 400),
  icebreaker text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  CHECK (sender_id <> recipient_id),
  FOREIGN KEY (world_id, sender_id) REFERENCES profiles(world_id, id),
  FOREIGN KEY (world_id, recipient_id) REFERENCES profiles(world_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_introduction_per_pair ON introduction_requests
  (world_id, LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id),
   COALESCE(gathering_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS introduction_inbox ON introduction_requests(world_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS introduction_outbox ON introduction_requests(world_id, sender_id, created_at DESC);

CREATE TABLE IF NOT EXISTS connections (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE REFERENCES introduction_requests(id),
  world_id uuid NOT NULL REFERENCES demo_worlds(id) ON DELETE CASCADE,
  first_profile_id uuid NOT NULL,
  second_profile_id uuid NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  CHECK (first_profile_id <> second_profile_id),
  FOREIGN KEY (world_id, first_profile_id) REFERENCES profiles(world_id, id),
  FOREIGN KEY (world_id, second_profile_id) REFERENCES profiles(world_id, id)
);
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket text NOT NULL,
  subject text NOT NULL,
  window_number bigint NOT NULL,
  count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, subject, window_number)
);
