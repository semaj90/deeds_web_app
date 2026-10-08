-- PG18 independent rollback-only negative controls. Approved test DB only.
BEGIN;
SET LOCAL statement_timeout='5000ms';
CREATE TEMP TABLE dag_attempt_fixture (
 id text PRIMARY KEY, status text NOT NULL, lease_owner text,
 expires_at timestamptz NOT NULL, generation integer NOT NULL,
 row_version integer NOT NULL, source_revision text NOT NULL
) ON COMMIT DROP;
INSERT INTO dag_attempt_fixture VALUES
 ('expired','RUNNING','worker-a',clock_timestamp()-interval '1 second',2,4,'s1'),
 ('superseded','RUNNING','worker-b',clock_timestamp()+interval '1 hour',3,5,'s2'),
 ('current','RUNNING','worker-c',clock_timestamp()+interval '1 hour',4,6,'s3');
DO $body$
DECLARE n integer;
BEGIN
 UPDATE dag_attempt_fixture SET status='SUCCEEDED'
 WHERE id='expired' AND expires_at>clock_timestamp()
 AND lease_owner='worker-a' AND generation=2 AND row_version=4 AND source_revision='s1';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'EXPIRED_LEASE_ACCEPTED'; END IF;
 UPDATE dag_attempt_fixture SET status='SUCCEEDED'
 WHERE id='superseded' AND expires_at>clock_timestamp()
 AND lease_owner='worker-b' AND generation=3 AND row_version=5 AND source_revision='s1';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'SUPERSEDED_SOURCE_ACCEPTED'; END IF;
 UPDATE dag_attempt_fixture SET status='SUCCEEDED'
 WHERE id='current' AND expires_at>clock_timestamp()
 AND lease_owner='worker-c' AND generation=3 AND row_version=6 AND source_revision='s3';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'STALE_GENERATION_ACCEPTED'; END IF;
END $body$;
SELECT json_build_object('schema','atlas.dag-stale-fixture.v1','verdict','FIXTURE_PASS',
'negativeControls',3,'persistentWrites',false)::text;
ROLLBACK;
