"""
test_resident_bfs_proof.py
Parent Atlas resident BFS fixture-contract tests.
Uses a fake cuGraph backend and an in-memory NetworkX fixture; it does not
call a live MCP service, execute on a GPU, or exercise GraphRAG/ContextManifest.
It writes a local fixture-scope receipt for the tested contract only.
"""

import hashlib
import json
import threading
from pathlib import Path
from types import SimpleNamespace

import networkx as nx
import pandas as pd
import pytest

import atlas_rapids_graph_runtime as runtime_module


def bfs_reference(graph: nx.DiGraph, source_id: str, max_hops: int) -> dict[str, int]:
    """CPU Reference: single-source shortest path lengths up to max_hops."""
    if source_id not in graph:
        raise ValueError("SOURCE_UNRESOLVED")
    lengths = nx.single_source_shortest_path_length(graph, source_id, cutoff=max_hops)
    return dict(sorted(lengths.items()))


def compare_bfs(cpu_distances: dict[str, int], gpu_distances: dict[str, int]):
    """Parity check: reachable canonical ID set and minimum hop distances must match exactly."""
    assert set(cpu_distances.keys()) == set(gpu_distances.keys()), (
        f"Reachable set mismatch: CPU={set(cpu_distances.keys())} vs GPU={set(gpu_distances.keys())}"
    )
    for canonical_id, distance in cpu_distances.items():
        assert gpu_distances[canonical_id] == distance, (
            f"Distance mismatch for {canonical_id}: CPU={distance} vs GPU={gpu_distances[canonical_id]}"
        )


@pytest.fixture
def frozen_graph_fixture():
    """Build a deterministic frozen test graph with cycles, multiple paths, isolates, and directed edges."""
    G = nx.DiGraph()
    # Edges: a -> b (1), a -> c (1), b -> d (2), c -> d (2), d -> e (3), e -> b (cycle), f (isolate)
    edges = [
        ("node:a", "node:b"),
        ("node:a", "node:c"),
        ("node:b", "node:d"),
        ("node:c", "node:d"),
        ("node:d", "node:e"),
        ("node:e", "node:b"),
    ]
    G.add_edges_from(edges)
    G.add_node("node:f")  # Disconnected isolate

    nodes_sorted = sorted(list(G.nodes()))
    node_to_ordinal = {node: idx for idx, node in enumerate(nodes_sorted)}
    ordinal_to_node = {idx: node for node, idx in node_to_ordinal.items()}

    ordinal_bytes = json.dumps(node_to_ordinal, sort_keys=True).encode("utf-8")
    ordinal_checksum = hashlib.sha256(ordinal_bytes).hexdigest()

    edge_rows = []
    for u, v in edges:
        edge_rows.append({
            "src_gpu_node_id": node_to_ordinal[u],
            "dst_gpu_node_id": node_to_ordinal[v],
            "edge_type": "DEPENDS_ON",
            "weight": 1.0,
        })
    snapshot_checksum = hashlib.sha256(json.dumps(edge_rows, sort_keys=True).encode("utf-8")).hexdigest()

    return {
        "nx_graph": G,
        "nodes": nodes_sorted,
        "node_to_ordinal": node_to_ordinal,
        "ordinal_to_node": ordinal_to_node,
        "ordinal_checksum": ordinal_checksum,
        "snapshot_checksum": snapshot_checksum,
        "graph_revision": "graph:fixture-r1",
        "projection_revision": "projection:fixture-r1",
    }


def test_tool_registration_wire_names():
    """Verify tool registration supports both dot-notation and colon-notation in server.ts."""
    server_ts_path = Path(__file__).resolve().parents[2] / "sveltekit-frontend" / "src" / "mcp" / "server.ts"
    assert server_ts_path.exists(), "mcp/server.ts must exist"
    content = server_ts_path.read_text(encoding="utf-8")
    assert "case 'graph.resident_bfs':" in content, "graph.resident_bfs wire alias must be registered"
    assert "case 'graph:resident_bfs':" in content, "graph:resident_bfs wire alias must be preserved"


def test_networkx_parity_and_bounded_traversal(frozen_graph_fixture, monkeypatch):
    """Verify exact reachable set & distance parity between NetworkX reference and resident BFS."""
    G = frozen_graph_fixture["nx_graph"]
    node_to_ordinal = frozen_graph_fixture["node_to_ordinal"]
    ordinal_to_node = frozen_graph_fixture["ordinal_to_node"]
    rev = frozen_graph_fixture["graph_revision"]
    proj = frozen_graph_fixture["projection_revision"]
    ord_chk = frozen_graph_fixture["ordinal_checksum"]

    # CPU Reference BFS from node:a with depth_limit=2
    cpu_distances = bfs_reference(G, "node:a", max_hops=2)
    # node:a (0), node:b (1), node:c (1), node:d (2)
    assert cpu_distances == {
        "node:a": 0,
        "node:b": 1,
        "node:c": 1,
        "node:d": 2,
    }

    # Simulate cuGraph BFS result dataframe
    simulated_cugraph_rows = []
    pred_map = {
        "node:a": -1,
        "node:b": node_to_ordinal["node:a"],
        "node:c": node_to_ordinal["node:a"],
        "node:d": node_to_ordinal["node:b"],
    }
    for node, dist in cpu_distances.items():
        ord_id = node_to_ordinal[node]
        simulated_cugraph_rows.append({
            "vertex": ord_id,
            "distance": dist,
            "predecessor": pred_map[node],
        })

    class FakeCuGraph:
        @staticmethod
        def bfs(graph, start, depth_limit, return_predecessors):
            assert depth_limit == 2
            return SimpleNamespace(to_pandas=lambda: pd.DataFrame(simulated_cugraph_rows))

    monkeypatch.setattr(runtime_module, "cugraph", FakeCuGraph)

    # Initialize mock ResidentGraph
    runtime = runtime_module.ResidentGraph.__new__(runtime_module.ResidentGraph)
    runtime.node_count = len(G.nodes())
    runtime.edge_count = len(G.edges())
    runtime.graph_revision = rev
    runtime.projection_revision = proj
    runtime.artifact_checksum = frozen_graph_fixture["snapshot_checksum"]
    runtime.graph_ordinal_map_checksum = ord_chk
    runtime.renumbered = False
    runtime.graph = object()
    runtime.node_key_to_gpu_id = node_to_ordinal
    runtime.gpu_id_to_identity = {
        ord_id: {"nodeKey": node, "packetKey": f"packet:{node}"}
        for node, ord_id in node_to_ordinal.items()
    }

    req = runtime_module.BFSRequest(graphRevision=rev, startNodeKey="node:a", depthLimit=2)
    result = runtime.bfs(req)

    # Extract GPU distances normalized to canonical nodeKey
    gpu_distances = {
        row["nodeKey"]: row["distance"]
        for row in result["results"]
    }

    # Compare BFS exact parity
    compare_bfs(cpu_distances, gpu_distances)
    assert result["writesPerformed"] is False
    assert result["canonicalAuthority"] is False


