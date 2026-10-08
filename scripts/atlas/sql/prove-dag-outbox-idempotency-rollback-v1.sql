-- Disposable PG18 scratch proof. Temporary relations and transaction rollback only.
BEGIN;
SET LOCAL statement_timeout='5000ms';
CREATE TEMP TABLE attempt_fixture (
  id text PRIMARY KEY, state text NOT NULL, lease text NOT NULL,
  generation int NOT NULL, version int NOT NULL, source_revision text NOT NULL,
  expires_at timestamptz NOT NULL
) ON COMMIT DROP;
CREATE TEMP TABLE outbox_fixture (
  event_id text PRIMARY KEY, step_id text NOT NULL, generation int NOT NULL,
  payload_digest text NOT NULL
) ON COMMIT DROP;
INSERT INTO attempt_fixture VALUES
 ('s','RUNNING','new-owner',9,3,'sr2',clock_timestamp()+interval '1 hour');
DO $$
DECLARE affected integer; events integer;
BEGIN
 -- A cancelled/previous lease must never commit.
 UPDATE attempt_fixture SET state='SUCCEEDED' WHERE id='s' AND
  state='RUNNING' AND lease='cancelled-owner' AND generation=8 AND version=2
  AND source_revision='sr2' AND expires_at>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'CANCELLED_OWNER_ACCEPTED'; END IF;
 -- Prior revision cannot commit.
 UPDATE attempt_fixture SET state='SUCCEEDED' WHERE id='s' AND
  state='RUNNING' AND lease='new-owner' AND generation=9 AND version=3
  AND source_revision='sr1' AND expires_at>clock_timestamp();
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'SUPERSEDED_REVISION_ACCEPTED'; END IF;
 -- Qualified completion and outbox are one logical SQL statement.
 WITH claimed AS (
  UPDATE attempt_fixture SET state='SUCCEEDED',version=version+1
  WHERE id='s' AND state='RUNNING' AND lease='new-owner' AND generation=9
    AND version=3 AND source_revision='sr2' AND expires_at>clock_timestamp()
  RETURNING id,generation
 ), emitted AS (
  INSERT INTO outbox_fixture(event_id,step_id,generation,payload_digest)
  SELECT 's:9:SUCCEEDED',id,generation,'sha-fixture' FROM claimed
  ON CONFLICT (event_id) DO NOTHING RETURNING event_id
 )
 SELECT count(*) INTO affected FROM emitted;
 IF affected<>1 THEN RAISE EXCEPTION 'FIRST_EVENT_NOT_EMITTED'; END IF;
 -- A repeat must neither change the terminal state nor produce another event.
 WITH claimed AS (
  UPDATE attempt_fixture SET state='SUCCEEDED',version=version+1
  WHERE id='s' AND state='RUNNING' AND lease='new-owner' AND generation=9
    AND version=3 AND source_revision='sr2' AND expires_at>clock_timestamp()
  RETURNING id,generation
 ), emitted AS (
  INSERT INTO outbox_fixture(event_id,step_id,generation,payload_digest)
  SELECT 's:9:SUCCEEDED',id,generation,'sha-fixture' FROM claimed
  ON CONFLICT (event_id) DO NOTHING RETURNING event_id
 )
 SELECT count(*) INTO affected FROM emitted;
 SELECT count(*) INTO events FROM outbox_fixture;
 IF affected<>0 OR events<>1 THEN RAISE EXCEPTION 'IDEMPOTENCY_FAILED'; END IF;
END $$;
SELECT json_build_object('schema','atlas.dag-outbox-idempotency.v1',
 'verdict','FIXTURE_PASS','events',(SELECT count(*) FROM outbox_fixture),
 'state',(SELECT state FROM attempt_fixture),'persistentWrites',false)::text;
ROLLBACK;
