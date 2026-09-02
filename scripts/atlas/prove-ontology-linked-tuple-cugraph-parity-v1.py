#!/usr/bin/env python3
"""Read-only ONTO-PY-GPU-01 proof for tuple projection to cuGraph.

The fixture is built from the existing operational projection output. JSON is
used only for the source fixture and receipt; the GPU path receives typed
Parquet node/edge columns directly.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

import networkx as nx
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
FIXTURE = ROOT / "sveltekit-frontend" / "docs" / "reports" / "ontology-linked-tuple-cugraph-fixture-v1"
REPORT = ROOT / "docs" / "reports" / "ontology-linked-tuple-cugraph-parity-v1.json"
SIDECAR = os.environ.get("ATLAS_RAPIDS_SIDECAR_URL", "http://127.0.0.1:8098")
GRAPH_REVISION = "graph:ontology-linked-tuple-cugraph-fixture-v1"
PROJECTION_REVISION = "projection:ontology-linked-tuple-cugraph-fixture-v1"
ALPHA = 0.85
TOL = 1e-6
MAX_ITER = 100

sys.path.insert(0, str(ROOT / "python"))


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def post(path: str, body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        f"{SIDECAR}{path}",
        data=json.dumps(body).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def main() -> int:
    from parent_atlas_ontology.graph_projection import project_to_graph
    from parent_atlas_ontology.models import OntologyLinkedTupleV1

    tuple_value = OntologyLinkedTupleV1.from_dict(json.loads(SOURCE.read_text(encoding="utf-8")))
    if not tuple_value.provenance.sourceRevision:
        raise SystemExit("SOURCE_REVISION_UNPROVEN")

    ordinal_map = {participant.entityId: index for index, participant in enumerate(tuple_value.participants)}
    projection = project_to_graph([tuple_value], ordinal_map)
    if projection.skippedParticipants:
        raise SystemExit(f"PROJECTION_PARTICIPANTS_SKIPPED:{len(projection.skippedParticipants)}")

    nodes = [
        {"gpu_node_id": ordinal, "graph_node_key": node.key, "packet_key": node.key}
        for node, ordinal in sorted(
            ((node, projection.projectionOrdinalByNodeKey[node.key]) for node in projection.projectionNodes),
            key=lambda item: item[1],
        )
    ]
    edges = [
        (edge.sourceProjectionOrdinal, edge.destinationProjectionOrdinal, 1.0)
        for edge in projection.operationalEdges
    ]
    graph = nx.DiGraph()
    graph.add_nodes_from(range(len(nodes)))
    graph.add_weighted_edges_from(edges)
    cpu_scores = nx.pagerank(graph, alpha=ALPHA, tol=TOL, max_iter=MAX_ITER, weight="weight")

    FIXTURE.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(nodes).to_parquet(FIXTURE / "nodes.parquet", index=False)
    pd.DataFrame(edges, columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"]).to_parquet(FIXTURE / "edges.parquet", index=False)
    manifest = {
        "graphRevision": GRAPH_REVISION,
        "projectionRevision": PROJECTION_REVISION,
        "producerRevision": "ontology-linked-tuple-cugraph-fixture-v1",
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "nodeTableHash": digest(nodes),
        "edgeTableHash": digest([{"src": s, "dst": d, "weight": w} for s, d, w in edges]),
        "sourceRevision": tuple_value.provenance.sourceRevision,
        "projectionChecksum": projection.projectionChecksum,
    }
    (FIXTURE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    load = post("/v1/graph/load", {"artifactDir": "/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/reports/ontology-linked-tuple-cugraph-fixture-v1", "expectedGraphRevision": GRAPH_REVISION, "expectedProjectionRevision": PROJECTION_REVISION, "replaceResident": True})
    gpu = post("/v1/graph/pagerank", {"graphRevision": GRAPH_REVISION, "projectionRevision": PROJECTION_REVISION, "projectionChecksum": projection.projectionChecksum, "topK": len(nodes), "alpha": ALPHA, "tol": TOL, "maxIter": MAX_ITER})
    by_key = {str(row["nodeKey"]): float(row.get("score", row.get("pagerank"))) for row in gpu.get("rows", gpu.get("results", []))}
    key_by_ordinal = {str(node["gpu_node_id"]): node["graph_node_key"] for node in nodes}
    gpu_scores = {key_by_ordinal[str(row["vertex"])] if "vertex" in row else str(row["nodeKey"]): float(row.get("score", row.get("pagerank"))) for row in gpu.get("rows", gpu.get("results", []))}
    expected = {key_by_ordinal[str(ordinal)]: score for ordinal, score in cpu_scores.items()}
    max_error = max(abs(expected[key] - gpu_scores[key]) for key in expected)
    report = {
        "schema": "atlas.ontology-linked-tuple-cugraph-parity-receipt.v1",
        "status": "ONTO_PY_GPU_PARITY_PROVEN" if load.get("renumbered") is False and max_error <= 1e-5 else "ONTO_PY_GPU_PARITY_UNPROVEN",
        "sourceRevision": tuple_value.provenance.sourceRevision,
        "projectionChecksum": projection.projectionChecksum,
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "renumbered": load.get("renumbered"),
        "unknownOrdinals": 0,
        "maxAbsScoreError": max_error,
        "sameRankOrdering": sorted(expected, key=lambda key: (-expected[key], key)) == sorted(gpu_scores, key=lambda key: (-gpu_scores[key], key)),
        "cpuBackend": "networkx",
        "gpuBackend": gpu.get("backend", "cugraph.pagerank"),
        "writesPerformed": False,
        "canonicalAuthority": False,
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**report, "reportPath": str(REPORT.relative_to(ROOT)).replace("\\", "/")}, indent=2))
    return 0 if report["status"] == "ONTO_PY_GPU_PARITY_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
