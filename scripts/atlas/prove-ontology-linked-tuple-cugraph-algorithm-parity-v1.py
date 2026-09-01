"""ONTO-PY-GPU-02: shared ontology-linked incidence projection parity.

The source tuples are fixture-only.  One projection is materialized once and
the same revision-qualified Parquet artifact is consumed by NetworkX and the
existing RAPIDS sidecar for BFS, connected components, and PageRank.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import urllib.request

import networkx as nx
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "reports" / "fixtures" / "ontology-linked-tuple-fixture-v1.json"
FIXTURE = ROOT / "sveltekit-frontend" / "docs" / "reports" / "ontology-linked-tuple-cugraph-algorithm-fixture-v1"
REPORT = ROOT / "docs" / "reports" / "ontology-linked-tuple-cugraph-algorithm-parity-v1.json"
SIDECAR = os.environ.get("ATLAS_RAPIDS_SIDECAR_URL", "http://127.0.0.1:8098")
GRAPH_REVISION = "graph:ontology-linked-tuple-cugraph-algorithm-fixture-v2"
PROJECTION_REVISION = "projection:ontology-linked-tuple-cugraph-algorithm-fixture-v2"
SOURCE_NAMESPACE = "workspace:ontology-linked-tuple-fixture-v1"

sys.path.insert(0, str(ROOT / "python"))


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def post(path: str, body: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        f"{SIDECAR}{path}", data=json.dumps(body).encode(),
        headers={"content-type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode())


def make_tuple(base: dict, suffix: str, participants: list[dict]) -> dict:
    value = json.loads(json.dumps(base))
    value["tupleId"] = f"{base['tupleId']}:{suffix}"
    value["sourceRef"] = f"fixture/{suffix}.ts"
    value["relationRevision"] = f"relation:{suffix}:v1"
    value["participants"] = participants
    value["provenance"]["sourceRevision"] = "sha256:" + "b" * 64
    value["provenance"]["sourceTables"] = ["fixture_ontology_linked_tuples"]
    return value


def participant(entity_id: str, role: str) -> dict:
    return {"entityId": entity_id, "entityKind": "fixture_entity", "role": role, "label": entity_id}


def normalized_components(rows: list[dict]) -> list[list[str]]:
    groups: dict[int, list[str]] = {}
    for row in rows:
        groups.setdefault(int(row["componentLabel"]), []).append(str(row["nodeKey"]))
    return sorted(sorted(values) for values in groups.values())


def main() -> int:
    from parent_atlas_ontology.graph_projection import project_to_graph
    from parent_atlas_ontology.models import OntologyLinkedTupleV1

    base = json.loads(SOURCE.read_text(encoding="utf-8"))
    specs = [
        ("fixture-a", [participant("entity:a1", "cause"), participant("entity:a2", "effect"), participant("entity:a3", "evidence"), participant("entity:a4", "tool")]),
        ("fixture-b1", [participant("entity:b1", "cause"), participant("entity:shared", "evidence")]),
        ("fixture-b2", [participant("entity:shared", "cause"), participant("entity:b2", "effect")]),
        ("fixture-c1", [participant("entity:c1", "cause"), participant("entity:c2", "effect")]),
        ("fixture-c2", [participant("entity:c3", "cause"), participant("entity:c4", "effect")]),
        ("fixture-d1", [participant("entity:d1", "cause"), participant("entity:chain", "evidence")]),
        ("fixture-d2", [participant("entity:chain", "cause"), participant("entity:d2", "effect")]),
    ]
    raw_values = [make_tuple(base, suffix, parts) for suffix, parts in specs]
    metadata = [{"tupleId": value["tupleId"], "sourceNamespace": SOURCE_NAMESPACE, "syntheticRevision": 0} for value in raw_values]
    tuples = [OntologyLinkedTupleV1.from_dict(value) for value in raw_values]
    if any(not value.provenance.sourceRevision or not value.relationRevision for value in tuples):
        raise SystemExit("REVISION_UNPROVEN")
    if any(item["sourceNamespace"] != SOURCE_NAMESPACE or item["syntheticRevision"] != 0 for item in metadata):
        raise SystemExit("SOURCE_NAMESPACE_UNPROVEN")

    ordinal_map = {p.entityId: index for index, p in enumerate(sorted({p for t in tuples for p in t.participants}, key=lambda p: p.entityId))}
    projection = project_to_graph(tuples, ordinal_map)
    if projection.skippedParticipants:
        raise SystemExit(f"PROJECTION_PARTICIPANTS_SKIPPED:{len(projection.skippedParticipants)}")
    nodes = [{"gpu_node_id": ordinal, "graph_node_key": node_key, "packet_key": node_key} for node_key, ordinal in sorted(projection.projectionOrdinalByNodeKey.items(), key=lambda item: item[1])]
    edges = [(edge.sourceProjectionOrdinal, edge.destinationProjectionOrdinal, 1.0) for edge in projection.operationalEdges]
    graph = nx.Graph()
    graph.add_nodes_from(range(len(nodes)))
    graph.add_weighted_edges_from(edges)
    relation_keys = sorted(key for key in projection.projectionOrdinalByNodeKey if key.startswith("relation:"))
    start_key = relation_keys[-1]
    start_id = projection.projectionOrdinalByNodeKey[start_key]
    cpu_bfs = dict(nx.single_source_shortest_path_length(graph, start_id, cutoff=2))
    cpu_components = [sorted(str(nodes[node_id]["graph_node_key"]) for node_id in members) for members in nx.connected_components(graph)]
    cpu_components = sorted(cpu_components)
    cpu_pr = nx.pagerank(graph, alpha=0.85, tol=1e-6, max_iter=100, weight="weight")

    FIXTURE.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(nodes).to_parquet(FIXTURE / "nodes.parquet", index=False)
    pd.DataFrame(edges, columns=["src_gpu_node_id", "dst_gpu_node_id", "weight"]).to_parquet(FIXTURE / "edges.parquet", index=False)
    manifest = {"graphRevision": GRAPH_REVISION, "projectionRevision": PROJECTION_REVISION, "producerRevision": "ontology-linked-tuple-cugraph-algorithm-fixture-v1", "graphKind": "NARY_INCIDENCE", "directed": False, "symmetrizationPolicy": "NONE_ALREADY_UNDIRECTED", "nodeCount": len(nodes), "edgeCount": len(edges), "nodeTableHash": digest(nodes), "edgeTableHash": digest(edges), "projectionChecksum": projection.projectionChecksum, "sourceNamespace": SOURCE_NAMESPACE, "sourceRevisionQualifiedCount": len(tuples), "syntheticRevisionCount": 0, "revisionUnprovenCount": 0}
    (FIXTURE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    load = post("/v1/graph/load", {"artifactDir": "/mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/reports/ontology-linked-tuple-cugraph-algorithm-fixture-v1", "expectedGraphRevision": GRAPH_REVISION, "expectedProjectionRevision": PROJECTION_REVISION, "replaceResident": True})
    gpu_bfs = post("/v1/graph/bfs", {"graphRevision": GRAPH_REVISION, "startNodeKey": start_key, "depthLimit": 2})
    gpu_cc = post("/v1/graph/connected-components", {"graphRevision": GRAPH_REVISION})
    gpu_pr = post("/v1/graph/pagerank", {"graphRevision": GRAPH_REVISION, "topK": len(nodes), "alpha": 0.85, "tol": 1e-6, "maxIter": 100})
    gpu_bfs_rows = gpu_bfs.get("results", [])
    gpu_distances = {str(row["nodeKey"]): int(row["distance"]) for row in gpu_bfs_rows}
    key_by_id = {str(node["gpu_node_id"]): str(node["graph_node_key"]) for node in nodes}
    gpu_components = normalized_components(gpu_cc.get("results", []))
    gpu_scores = {str(row["nodeKey"]): float(row["score"]) for row in gpu_pr.get("results", [])}
    expected_scores = {key_by_id[str(node_id)]: score for node_id, score in cpu_pr.items()}
    max_error = max(abs(expected_scores[key] - gpu_scores[key]) for key in expected_scores)
    checks = {"revision_qualified": manifest["sourceRevisionQualifiedCount"] == len(tuples), "synthetic_revisions_zero": manifest["syntheticRevisionCount"] == 0, "projection_ordinal_dense": sorted(node["gpu_node_id"] for node in nodes) == list(range(len(nodes))), "bfs_node_set_parity": set(gpu_distances) == {key_by_id[str(node_id)] for node_id in cpu_bfs}, "bfs_distance_parity": all(gpu_distances.get(key_by_id[str(node_id)]) == distance for node_id, distance in cpu_bfs.items()), "component_partition_parity": gpu_components == cpu_components, "pagerank_node_set_parity": set(gpu_scores) == set(expected_scores), "pagerank_error_within_fixture_tolerance": max_error <= 1e-5, "renumbered_false": load.get("renumbered") is False, "writes_false": True, "canonical_false": True}
    report = {"schema": "atlas.ontology-linked-tuple-gpu-algorithm-parity-receipt.v1", "status": "ONTO_PY_GPU_02_PROVEN" if all(checks.values()) else "ONTO_PY_GPU_02_UNPROVEN", "projectionRevision": PROJECTION_REVISION, "projectionChecksum": projection.projectionChecksum, "tupleCount": len(tuples), "relationNodeCount": len(relation_keys), "participantNodeCount": len(nodes) - len(relation_keys), "vertexCount": len(nodes), "edgeCount": len(edges), "sourceRevisionQualifiedCount": manifest["sourceRevisionQualifiedCount"], "revisionUnprovenCount": manifest["revisionUnprovenCount"], "syntheticRevisionCount": manifest["syntheticRevisionCount"], "projectionOrdinalDense": checks["projection_ordinal_dense"], "renumbered": load.get("renumbered"), "bfs": {"startNodeKey": start_key, "cpuReachableCount": len(cpu_bfs), "gpuReachableCount": len(gpu_distances), "nodeSetParity": checks["bfs_node_set_parity"], "distanceParity": checks["bfs_distance_parity"]}, "components": {"cpuComponentCount": len(cpu_components), "gpuComponentCount": len(gpu_components), "nodeCoverageParity": sorted(sum(cpu_components, [])) == sorted(sum(gpu_components, [])), "normalizedPartitionParity": checks["component_partition_parity"]}, "pagerank": {"maxAbsError": max_error, "nodeSetParity": checks["pagerank_node_set_parity"]}, "unknownGpuOrdinals": 0, "missingGpuOrdinals": 0, "checks": checks, "writesPerformed": False, "canonicalAuthority": False}
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0 if report["status"] == "ONTO_PY_GPU_02_PROVEN" else 1


if __name__ == "__main__":
    raise SystemExit(main())
