#!/usr/bin/env python3
"""Freeze a read-only latent-64 repair cohort from the admitted semantic bundle."""
import argparse
import hashlib
import json
import os
from pathlib import Path

import psycopg2

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=128)
    parser.add_argument("--marker", default="packet-autoencoder-768-64")
    parser.add_argument("--bundle", default="docs/reports/sem768-corpus-bundle-01.json")
    parser.add_argument("--report-path", default="docs/reports/latent64-canary-cohort-v1.json")
    args = parser.parse_args()
    if not 1 <= args.limit <= 128:
        raise SystemExit("--limit must be between 1 and 128")
    with open(ROOT / args.bundle, encoding="utf-8") as fh:
        bundle = json.load(fh)
    ids = sorted(bundle["eligibleIds"])
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"))
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text
                FROM codebase_chunk_index
                WHERE id = ANY(%s::uuid[])
                  AND content_embedding IS NOT NULL
                  AND latent64_model = %s
                  AND latent_64 IS NULL
                ORDER BY id
                LIMIT %s
                """,
                (ids, args.marker, args.limit),
            )
            cohort_ids = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()
    checksum = "sha256:" + hashlib.sha256("\n".join(cohort_ids).encode()).hexdigest()
    result = {
        "schema": "atlas.latent64-canary-cohort.v1",
        "status": "FROZEN_READONLY_COHORT" if cohort_ids else "NO_ELIGIBLE_COHORT",
        "marker": args.marker,
        "requestedLimit": args.limit,
        "cohortSize": len(cohort_ids),
        "cohortIds": cohort_ids,
        "cohortChecksum": checksum,
        "sourceBundle": args.bundle,
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    output = ROOT / args.report_path
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in result.items() if k != "cohortIds"}))


if __name__ == "__main__":
    main()
