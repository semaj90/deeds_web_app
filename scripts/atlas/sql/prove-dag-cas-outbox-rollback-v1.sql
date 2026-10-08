-- PostgreSQL 18 scratch-only CAS/outbox proof. NO persistent writes.
-- Requires psql -X -v ON_ERROR_STOP=1; runs entirely in pg_temp and ROLLBACK.
BEGIN;
SET LOCAL statement_timeout='10000ms';
SET LOCAL lock_timeout='2000ms';
CREATE TEMP TABLE proof_steps (
 run_id text NOT NULL, step_id text NOT NULL, dag_revision text NOT NULL,
 source_revision text NOT NULL, state text NOT NULL,
 lease_id text, lease_expires_at timestamptz,
 generation integer NOT NULL DEFAULT 0, state_version integer NOT NULL DEFAULT 0,
 PRIMARY KEY (run_id, step_id)
) ON COMMIT DROP;
CREATE TEMP TABLE proof_outbox (
 event_id text PRIMARY KEY, run_id text NOT NULL, step_id text NOT NULL,
 event_kind text NOT NULL, generation integer NOT NULL
) ON COMMIT DROP;
INSERT INTO proof_steps(run_id,step_id,dag_revision,source_revision,state)
VALUES ('fixture-run','fixture-step','dag-1','source-1','READY');
DO $test$
DECLARE affected int; events int;
BEGIN
 -- First owner wins the READY->RUNNING conditional claim.
 UPDATE proof_steps SET state='RUNNING',lease_id='worker-a',
   lease_expires_at=clock_timestamp()+interval '30 seconds',
   generation=generation+1,state_version=state_version+1
 WHERE run_id='fixture-run' AND step_id='fixture-step'
 AND state='READY' AND dag_revision='dag-1' AND source_revision='source-1'
 AND generation=0 AND state_version=0;
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'CLAIM_A_FAILED'; END IF;
 -- A competing worker must get zero rows.
 UPDATE proof_steps SET lease_id='worker-b'
 WHERE run_id='fixture-run' AND step_id='fixture-step'
 AND state='READY' AND generation=0 AND state_version=0;
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'DOUBLE_CLAIM_ACCEPTED'; END IF;
 -- A stale owner must fail.
 UPDATE proof_steps SET state='SUCCEEDED'
 WHERE run_id='fixture-run' AND step_id='fixture-step'
 AND state='RUNNING' AND lease_id='worker-b' AND generation=1;
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>0 THEN RAISE EXCEPTION 'STALE_WORKER_ACCEPTED'; END IF;
 -- Qualifying completion + outbox insert in the SAME transaction.
 UPDATE proof_steps SET state='SUCCEEDED',state_version=state_version+1
 WHERE run_id='fixture-run' AND step_id='fixture-step'
 AND state='RUNNING' AND lease_id='worker-a'
 AND generation=1 AND state_version=1
 AND dag_revision='dag-1' AND source_revision='source-1'
 AND lease_expires_at>clock_timestamp();
 GET DIAGNOSTICS affected = ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'COMPLETION_FAILED'; END IF;
 INSERT INTO proof_outbox VALUES
   ('fixture-run:fixture-step:1:SUCCEEDED','fixture-run','fixture-step','SUCCEEDED',1);
 SELECT count(*) INTO events FROM proof_outbox;
 IF events<>1 THEN RAISE EXCEPTION 'OUTBOX_NOT_ATOMIC'; END IF;
 -- A duplicate idempotency key would violate the primary key; verify membership.
 IF NOT EXISTS (SELECT 1 FROM proof_outbox WHERE event_id='fixture-run:fixture-step:1:SUCCEEDED')
 THEN RAISE EXCEPTION 'EVENT_IDENTITY_MISSING'; END IF;
END $test$;
SELECT json_build_object('schema','atlas.dag-cas-outbox-scratch.v1',
 'fixtureOnly',true,'persistentWrites',false,
 'state',(SELECT state FROM proof_steps LIMIT 1),
 'generation',(SELECT generation FROM proof_steps LIMIT 1),
 'outboxEvents',(SELECT count(*) FROM proof_outbox),
 'verdict','FIXTURE_PASS')::text;
ROLLBACK;
