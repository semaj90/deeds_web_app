#!/usr/bin/env python3
"""
Push legal_glossary rows (with embeddings) from PostgreSQL → Qdrant.

Creates/recreates the `legal_glossary` collection (768-dim, cosine) and upserts
every row that has a non-null embedding vector.

Usage:
    python scripts/index_glossary_qdrant.py           # default: localhost
    python scripts/index_glossary_qdrant.py --recreate  # drop + recreate collection

Requirements:
    pip install psycopg2-binary qdrant-client
"""

import argparse
import json
import sys

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary")

try:
    from qdrant_client import QdrantClient
    from qdrant_client.models import (
        Distance,
        PointStruct,
        VectorParams,
    )
except ImportError:
    sys.exit("qdrant-client not installed. Run: pip install qdrant-client")


# ── Config ──────────────────────────────────────────────────────────────────

PG_DSN = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION = "legal_glossary"
VECTOR_DIM = 768
BATCH_SIZE = 100


def parse_pg_vector(raw):
    """Parse pgvector text representation '[0.1,0.2,...]' → list[float]."""
    if raw is None:
        return None
    if isinstance(raw, (list, tuple)):
        return [float(x) for x in raw]
    s = str(raw).strip()
    if s.startswith("["):
        s = s[1:]
    if s.endswith("]"):
        s = s[:-1]
    return [float(x) for x in s.split(",")]


def main():
    parser = argparse.ArgumentParser(description="Index legal_glossary into Qdrant")
    parser.add_argument("--recreate", action="store_true", help="Drop and recreate collection")
    args = parser.parse_args()

    # ── Connect to PostgreSQL ───────────────────────────────────────────────
    print("Connecting to PostgreSQL...")
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    cur.execute("""
        SELECT id, term, definition, category, jurisdiction,
               related_terms, sources, embedding::text
        FROM legal_glossary
        WHERE embedding IS NOT NULL
        ORDER BY term
    """)
    rows = cur.fetchall()
    print(f"  Found {len(rows)} rows with embeddings")

    if not rows:
        print("No rows with embeddings — nothing to index. Run embedding backfill first.")
        cur.close()
        conn.close()
        return

    # ── Connect to Qdrant ───────────────────────────────────────────────────
    print(f"Connecting to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}...")
    qclient = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

    existing_collections = [c.name for c in qclient.get_collections().collections]

    if args.recreate and COLLECTION in existing_collections:
        print(f"  Dropping existing '{COLLECTION}' collection...")
        qclient.delete_collection(COLLECTION)
        existing_collections.remove(COLLECTION)

    if COLLECTION not in existing_collections:
        print(f"  Creating '{COLLECTION}' collection ({VECTOR_DIM}-dim, cosine)...")
        qclient.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_DIM, distance=Distance.COSINE),
        )
    else:
        print(f"  Collection '{COLLECTION}' already exists — upserting into it")

    # ── Upsert points in batches ────────────────────────────────────────────
    total_upserted = 0
    total_skipped = 0

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        points = []

        for row in batch:
            vec = parse_pg_vector(row["embedding"])
            if vec is None or len(vec) != VECTOR_DIM:
                total_skipped += 1
                continue

            # Build payload (Qdrant stores arbitrary JSON alongside vectors)
            payload = {
                "term": row["term"],
                "definition": row["definition"][:2000] if row["definition"] else "",
                "category": row["category"] or "general",
                "jurisdiction": row["jurisdiction"] or "Federal/State",
            }

            # Parse JSONB fields
            rt = row.get("related_terms")
            if isinstance(rt, str):
                try:
                    rt = json.loads(rt)
                except Exception:
                    rt = []
            payload["related_terms"] = rt or []

            src = row.get("sources")
            if isinstance(src, str):
                try:
                    src = json.loads(src)
                except Exception:
                    src = []
            payload["sources"] = src or []

            points.append(
                PointStruct(
                    id=str(row["id"]),
                    vector=vec,
                    payload=payload,
                )
            )

        if points:
            qclient.upsert(collection_name=COLLECTION, points=points)
            total_upserted += len(points)

        sys.stdout.write(f"\r  Upserted: {total_upserted}/{len(rows)}")
        sys.stdout.flush()

    print(f"\n\n=== QDRANT INDEX COMPLETE ===")
    print(f"  Collection: {COLLECTION}")
    print(f"  Upserted:   {total_upserted}")
    print(f"  Skipped:    {total_skipped} (null or wrong-dim embeddings)")

    # Verify
    info = qclient.get_collection(COLLECTION)
    print(f"  Total pts:  {info.points_count}")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
