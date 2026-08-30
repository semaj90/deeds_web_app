"""Builds the structural-proxy golden query->relevant-packet set, per the methodology already
chosen in openspec/changes/parent-atlas-graph-analysis-contract/tasks.md (operator selected
option 1, 2026-08-10): a file's REAL importers (from fresh, disk-verified IMPORTS edges) are
treated as "relevant" packets for a query built from that file's own summary.

Read-only. Writes an NDJSON golden set + a JSON report. Does NOT write to Postgres/Neo4j/Qdrant
and does NOT promote this as canonical ground truth on its own -- it is a structural PROXY
(structurally related != necessarily what a human would want retrieved), exactly as flagged in
the methodology's own risk note. Downstream consumers (GA8 ablation harness,
LAMBDAMART-RANK-01) must treat it as such.

Input: .tmp/atlas/live-tree-imports-v1.ndjson (9,218 edges, extracted 2026-08-29 by
extract-live-tree-imports-v1.mjs, every edge verified against a real file on disk).
"""

from __future__ import annotations

import json
import os

import psycopg2
import psycopg2.extras

DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
IMPORTS_PATH = ".tmp/atlas/live-tree-imports-v1.ndjson"
MIN_IMPORTERS = 2  # avoid single-importer noise -- weak signal a file is meaningfully "used"


def strip_prefix(ref: str) -> str:
    return ref[len("sveltekit-frontend/"):] if ref.startswith("sveltekit-frontend/") else ref


def main() -> None:
    importers_by_target: dict[str, set[str]] = {}
    with open(IMPORTS_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            edge = json.loads(line)
            target = strip_prefix(edge["target_ref"])
            source = strip_prefix(edge["source_ref"])
            importers_by_target.setdefault(target, set()).add(source)

    candidate_targets = [t for t, importers in importers_by_target.items() if len(importers) >= MIN_IMPORTERS]

    conn = psycopg2.connect(DATABASE_URL)
    golden_entries = []
    skipped_no_summary = 0
    skipped_no_importer_row = 0
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            for target in candidate_targets:
                cur.execute(
                    "SELECT id::text AS id, relative_path, summary FROM codebase_chunk_index "
                    "WHERE relative_path = %s AND summary IS NOT NULL AND LENGTH(summary) > 20 "
                    "ORDER BY id LIMIT 1",
                    (target,),
                )
                target_row = cur.fetchone()
                if not target_row:
                    skipped_no_summary += 1
                    continue

                importer_refs = sorted(importers_by_target[target])
                relevant_packet_keys = []
                for importer_ref in importer_refs:
                    cur.execute(
                        "SELECT id::text AS id FROM codebase_chunk_index WHERE relative_path = %s ORDER BY id LIMIT 1",
                        (importer_ref,),
                    )
                    row = cur.fetchone()
                    if row:
                        relevant_packet_keys.append(row["id"])

                if not relevant_packet_keys:
                    skipped_no_importer_row += 1
                    continue

                golden_entries.append({
                    "schema": "atlas.structural-proxy-golden-entry.v1",
                    "canonical_authority": False,
                    "methodology": "STRUCTURAL_PROXY_IMPORTERS",
                    "query_source_ref": target,
                    "query_packet_key": target_row["id"],
                    "query_text": target_row["summary"],
                    "relevant_packet_keys": relevant_packet_keys,
                    "relevant_source_refs": importer_refs,
                    "relevant_count": len(relevant_packet_keys),
                    "risk_note": "structurally related != necessarily what a human would want retrieved -- a real methodology limitation, not a free lunch",
                })
    finally:
        conn.close()

    out_ndjson = ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
    os.makedirs(os.path.dirname(out_ndjson), exist_ok=True)
    with open(out_ndjson, "w", encoding="utf-8") as fh:
        for entry in golden_entries:
            fh.write(json.dumps(entry) + "\n")

    report = {
        "schema": "atlas.structural-proxy-golden-set-build.v1",
        "status": "READ_ONLY_PROVEN",
        "canonical_authority": False,
        "methodology": "STRUCTURAL_PROXY_IMPORTERS",
        "methodology_source": "openspec/changes/parent-atlas-graph-analysis-contract/tasks.md, operator selected 2026-08-10",
        "imports_source": IMPORTS_PATH,
        "candidate_targets_with_min_importers": len(candidate_targets),
        "golden_entries_built": len(golden_entries),
        "skipped_no_summary": skipped_no_summary,
        "skipped_no_importer_row": skipped_no_importer_row,
        "min_importers_threshold": MIN_IMPORTERS,
        "output_path": out_ndjson,
        "database_writes": False,
        "neo4j_writes": False,
        "read_only": True,
        "risk_note": "This is a PROXY, not verified human relevance. Downstream consumers (GA8 ablation, LAMBDAMART-RANK-01) must treat it as weak/silver-tier ground truth, one step above the earlier keyword-match silver standard but still not human-labeled gold.",
    }
    out_report = "docs/reports/structural-proxy-golden-set-build-v1.json"
    with open(out_report, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
