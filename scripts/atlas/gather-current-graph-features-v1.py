#!/usr/bin/env python3
"""Read-only bounded graph-feature gatherer backed by the 8098 executor."""

from __future__ import annotations

import json
import urllib.request
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ARTIFACT = ROOT / "sveltekit-frontend" / "docs" / "reports" / "current-structural-graph-artifact-v1"
MAP_PATH = ROOT / ".tmp" / "atlas" / "lineage-qualified-candidate-map-v1.json"
REPORT = ROOT / "docs" / "reports" / "current-graph-feature-gather-v1.json"
SIDECAR = "http://127.0.0.1:8098"


def post(path: str, body: dict) -> dict:
    request = urllib.request.Request(
        SIDECAR + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    manifest = json.loads((ARTIFACT / "manifest.json").read_text(encoding="utf-8"))
    nodes = json.loads((ARTIFACT / "nodes.json").read_text(encoding="utf-8"))["rows"]
    candidates = json.loads(MAP_PATH.read_text(encoding="utf-8"))["candidates"]
    by_packet = {row["packetKey"]: row for row in candidates}

    load = post("/v1/graph/load", {
        "artifactDir": "/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/reports/current-structural-graph-artifact-v1",
        "expectedGraphRevision": manifest["graphRevision"],
        "expectedProjectionRevision": manifest["projectionRevision"],
        "replaceResident": True,
    })
    result = post("/v1/graph/pagerank", {
        "graphRevision": manifest["graphRevision"],
        "topK": len(nodes),
        "alpha": 0.85,
        "tol": 1e-6,
        "maxIter": 100,
    })
    score_by_ordinal = {
        int(row.get("gpuNodeId", row.get("nodeId", row.get("id")))): float(row.get("score", row.get("pagerank")))
        for row in result.get("rows", result.get("results", []))
    }
    grouped = defaultdict(list)
    for node in nodes:
        candidate = by_packet.get(node.get("packet_key"))
        if candidate is not None:
            grouped[int(candidate["candidateOrdinal"])].append(score_by_ordinal[int(node["gpu_node_id"])])

    features = []
    for ordinal in sorted(grouped):
        values = grouped[ordinal]
        features.append({
            "candidateOrdinal": ordinal,
            "graphNodeCount": len(values),
            "pagerankMax": max(values),
            "pagerankMean": sum(values) / len(values),
            "pagerankSum": sum(values),
            "presence": {"pagerank": 1, "graphNodeCount": 1},
        })
    report = {
        "schema": "atlas.current-graph-feature-gather-v1",
        "mode": "NON_PRODUCTION_DERIVED_FEATURE_ARTIFACT",
        "graphRevision": manifest["graphRevision"],
        "projectionRevision": manifest["projectionRevision"],
        "workspaceRevision": manifest["workspaceRevision"],
        "candidateSnapshotRevision": manifest.get("candidateSnapshotRevision"),
        "ordinalMapChecksum": manifest.get("ordinalMapChecksum"),
        "featureRevision": "graph-pagerank:cugraph-v1:alpha-0.85:tol-1e-6:maxIter-100",
        "candidateCount": len(features),
        "features": features,
        "load": load,
        "executor": result.get("backend", "cugraph.pagerank"),
        "graphFeaturePresenceReason": "CURRENT_GRAPH_ARTIFACT_AVAILABLE",
        "writesPerformed": False,
        "canonicalAuthority": False,
        "status": "CURRENT_GRAPH_FEATURE_GATHER_PROVEN_BOUNDED" if len(features) > 0 else "CURRENT_GRAPH_FEATURE_GATHER_EMPTY",
        "nextGate": "FEATURE_MATRIX_JOIN_AND_RETRIEVAL_CHALLENGER_COMPARISON",
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "candidateCount": len(features), "executor": report["executor"], "reportPath": str(REPORT.relative_to(ROOT)).replace("\\", "/")}, indent=2))


if __name__ == "__main__":
    main()
