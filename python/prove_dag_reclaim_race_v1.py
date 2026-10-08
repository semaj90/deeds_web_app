#!/usr/bin/env python3
"""Disposable PG18 two-session expired-lease race; no application tables.

Two real connections compete for one expired lease. Connection-level commit
makes the fencing generation durable in scratch only; cleanup drops schema.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import json
import os
import uuid

def prove(dsn: str) -> dict:
    import psycopg
    from psycopg import sql
    schema = "atlas_reclaim_" + uuid.uuid4().hex[:16]
    tbl = sql.Identifier(schema, "attempt")
    with psycopg.connect(dsn, autocommit=True) as admin:
        version = int(admin.execute("SHOW server_version_num").fetchone()[0])
        if not 180000 <= version < 190000:
            raise RuntimeError("PG18_REQUIRED")
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
    try:
        with psycopg.connect(dsn, autocommit=True) as admin:
            admin.execute(sql.SQL("""CREATE TABLE {} (
                id text PRIMARY KEY, status text NOT NULL, lease_owner text NOT NULL,
                lease_expires_at timestamptz NOT NULL, generation int NOT NULL,
                version int NOT NULL, source_revision text NOT NULL
            )""").format(tbl))
            admin.execute(sql.SQL("""INSERT INTO {} VALUES
                ('step','RUNNING','dead',clock_timestamp()-interval '10 seconds',7,4,'source-r1')
            """).format(tbl))
        gate = Barrier(2)
        def attempt(owner: str):
            with psycopg.connect(dsn, autocommit=True) as conn:
                conn.execute("SET lock_timeout='5000ms'")
                gate.wait(timeout=10)
                with conn.transaction():
                    rows = conn.execute(sql.SQL("""UPDATE {} SET lease_owner=%s,
                        lease_expires_at=clock_timestamp()+interval '60 seconds',
                        generation=generation+1, version=version+1
                        WHERE id='step' AND status='RUNNING'
                          AND lease_expires_at<clock_timestamp()
                          AND generation=7 AND version=4 AND source_revision='source-r1'
                        RETURNING generation,version""").format(tbl),(owner,)).fetchall()
                return (owner,rows)
        with ThreadPoolExecutor(max_workers=2) as pool:
            a=pool.submit(attempt,"worker-a")
            b=pool.submit(attempt,"worker-b")
            outcomes=[a.result(timeout=20),b.result(timeout=20)]
        winners=[owner for owner,rows in outcomes if rows==[(8,5)]]
        if len(winners)!=1 or any(rows and rows!=[(8,5)] for _,rows in outcomes):
            raise AssertionError("RACE_WINNER_COUNT_INVALID")
        winner=winners[0]
        with psycopg.connect(dsn, autocommit=True) as conn:
            stale=conn.execute(sql.SQL("""UPDATE {} SET status='SUCCEEDED'
                WHERE id='step' AND lease_owner='dead' AND generation=7 AND version=4
                RETURNING id""").format(tbl)).fetchall()
            wrong_revision=conn.execute(sql.SQL("""UPDATE {} SET status='SUCCEEDED'
                WHERE id='step' AND lease_owner=%s AND generation=8 AND version=5
                  AND source_revision='source-OLD' RETURNING id""").format(tbl),(winner,)).fetchall()
            current=conn.execute(sql.SQL("""SELECT lease_owner,generation,version,status
                FROM {} WHERE id='step'""").format(tbl)).fetchone()
        if stale or wrong_revision or current!=(winner,8,5,'RUNNING'):
            raise AssertionError("STALE_GENERATION_OR_REVISION_PROMOTED")
        return dict(schema="atlas.pg18-reclaim-race.v1",verdict="TWO_SESSION_RECLAIM_PASS",
                    postgresVersion=version,winningOwner=winner,
                    qualifiedClaims=1,staleWorkerRejected=True,
                    staleSourceRejected=True,finalGeneration=8,
                    applicationTablesTouched=False)
    finally:
        with psycopg.connect(dsn,autocommit=True) as admin:
            admin.execute(sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(sql.Identifier(schema)))

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--ack-disposable-test-db",action="store_true")
    p.add_argument("--dsn-env",default="ATLAS_DISPOSABLE_PG_DSN")
    args=p.parse_args()
    if not args.ack_disposable_test_db:p.error("Requires --ack-disposable-test-db")
    dsn=os.environ.get(args.dsn_env)
    if not dsn:p.error("Missing disposable DB DSN")
    print(json.dumps(prove(dsn),sort_keys=True))
