ALTER TABLE artifacts ADD COLUMN max_failures integer CHECK (max_failures BETWEEN 1 AND 100);
ALTER TABLE artifacts ADD COLUMN failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0);
ALTER TABLE artifacts ADD COLUMN access_count integer NOT NULL DEFAULT 0 CHECK (access_count >= 0);
ALTER TABLE artifacts DROP CONSTRAINT artifacts_state_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_state_check CHECK (state IN ('pending','ready','revoked','expired','exhausted','destroyed'));
CREATE INDEX handshakes_artifact_expiry ON handshakes(artifact_id, expires_at);
CREATE INDEX artifacts_owner_page ON artifacts(owner_id, created_at DESC, id DESC);

CREATE FUNCTION immutable_username() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    RAISE EXCEPTION 'Username is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER accounts_immutable_username BEFORE UPDATE OF username ON accounts FOR EACH ROW EXECUTE FUNCTION immutable_username();
