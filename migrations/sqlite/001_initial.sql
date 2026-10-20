CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  clerk_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE CHECK (length(username) BETWEEN 3 AND 24 AND substr(username,1,1) GLOB '[a-z]' AND username NOT GLOB '*[^a-z0-9_-]*'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TRIGGER accounts_immutable_username BEFORE UPDATE OF username ON accounts
WHEN NEW.username IS NOT OLD.username BEGIN SELECT RAISE(ABORT,'Username is immutable'); END;
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES accounts(id),
  namespace TEXT NOT NULL,
  slug TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','revoked','expired','exhausted','destroyed')),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, pending_expires_at TEXT NOT NULL,
  max_releases INTEGER CHECK (max_releases BETWEEN 1 AND 100),
  release_count INTEGER NOT NULL DEFAULT 0 CHECK (release_count>=0),
  declared_size INTEGER NOT NULL CHECK (declared_size BETWEEN 1 AND 26218496),
  blob_path TEXT NOT NULL UNIQUE, blob_url TEXT,
  registration_record TEXT, wrapped_key TEXT,
  protocol_version INTEGER NOT NULL DEFAULT 1,
  setup_version TEXT NOT NULL, management_hash TEXT NOT NULL,
  upload_issued INTEGER NOT NULL DEFAULT 0 CHECK (upload_issued IN (0,1)),
  delete_after TEXT, purged_at TEXT,
  max_failures INTEGER CHECK (max_failures BETWEEN 1 AND 100),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count>=0),
  access_count INTEGER NOT NULL DEFAULT 0 CHECK (access_count>=0),
  UNIQUE(namespace,slug)
);
CREATE INDEX artifacts_owner_page ON artifacts(owner_id,created_at DESC,id DESC);
CREATE INDEX artifacts_expiry ON artifacts(expires_at) WHERE purged_at IS NULL;
CREATE TABLE handshakes (id TEXT PRIMARY KEY,artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,sealed_state TEXT NOT NULL,expires_at TEXT NOT NULL);
CREATE INDEX handshakes_expiry ON handshakes(expires_at);
CREATE INDEX handshakes_artifact_expiry ON handshakes(artifact_id,expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at TEXT NOT NULL);
CREATE TABLE cleanup_jobs (artifact_id TEXT PRIMARY KEY REFERENCES artifacts(id) ON DELETE CASCADE,not_before TEXT NOT NULL,leased_until TEXT,attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE maintenance (key TEXT PRIMARY KEY,value TEXT NOT NULL);
