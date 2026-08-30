"""GA8-ABLATION-02 freeze phase: snapshot PageRank for the already-frozen candidate universe.

This script performs no candidate discovery. It reads candidate identities/source refs exclusively
from FrozenSemanticCandidatePoolV1 and freezes the graph feature vector separately. Exact graph
and feature revisions plus PageRank algorithm parameters are operator-required; the script refuses
to label an unqualified live table read as replayable evidence.

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

from ga8_judge_v2_common import canonical_json, load_ndjson, sha256_json

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
FROZEN_POOL_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
OUT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_PATH", ".tmp/atlas/ga8-graph-authority-feature-snapshot-v1.json")
REPORT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_REPORT", "docs/reports/ga8-graph-authority-feature-snapshot-v1.json")
AUTHORITY_TABLE = os.getenv("GA8_GRAPH_AUTHORITY_TABLE", "atlas_graph_authority_scores")
GRAPH_REVISION = os.getenv("GA8_GRAPH_REVISION")
FEATURE_REVISION = os.getenv("GA8_GRAPH_FEATURE_REVISION")
DAMPING_RAW = os.getenv("GA8_PAGERANK_DAMPING")
TOLERANCE_RAW = os.getenv("GA8_PAGERANK_TOLERANCE")
MAX_ITER_RAW = os.getenv("GA8_PAGERANK_MAX_ITERATIONS")


def require_config() -> tuple[float, float, int]:
    missing = [
        name
        for name, value in (
            ("GA8_GRAPH_REVISION", GRAPH_REVISION),
            ("GA8_GRAPH_FEATURE_REVISION", FEATURE_REVISION),
            ("GA8_PAGERANK_DAMPING", DAMPING_RAW),
            ("GA8_PAGERANK_TOLERANCE", TOLERANCE_RAW),
            ("GA8_PAGERANK_MAX_ITERATIONS", MAX_ITER_RAW),
        )
        if value is None or str(value).strip() == ""
    ]
    if missing:
        raise SystemExit("GA8_GRAPH_SNAPSHOT_REQUIRES_QUALIFIED_CONFIG:" + ",".join(missing))
    damping = float(DAMPING_RAW)
    tolerance = float(TOLERANCE_RAW)
    max_iterations = int(MAX_ITER_RAW)
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
    snapshot_revisions = {str(pool.get("candidateSnapshotRevision")) for pool in pools}
    if len(snapshot_revisions) != 1:
        raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MIXED")
    candidate_snapshot_revision = next(iter(snapshot_revisions))

    candidate_refs: list[tuple[str, str, str, int]] = []
    for pool in pools:
        query_id = str(pool["queryId"])
        for candidate in pool["candidates"]:
            candidate_refs.append((
                query_id,
                str(candidate["candidateId"]),
                str(candidate["sourceRef"]),
                int(candidate["poolOrdinal"]),
            ))
    source_refs = sorted({source_ref for _, _, source_ref, _ in candidate_refs})

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT source_ref, pagerank_l1::double precision AS pagerank_l1 FROM {table} WHERE source_ref = ANY(%s)",
                (source_refs,),
            )
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
    present_count = 0
    for query_id, candidate_id, source_ref, pool_ordinal in sorted(candidate_refs):
        present = source_ref in by_ref
        if present:
            present_count += 1
        rows.append({
            "queryId": query_id,
            "candidateId": candidate_id,
            "sourceRef": source_ref,
            "poolOrdinal": pool_ordinal,
            "pageRank": by_ref.get(source_ref, 0.0),
            "pageRankPresent": present,
        })

    vector_checksum = sha256_json(rows)
    snapshot = {
        "schema": "atlas.graph-authority-feature-snapshot.v1",
        "candidateSnapshotRevision": candidate_snapshot_revision,
        "graphRevision": GRAPH_REVISION,
        "featureRevision": FEATURE_REVISION,
        "algorithm": "PAGERANK",
        "damping": damping,
        "tolerance": tolerance,
        "maxIterations": max_iterations,
        "authorityTable": table,
        "candidateRows": len(rows),
        "pageRankPresentRows": present_count,
        "pageRankMissingRows": len(rows) - present_count,
        "rows": rows,
        "vectorChecksum": vector_checksum,
        "canonicalAuthority": False,
    }
    Path(OUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(OUT_PATH).write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")

    report = {
        "schema": "atlas.ga8-graph-authority-feature-snapshot-receipt.v1",
        "status": "GA8_GRAPH_AUTHORITY_FEATURE_SNAPSHOT_FROZEN",
        "candidateSnapshotRevision": candidate_snapshot_revision,
        "graphRevision": GRAPH_REVISION,
        "featureRevision": FEATURE_REVISION,
        "vectorChecksum": vector_checksum,
        "candidateRows": len(rows),
        "pageRankPresentRows": present_count,
        "pageRankMissingRows": len(rows) - present_count,
        "artifactPath": OUT_PATH,
        "canonicalAuthority": False,
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json(report))


if __name__ == "__main__":
    main()
