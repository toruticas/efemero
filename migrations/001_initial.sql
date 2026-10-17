CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY,
  clerk_id text NOT NULL UNIQUE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_-]{2,23}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY,
  owner_id text REFERENCES accounts(id),
  namespace text NOT NULL,
  slug text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','revoked','expired','exhausted')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  pending_expires_at timestamptz NOT NULL,
  max_releases integer CHECK (max_releases BETWEEN 1 AND 100),
  release_count integer NOT NULL DEFAULT 0 CHECK (release_count >= 0),
  declared_size integer NOT NULL CHECK (declared_size BETWEEN 1 AND 26218496),
  blob_path text NOT NULL UNIQUE,
  blob_url text,
  registration_record text,
  wrapped_key jsonb,
  protocol_version integer NOT NULL DEFAULT 1,
  setup_version text NOT NULL,
  management_hash text NOT NULL,
  upload_issued boolean NOT NULL DEFAULT false,
  delete_after timestamptz,
  purged_at timestamptz,
  UNIQUE (namespace, slug)
);
CREATE INDEX IF NOT EXISTS artifacts_owner ON artifacts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS artifacts_expiry ON artifacts(expires_at) WHERE purged_at IS NULL;

CREATE TABLE IF NOT EXISTS handshakes (
  id uuid PRIMARY KEY,
  artifact_id uuid NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  sealed_state text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS handshakes_expiry ON handshakes(expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  count integer NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS cleanup_jobs (
  artifact_id uuid PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,
  not_before timestamptz NOT NULL,
  leased_until timestamptz,
  attempts integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maintenance (
  key text PRIMARY KEY,
  value text NOT NULL
);
