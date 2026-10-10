#!/usr/bin/env python3
"""Run diagnostic NetworkX CPU oracles over a checksum-verified graph artifact."""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from atlas_graph_runtime.graph_projection_manifest import validate_graph_projection_artifact_v1
from atlas_graph_runtime.networkx_executor import (
    run_bfs_neighborhood,
    run_cheirank,
    run_pagerank_v2,
    run_sssp_v2,
    run_strongly_connected_components,
    run_topological_order,
)


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sha256(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def build_report(artifact_dir: Path) -> dict[str, Any]:
    manifest = json.loads((artifact_dir / "manifest.json").read_text(encoding="utf-8"))
    node_payload = json.loads((artifact_dir / "nodes.json").read_text(encoding="utf-8"))
    if node_payload.get("schema") != "atlas.graph-node-table-v1":
        raise ValueError("GRAPH_NODE_TABLE_SCHEMA_INVALID")
    nodes = node_payload.get("rows")
    if not isinstance(nodes, list):
        raise ValueError("GRAPH_NODE_TABLE_ROWS_INVALID")
    edge_frame = pd.read_parquet(artifact_dir / "edges.parquet")
    edges = [
        {
            "src_gpu_node_id": int(row.src_gpu_node_id),
            "dst_gpu_node_id": int(row.dst_gpu_node_id),
            "edge_type": str(row.edge_type),
            "weight": float(row.weight),
        }
        for row in edge_frame.itertuples(index=False)
    ]
    snapshot = validate_graph_projection_artifact_v1(manifest, nodes, edges)
    source_ordinal = min(edge["src_gpu_node_id"] for edge in edges) if edges else min(snapshot.node_ordinals)
    pagerank, pagerank_receipt = run_pagerank_v2(
        graph_revision=snapshot.graph_revision,
        node_ordinals=snapshot.node_ordinals,
        edges=snapshot.edges,
    )
    cheirank, cheirank_receipt = run_cheirank(
        graph_revision=snapshot.graph_revision,
        node_ordinals=snapshot.node_ordinals,
        edges=snapshot.edges,
    )
    bfs, bfs_receipt = run_bfs_neighborhood(
        graph_revision=snapshot.graph_revision,
        node_ordinals=snapshot.node_ordinals,
        edges=snapshot.edges,
        source_ordinal=source_ordinal,
        max_depth=max(0, len(snapshot.node_ordinals) - 1),
    )
    sssp, sssp_receipt = run_sssp_v2(
        graph_revision=snapshot.graph_revision,
        node_ordinals=snapshot.node_ordinals,
        edges=snapshot.edges,
        source_ordinal=source_ordinal,
    )
    components, scc_receipt = run_strongly_connected_components(
        graph_revision=snapshot.graph_revision,
        node_ordinals=snapshot.node_ordinals,
        edges=snapshot.edges,
    )
    try:
        topological_order, topological_receipt = run_topological_order(
            graph_revision=snapshot.graph_revision,
            node_ordinals=snapshot.node_ordinals,
            edges=snapshot.edges,
        )
        topological_result = {
            "status": "PROVEN",
            "ordinals": list(topological_order),
            "receipt": asdict(topological_receipt),
        }
    except ValueError as exc:
        if str(exc) != "ATLAS_TOPOLOGICAL_GRAPH_CYCLIC":
            raise
        topological_result = {"status": "NOT_APPLICABLE_CYCLIC_GRAPH", "reason": str(exc)}

    candidate_checksum = manifest.get("candidateOrdinalMapChecksum")
    candidate_snapshot = manifest.get("candidateSnapshotRevision")
    ppr_status = "READY_FOR_ADAPTER" if (
        isinstance(candidate_checksum, str)
        and re.fullmatch(r"sha256:[0-9a-f]{64}", candidate_checksum)
        and isinstance(candidate_snapshot, str)
        and candidate_snapshot
    ) else "BLOCKED_CANDIDATE_ORDINAL_MAP_NOT_EXPLICIT_SHA256"

    return {
        "schema": "atlas.networkx-graph-projection-cpu-proof.v1",
        "status": "FROZEN_ARTIFACT_CPU_PROVEN_NON_PRODUCTION",
        "artifact": {
            "schema": manifest["schema"],
            "workspaceRevision": snapshot.workspace_revision,
            "candidateSnapshotRevision": candidate_snapshot,
            "candidateOrdinalMapChecksum": candidate_checksum,
            "graphRevision": snapshot.graph_revision,
            "graphOrdinalMapChecksum": snapshot.graph_ordinal_map_checksum,
            "nodeChecksum": snapshot.node_checksum,
            "edgeChecksum": snapshot.edge_checksum,
            "nodeCount": len(snapshot.node_ordinals),
            "edgeCount": len(snapshot.edges),
        },
        "cpuOracles": {
            "pagerank": {"scores": [[key, pagerank[key]] for key in sorted(pagerank)], "receipt": asdict(pagerank_receipt)},
            "cheirank": {"scores": [[key, cheirank[key]] for key in sorted(cheirank)], "receipt": asdict(cheirank_receipt)},
            "bfs": {"sourceOrdinal": source_ordinal, "rows": [list(row) for row in bfs], "receipt": asdict(bfs_receipt)},
            "sssp": {
                "sourceOrdinal": source_ordinal,
                "rows": [[key, None if value[0] == float("inf") else value[0], value[1]] for key, value in sorted(sssp.items())],
                "receipt": asdict(sssp_receipt),
            },
            "scc": {"components": [list(component) for component in components], "receipt": asdict(scc_receipt)},
            "topological": topological_result,
            "personalizedPageRank": {"status": ppr_status},
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", required=True)
    parser.add_argument("--output")
    args = parser.parse_args()
    artifact_dir = Path(args.artifact_dir).resolve()
    report = build_report(artifact_dir)
    report_checksum = sha256(canonical_json(report))
    envelope = {"report": report, "reportChecksum": report_checksum}
    output_dir = (ROOT / ".tmp" / "atlas").resolve()
    output = Path(args.output).resolve() if args.output else output_dir / f"networkx-graph-projection-cpu-v1-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.json"
    try:
        output.relative_to(output_dir)
    except ValueError as exc:
        raise ValueError("GRAPH_PROOF_OUTPUT_MUST_STAY_UNDER_TMP") from exc
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(canonical_json(envelope) + b"\n")
    readback = json.loads(output.read_text(encoding="utf-8"))
    if readback != envelope or sha256(canonical_json(readback["report"])) != readback["reportChecksum"]:
        raise ValueError("GRAPH_PROOF_READBACK_MISMATCH")
    print(json.dumps({"status": report["status"], "report": str(output.relative_to(ROOT)), "reportChecksum": report_checksum, "nodeCount": report["artifact"]["nodeCount"], "edgeCount": report["artifact"]["edgeCount"], "ppr": report["cpuOracles"]["personalizedPageRank"]["status"], "canonicalAuthority": False, "writesPerformed": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
