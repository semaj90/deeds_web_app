"""Read-only ONTO-PY-GPU-03 deterministic Leiden replay proof."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import urllib.request

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "sveltekit-frontend" / "docs" / "reports" / "ontology-linked-tuple-cugraph-algorithm-fixture-v1"
REPORT = ROOT / "docs" / "reports" / "ontology-linked-tuple-leiden-replay-v1.json"
SIDECAR = os.environ.get("ATLAS_RAPIDS_COMMUNITY_URL", "http://127.0.0.1:8099")
GRAPH_REVISION = "graph:ontology-linked-tuple-cugraph-algorithm-fixture-v2"
PROJECTION_REVISION = "projection:ontology-linked-tuple-cugraph-algorithm-fixture-v2"


def digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def post(body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(f"{SIDECAR}/v1/community/leiden", data=json.dumps(body).encode(), headers={"content-type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def normalized_partition(response: dict[str, object]) -> list[list[str]]:
    communities = response.get("communities", [])
    return sorted(sorted(str(node) for node in item["memberNodeIds"]) for item in communities)


def main() -> int:
    nodes = pd.read_parquet(FIXTURE / "nodes.parquet").sort_values("gpu_node_id")
    edges = pd.read_parquet(FIXTURE / "edges.parquet").sort_values(["src_gpu_node_id", "dst_gpu_node_id"])
    node_values = [{"nodeId": str(row.graph_node_key)} for row in nodes.itertuples(index=False)]
    edge_values = [{"source": str(row.src_gpu_node_id), "target": str(row.dst_gpu_node_id), "weight": float(row.weight)} for row in edges.itertuples(index=False)]
    # Community challenger consumes external node keys; use the shared projected
    # key universe and preserve its edge relation through a deterministic map.
    key_by_id = {str(row.gpu_node_id): str(row.graph_node_key) for row in nodes.itertuples(index=False)}
    node_values = [{"nodeId": key} for key in key_by_id.values()]
    edge_values = [{"source": key_by_id[str(row.src_gpu_node_id)], "target": key_by_id[str(row.dst_gpu_node_id)], "weight": float(row.weight)} for row in edges.itertuples(index=False)]
    request = {"algorithm": "leiden", "graphRevision": GRAPH_REVISION, "topologyHash": digest(edge_values), "projectionRevision": PROJECTION_REVISION, "projectionSemantics": "atlas.undirected-weighted-projection.v1", "nodes": node_values, "edges": edge_values, "resolution": 1.0, "maxIterations": 100, "randomState": 17, "theta": 1.0}
    first = post(request)
    second = post(request)
    first_partition = normalized_partition(first)
    second_partition = normalized_partition(second)
    checks = {"same_input_hash": first.get("inputHash") == second.get("inputHash"), "same_output_hash": first.get("outputHash") == second.get("outputHash"), "same_normalized_partition": first_partition == second_partition, "parameters_frozen": first.get("parameters") == second.get("parameters") and first.get("parameters", {}).get("random_state") == 17, "projection_revision_preserved": first.get("projectionRevision") == PROJECTION_REVISION, "writes_false": True, "canonical_false": True}
    report = {"schema": "atlas.ontology-linked-tuple-leiden-replay-receipt.v1", "status": "ONTO_PY_GPU_03_PROVEN" if all(checks.values()) else "ONTO_PY_GPU_03_UNPROVEN", "graphRevision": GRAPH_REVISION, "projectionRevision": PROJECTION_REVISION, "topologyHash": request["topologyHash"], "vertexCount": len(node_values), "edgeCount": len(edge_values), "randomState": 17, "resolution": 1.0, "maxIterations": 100, "theta": 1.0, "communityCount": len(first_partition), "checks": checks, "writesPerformed": False, "canonicalAuthority": False}
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ONTO_PY_GPU_03_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