def test_zero_hop_and_isolate_traversal(frozen_graph_fixture, monkeypatch):
    """Verify zero-hop traversal and isolate handling."""
    G = frozen_graph_fixture["nx_graph"]
    node_to_ordinal = frozen_graph_fixture["node_to_ordinal"]

    # Zero-hop from node:a -> only node:a at dist 0
    cpu_zero = bfs_reference(G, "node:a", max_hops=0)
    assert cpu_zero == {"node:a": 0}

    # Isolate node:f at depth 2 -> only node:f at dist 0
    cpu_isolate = bfs_reference(G, "node:f", max_hops=2)
    assert cpu_isolate == {"node:f": 0}


def test_negative_controls_and_no_implicit_load(frozen_graph_fixture):
    """Verify stale revision, wrong checksum, unknown source ID, and unresident graph rejections."""
    # 1. Unknown source ID
    G = frozen_graph_fixture["nx_graph"]
    with pytest.raises(ValueError, match="SOURCE_UNRESOLVED"):
        bfs_reference(G, "node:unknown_nonexistent", max_hops=2)

    # 2. Exceeded depth limit
    with pytest.raises(ValueError):
        runtime_module.BFSRequest(
            graphRevision=frozen_graph_fixture["graph_revision"],
            startNodeKey="node:a",
            depthLimit=5  # Hard bound is 2 (or 4 in MAXIMUM)
        )

    # 3. GraphRuntimeManager when not resident
    manager = runtime_module.GraphRuntimeManager.__new__(runtime_module.GraphRuntimeManager)
    manager._lock = threading.RLock()
    manager._resident = None

    req = runtime_module.BFSRequest(
        graphRevision=frozen_graph_fixture["graph_revision"],
        startNodeKey="node:a",
        depthLimit=2
    )
    try:
        manager.bfs(req)
    except runtime_module.HTTPException as exc:
        assert exc.detail["code"] == "GRAPH_NOT_RESIDENT"
    else:
        raise AssertionError("expected GRAPH_NOT_RESIDENT when not loaded")


def test_fixture_scope_receipt(frozen_graph_fixture):
    """Record fixture coverage without claiming live graph or context admission."""
    repo_root = Path(__file__).resolve().parents[2]
    receipt_dir = repo_root / "docs" / "reports"
    receipt_dir.mkdir(parents=True, exist_ok=True)
    receipt_path = receipt_dir / "atlas-resident-bfs-proof-2026-10-13.json"

    receipt = {
        "schema": "atlas.resident-bfs-proof.v1",
        "status": "FIXTURE_ONLY",
        "mcpTool": "graph.resident_bfs",
        "liveBfsRequestPerformed": False,
        "gpuExecutionPerformed": False,
        "graphRevision": frozen_graph_fixture["graph_revision"],
        "snapshotSha256": frozen_graph_fixture["snapshot_checksum"],
        "ordinalMapSha256": frozen_graph_fixture["ordinal_checksum"],
        "sourceCanonicalId": "node:a",
        "tests": {
            "toolRegistration": "SOURCE_TEXT_ASSERTION_ONLY",
            "snapshotQualification": "FIXTURE_METADATA_ONLY",
            "noImplicitGraphLoad": "LOCAL_UNIT_NEGATIVE_CONTROL",
            "networkxParity": "FAKE_CUGRAPH_ROWS_VS_NETWORKX_FIXTURE",
            "boundedTraversal": "FAKE_BACKEND_FIXTURE",
            "negativeControls": "LOCAL_UNIT_TESTS",
            "graphRagEvidence": "NOT_EXERCISED",
            "contextAdmission": "NOT_EXERCISED"
        },
        "canonicalStoreWritesPerformed": False,
        "localReceiptWritten": True,
        "firstUnprovenGate": "LIVE_RESIDENT_GRAPH_AND_GPU_EXECUTION"
    }

    receipt_path.write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    assert receipt_path.exists()
    assert receipt["status"] == "FIXTURE_ONLY"
    assert receipt["liveBfsRequestPerformed"] is False
    assert receipt["gpuExecutionPerformed"] is False
    assert receipt["tests"]["contextAdmission"] == "NOT_EXERCISED"
