#!/usr/bin/env python3
"""Two-connection PostgreSQL contention proof using a private test schema.
Requires an approved DISPOSABLE test database and psycopg 3. Never use on production.
Creates scratch schema/tables, commits fixture claims, then drops schema in finally.
No application tables are read or written. Distinct connections + barrier prove contention.
"""
from __future__ import annotations
import argparse
import concurrent.futures
import json
import os
import threading
import uuid

def prove(dsn: str) -> dict:
    import psycopg
    schema = "atlas_dag_probe_" + uuid.uuid4().hex[:16]
    quoted = '"' + schema + '"'
    with psycopg.connect(dsn, autocommit=True) as setup:
        setup.execute("SET statement_timeout = '10000ms'")
        setup.execute(f"CREATE SCHEMA {quoted}")
    try:
        with psycopg.connect(dsn) as setup:
            setup.execute(f"""CREATE TABLE {quoted}.steps (
                run_id text PRIMARY KEY, status text NOT NULL, lease_id text,
                lease_expires_at timestamptz, generation integer NOT NULL,
                version integer NOT NULL, dag_revision text NOT NULL,
                source_revision text NOT NULL)""")
            setup.execute(f"""CREATE TABLE {quoted}.outbox (
                event_id text PRIMARY KEY, generation integer NOT NULL)""")
            setup.execute(f"""INSERT INTO {quoted}.steps
                (run_id,status,generation,version,dag_revision,source_revision)
                VALUES ('fixture','READY',0,0,'dag1','source1')""")
            setup.commit()
        barrier = threading.Barrier(2)
        def worker(owner: str):
            with psycopg.connect(dsn) as conn:
                conn.execute("SET lock_timeout = '3000ms'")
                barrier.wait(timeout=5)
                rows = conn.execute(f"""UPDATE {quoted}.steps
                    SET status='RUNNING', lease_id=%s,
                    lease_expires_at=clock_timestamp()+interval '30 seconds',
                    generation=generation+1,version=version+1
                    WHERE run_id='fixture' AND status='READY'
                    AND generation=0 AND version=0
                    AND dag_revision='dag1' AND source_revision='source1'
                    RETURNING lease_id,generation""", (owner,)).fetchall()
                conn.commit()
                return owner, rows
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(worker, x) for x in ("worker-a", "worker-b")]
            claims = [f.result(timeout=15) for f in futures]
        winners = [(owner, rows[0][1]) for owner, rows in claims if rows]
        assert len(winners) == 1, f"EXPECTED_ONE_WINNER:{claims}"
        winner, generation = winners[0]
        loser = "worker-b" if winner == "worker-a" else "worker-a"
        with psycopg.connect(dsn) as conn:
            stale = conn.execute(f"""UPDATE {quoted}.steps SET status='SUCCEEDED'
                WHERE run_id='fixture' AND status='RUNNING' AND lease_id=%s
                AND generation=%s AND version=1
                RETURNING run_id""", (loser, generation)).fetchall()
            assert not stale, "STALE_WORKER_PROMOTED"
            # Atomic completion + outbox. Rollback injected failure first.
            try:
                with conn.transaction():
                    current = conn.execute(f"""UPDATE {quoted}.steps
                        SET status='SUCCEEDED', version=version+1
                        WHERE run_id='fixture' AND status='RUNNING'
                        AND lease_id=%s AND generation=%s AND version=1
                        AND lease_expires_at>clock_timestamp()
                        RETURNING run_id""", (winner,generation)).fetchall()
                    assert len(current)==1, "WINNER_COMPLETION_FAILED"
                    conn.execute(f"INSERT INTO {quoted}.outbox VALUES ('finish-1',%s)",(generation,))
                    raise RuntimeError("INJECT_ROLLBACK")
            except RuntimeError as exc:
                assert str(exc)=="INJECT_ROLLBACK"
            state_after_rollback = conn.execute(f"SELECT status FROM {quoted}.steps").fetchone()[0]
            event_count_after_rollback = conn.execute(f"SELECT count(*) FROM {quoted}.outbox").fetchone()[0]
            assert state_after_rollback=="RUNNING" and event_count_after_rollback==0, "OUTBOX_ATOMICITY_FAILED"
            with conn.transaction():
                completed = conn.execute(f"""UPDATE {quoted}.steps
                    SET status='SUCCEEDED',version=version+1
                    WHERE run_id='fixture' AND status='RUNNING'
                    AND lease_id=%s AND generation=%s AND version=1
                    AND lease_expires_at>clock_timestamp() RETURNING run_id""",(winner,generation)).fetchall()
                assert len(completed)==1
                conn.execute(f"INSERT INTO {quoted}.outbox VALUES ('finish-1',%s)",(generation,))
            conn.commit()
            final = conn.execute(f"SELECT status,version FROM {quoted}.steps").fetchone()
            events = conn.execute(f"SELECT count(*) FROM {quoted}.outbox").fetchone()[0]
            assert final==("SUCCEEDED",2) and events==1, "FINAL_READBACK_FAILED"
        return {"schema":"atlas.dag-concurrent-claim-proof.v1","verdict":"TWO_SESSION_FIXTURE_PASS",
                "winner":winner,"loser":loser,"generation":generation,
                "staleReject":True,"injectedRollbackAtomic":True,
                "outboxEvents":events,"applicationTablesTouched":False}
    finally:
        with psycopg.connect(dsn, autocommit=True) as cleanup:
            cleanup.execute(f"DROP SCHEMA IF EXISTS {quoted} CASCADE")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--dsn-env",default="ATLAS_DISPOSABLE_PG_DSN")
    parser.add_argument("--ack-disposable-test-db",action="store_true")
    args=parser.parse_args()
    if not args.ack_disposable_test_db:
        parser.error("explicit --ack-disposable-test-db required")
    dsn=os.environ.get(args.dsn_env)
    if not dsn: parser.error("missing disposable DSN environment variable")
    print(json.dumps(prove(dsn),sort_keys=True))
