"""GA8-ABLATION-02 graph freeze: snapshot PageRank for the exact frozen candidate universe.

No candidate discovery occurs. Missing PageRank is not converted into a fabricated zero for a
promotion-grade ablation. Graph/feature revisions remain operator-supplied because the legacy
atlas_graph_authority_scores table does not itself carry a joinable revision key; a provenance
receipt checksum is therefore required and explicitly recorded as operator-supplied evidence.

canonical_authority: false
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras

from ga8_judge_v2_common import canonical_json, load_ndjson, sha256_json, sha256_text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
FROZEN_POOL_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
OUT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_PATH", ".tmp/atlas/ga8-graph-authority-feature-snapshot-v1.json")
REPORT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_REPORT", "docs/reports/ga8-graph-authority-feature-snapshot-v1.json")
AUTHORITY_TABLE = os.getenv("GA8_GRAPH_AUTHORITY_TABLE", "atlas_graph_authority_scores")
GRAPH_REVISION = os.getenv("GA8_GRAPH_REVISION")
FEATURE_REVISION = os.getenv("GA8_GRAPH_FEATURE_REVISION")
PROVENANCE_RECEIPT_CHECKSUM = os.getenv("GA8_GRAPH_PROVENANCE_RECEIPT_CHECKSUM")
DAMPING_RAW = os.getenv("GA8_PAGERANK_DAMPING")
TOLERANCE_RAW = os.getenv("GA8_PAGERANK_TOLERANCE")
MAX_ITER_RAW = os.getenv("GA8_PAGERANK_MAX_ITERATIONS")


def require_config() -> tuple[float, float, int]:
    values = (
        ("GA8_GRAPH_REVISION", GRAPH_REVISION),
        ("GA8_GRAPH_FEATURE_REVISION", FEATURE_REVISION),
        ("GA8_GRAPH_PROVENANCE_RECEIPT_CHECKSUM", PROVENANCE_RECEIPT_CHECKSUM),
        ("GA8_PAGERANK_DAMPING", DAMPING_RAW),
        ("GA8_PAGERANK_TOLERANCE", TOLERANCE_RAW),
        ("GA8_PAGERANK_MAX_ITERATIONS", MAX_ITER_RAW),
    )
    missing = [name for name, value in values if value is None or str(value).strip() == ""]
    if missing:
        raise SystemExit("GA8_GRAPH_SNAPSHOT_REQUIRES_QUALIFIED_CONFIG:" + ",".join(missing))
    if not str(PROVENANCE_RECEIPT_CHECKSUM).startswith("sha256:"):
        raise SystemExit("GA8_GRAPH_PROVENANCE_RECEIPT_CHECKSUM_INVALID")
    damping, tolerance, max_iterations = float(DAMPING_RAW), float(TOLERANCE_RAW), int(MAX_ITER_RAW)
    if not (0.0 < damping < 1.0) or tolerance <= 0.0 or max_iterations <= 0:
        raise SystemExit("GA8_PAGERANK_PARAMS_INVALID")
    return damping, tolerance, max_iterations


def validate_table_name(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise SystemExit("GA8_GRAPH_AUTHORITY_TABLE_INVALID")
    return name


def main() -> None:
    damping, tolerance, max_iterations = require_config()
    table = validate_table_name(AUTHORITY_TABLE)
    pools = load_ndjson(FROZEN_POOL_PATH)
    if not pools:
        raise SystemExit("GA8_FROZEN_POOL_EMPTY")

    query_ids = [str(p.get("queryId")) for p in pools]
    if len(query_ids) != len(set(query_ids)):
        raise SystemExit("GA8_DUPLICATE_QUERY_ID")
    snapshot_revisions = {str(pool.get("candidateSnapshotRevision")) for pool in pools}
    if len(snapshot_revisions) != 1 or "None" in snapshot_revisions:
        raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MIXED_OR_MISSING")
    candidate_snapshot_revision = next(iter(snapshot_revisions))
    expected_snapshot = sha256_json([
        {"queryId": pool["queryId"], "candidatePoolChecksum": pool["candidatePoolChecksum"]}
        for pool in pools
    ])
    if candidate_snapshot_revision != expected_snapshot:
        raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MISMATCH")

    candidate_refs: list[tuple[str, str, str, int]] = []
    seen_keys: set[tuple[str, str]] = set()
    for pool in pools:
        query_id = str(pool["queryId"])
        for candidate in pool["candidates"]:
            key = (query_id, str(candidate["candidateId"]))
            if key in seen_keys:
                raise SystemExit("GA8_DUPLICATE_CANDIDATE_COORDINATE")
            seen_keys.add(key)
            candidate_refs.append((query_id, key[1], str(candidate["sourceRef"]), int(candidate["poolOrdinal"])))
    source_refs = sorted({source_ref for _, _, source_ref, _ in candidate_refs})

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(f"SELECT source_ref, pagerank_l1::double precision AS pagerank_l1 FROM {table} WHERE source_ref = ANY(%s)", (source_refs,))
            raw_rows = cur.fetchall()
    finally:
        conn.close()

    by_ref: dict[str, float] = {}
    for row in raw_rows:
        source_ref = str(row["source_ref"])
        score = float(row["pagerank_l1"] or 0.0)
        if not math.isfinite(score) or score < 0.0:
            raise SystemExit("GA8_PAGERANK_VALUE_INVALID")
        if source_ref in by_ref and by_ref[source_ref] != score:
            raise SystemExit("GA8_GRAPH_AUTHORITY_DUPLICATE_SOURCE_CONFLICT")
        by_ref[source_ref] = score

    rows: list[dict[str, Any]] = []
    for query_id, candidate_id, source_ref, pool_ordinal in sorted(candidate_refs):
        present = source_ref in by_ref
        rows.append({
            "queryId": query_id,
            "candidateId": candidate_id,
            "sourceRef": source_ref,
            "poolOrdinal": pool_ordinal,
            "pageRank": by_ref[source_ref] if present else None,
            "pageRankPresent": present,
        })

    present_count = sum(1 for row in rows if row["pageRankPresent"])
    missing_count = len(rows) - present_count
    vector_checksum = sha256_json(rows)
    provenance = {
        "graphRevision": GRAPH_REVISION,
        "featureRevision": FEATURE_REVISION,
        "provenanceReceiptChecksum": PROVENANCE_RECEIPT_CHECKSUM,
        "qualification": "OPERATOR_SUPPLIED_RECEIPT_BOUND",
        "tableCarriesJoinableRevision": False,
    }
    snapshot = {
        "schema": "atlas.graph-authority-feature-snapshot.v1",
        "candidateSnapshotRevision": candidate_snapshot_revision,
        **provenance,
        "algorithm": "PAGERANK",
        "damping": damping,
        "tolerance": tolerance,
        "maxIterations": max_iterations,
        "authorityTable": table,
        "candidateRows": len(rows),
        "pageRankPresentRows": present_count,
        "pageRankMissingRows": missing_count,
        "rows": rows,
        "vectorChecksum": vector_checksum,
        "snapshotChecksum": sha256_json({"candidateSnapshotRevision": candidate_snapshot_revision, "provenance": provenance, "rows": rows}),
        "canonicalAuthority": False,
    }

    status = "GA8_GRAPH_AUTHORITY_FEATURE_SNAPSHOT_FROZEN" if missing_count == 0 else "GA8_GRAPH_AUTHORITY_FEATURE_SNAPSHOT_BLOCKED_MISSING_ROWS"
    report = {
        "schema": "atlas.ga8-graph-authority-feature-snapshot-receipt.v1",
        "status": status,
        "candidateSnapshotRevision": candidate_snapshot_revision,
        **provenance,
        "vectorChecksum": vector_checksum,
        "snapshotChecksum": snapshot["snapshotChecksum"],
        "candidateRows": len(rows),
        "pageRankPresentRows": present_count,
        "pageRankMissingRows": missing_count,
        "artifactPath": OUT_PATH,
        "canonicalAuthority": False,
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if missing_count:
        print(canonical_json(report))
        raise SystemExit("GA8_GRAPH_AUTHORITY_COVERAGE_INCOMPLETE")

    Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(OUT_PATH).write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(canonical_json(report))


if __name__ == "__main__":
    main()
