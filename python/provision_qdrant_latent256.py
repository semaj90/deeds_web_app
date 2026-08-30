"""Provisions the codebase_chunks_latent256 Qdrant collection and backfills it from the
already-populated Postgres codebase_chunk_index.latent_256 column.

Does NOT recompute latent_256 -- reads the value Postgres already has (backfill_latent_256.py
populated it via a real model forward pass). This script's only job is the Postgres -> Qdrant
mirror step, per this repo's canonical packet truth flow (Postgres first, mirrors after).

Follows this repo's Qdrant API hard rule (root CLAUDE.md, "Qdrant API Strategy"): REST API with
the vectors kept in memory and serialized once per batch, never shell/docker exec/curl for bulk
vector payloads (that's the documented ENOBUFS failure mode).

Point IDs are the codebase_chunk_index UUID directly -- Qdrant accepts UUID strings as point ids
natively, so no separate ID-mapping table is needed for a 1:1 mirror.

Payload carries derived_from + latent_256_checkpoint_revision so a future retrain with a
different checkpoint is detectable rather than silently mixed into the same collection, matching
the pattern already used by codebase_chunks_512's projected_from_768d marker.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time

import psycopg2
import psycopg2.extras
import requests

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
DEFAULT_QDRANT_URL = "http://127.0.0.1:6333"
COLLECTION_NAME = "codebase_chunks_latent256"


def ensure_collection(qdrant_url: str) -> dict:
    resp = requests.get(f"{qdrant_url}/collections/{COLLECTION_NAME}", timeout=10)
    if resp.status_code == 200:
        return {"event": "collection_exists", "collection": COLLECTION_NAME}
    resp = requests.put(
        f"{qdrant_url}/collections/{COLLECTION_NAME}",
        json={"vectors": {"size": 256, "distance": "Cosine"}},
        timeout=30,
    )
    resp.raise_for_status()
    return {"event": "collection_created", "collection": COLLECTION_NAME, "response": resp.json()}


def fetch_batch(conn, batch_size: int, last_id: str | None) -> list[dict]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if last_id is None:
            cur.execute(
                """
                SELECT id::text AS id, relative_path AS source_ref, content_hash, latent_256, latent_256_checkpoint_revision
                FROM codebase_chunk_index
                WHERE latent_256 IS NOT NULL
                ORDER BY id
                LIMIT %s
                """,
                (batch_size,),
            )
        else:
            cur.execute(
                """
                SELECT id::text AS id, relative_path AS source_ref, content_hash, latent_256, latent_256_checkpoint_revision
                FROM codebase_chunk_index
                WHERE latent_256 IS NOT NULL AND id::text > %s
                ORDER BY id
                LIMIT %s
                """,
                (last_id, batch_size),
            )
        return cur.fetchall()


def parse_halfvec(value: str) -> list[float]:
    return [float(x) for x in value.strip("[]").split(",")]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", DEFAULT_QDRANT_URL))
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=0, help="0 = all eligible rows")
    parser.add_argument("--apply", action="store_true", help="write to Qdrant; default is dry-run (collection ensure only)")
    args = parser.parse_args()

    ensure_result = ensure_collection(args.qdrant_url)
    print(json.dumps(ensure_result))

    conn = psycopg2.connect(args.database_url)
    total_processed = 0
    total_upserted = 0
    last_id = None
    started_at = time.time()

    try:
        while True:
            rows = fetch_batch(conn, args.batch_size, last_id)
            if not rows:
                break
            if args.limit and total_processed + len(rows) > args.limit:
                rows = rows[: args.limit - total_processed]
            if not rows:
                break
            last_id = rows[-1]["id"]

            if args.apply:
                points = [
                    {
                        "id": row["id"],
                        "vector": parse_halfvec(row["latent_256"]),
                        "payload": {
                            "chunk_id": row["id"],
                            "source_ref": row["source_ref"],
                            "content_hash": row["content_hash"],
                            "derived_from": "latent_256",
                            "latent_256_checkpoint_revision": row["latent_256_checkpoint_revision"],
                            "canonical_authority": False,
                        },
                    }
                    for row in rows
                ]
                resp = requests.put(
                    f"{args.qdrant_url}/collections/{COLLECTION_NAME}/points",
                    json={"points": points},
                    timeout=60,
                )
                resp.raise_for_status()
                total_upserted += len(rows)

            total_processed += len(rows)
            print(json.dumps({
                "event": "batch_complete",
                "processed": total_processed,
                "upserted": total_upserted,
                "mode": "APPLY" if args.apply else "DRY_RUN",
            }))

            if args.limit and total_processed >= args.limit:
                break
            if not args.apply:
                break
    finally:
        conn.close()

    duration_s = time.time() - started_at
    print(json.dumps({
        "status": "QDRANT_LATENT256_APPLY_PROVEN" if args.apply else "QDRANT_LATENT256_DRY_RUN_PROVEN",
        "mode": "APPLY" if args.apply else "DRY_RUN",
        "collection": COLLECTION_NAME,
        "rows_processed": total_processed,
        "rows_upserted": total_upserted,
        "duration_s": duration_s,
    }))


if __name__ == "__main__":
    main()
