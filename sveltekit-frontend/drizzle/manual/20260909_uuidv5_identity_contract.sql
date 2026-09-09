-- UUIDV5-IDENTITY-CONTRACT-01: real UUIDv5 (RFC 4122), not the SHA-256/v4-bit
-- approximation the prior gate shipped. uuid-ossp's uuid_generate_v5() is the
-- trusted, standard way to compute this in PostgreSQL 18.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- OUTBOX-AGGREGATE-INDEX-01: lookup index for the real aggregate_id (now
-- UUIDv5-derived, see packet-write-transaction-v1.ts) and the async
-- outbox-consumer scan pattern (unconsumed rows, oldest first).
CREATE INDEX IF NOT EXISTS atlas_projection_outbox_aggregate_idx
  ON atlas_projection_outbox (aggregate_type, aggregate_id);
