-- Parent Atlas ActionKey single-flight leases.
--
-- This table is NOT an artifact registry and does not own artifact identity.
-- It only prevents duplicate at-least-once deliveries from concurrently
-- executing the same expensive ActionKey. fencing_token is monotonic per key;
-- workers must include the token when renewing/releasing and should persist it
-- in any execution receipt produced under the lease.

CREATE TABLE IF NOT EXISTS atlas_action_leases (
  action_key      text        PRIMARY KEY,
  holder_id       text        NOT NULL,
  fencing_token   bigint      NOT NULL DEFAULT 1 CHECK (fencing_token > 0),
  acquired_at     timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_action_leases_expires_at
  ON atlas_action_leases (expires_at);
