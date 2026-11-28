"""Authorized golden graph parity tests (cycles, duplicates, stale/superseded/foreign rejection)."""

from __future__ import annotations

import json
import pathlib
import subprocess
from dataclasses import dataclass

import numpy as np
import pytest

from python.tests.oracles import atlas_reference_v1 as oracle

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
BRIDGE_NODE = REPO_ROOT / "simd-bridge" / "cpp" / "build-x64-cuda" / "Release" / "tensorrt_bridge.node"


@dataclass(frozen=True)
class GoldenNode:
    node_id: int
    kind: str  # task | document | chunk | symbol | obo_concept | entity | error | test
    workspace: str
    graph_revision: str
    superseded: bool
    key: oracle.SourceKey


def _build_golden_fixture():
    nodes = [
        GoldenNode(0, "task", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "t0", "task/0", "sha0")),
        GoldenNode(1, "document", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "d1", "src/a.ts", "sha1")),
        GoldenNode(2, "chunk", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "c2", "src/a.ts#L1", "sha2")),
        GoldenNode(3, "symbol", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "s3", "src/a.ts#fn", "sha3")),
        GoldenNode(4, "obo_concept", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "o4", "obo:ATLAS_001", "sha4")),
        GoldenNode(5, "entity", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "e5", "ent:SearchRuntime", "sha5")),
        GoldenNode(6, "error", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "err6", "err:PG57014", "sha6")),
        GoldenNode(7, "test", "ws1", "grev-2", False, oracle.SourceKey("ws1", "rev1", "tst7", "test/a.spec.ts", "sha7")),
        GoldenNode(8, "chunk", "ws1", "grev-1", False, oracle.SourceKey("ws1", "rev1", "stale8", "src/old.ts", "sha8")),  # stale revision
        GoldenNode(9, "symbol", "ws1", "grev-2", True, oracle.SourceKey("ws1", "rev1", "sup9", "src/sup.ts", "sha9")),   # superseded
        GoldenNode(10, "document", "ws_other", "grev-2", False, oracle.SourceKey("ws_other", "rev1", "for10", "src/foreign.ts", "sha10")),  # foreign workspace
    ]

    # Raw edges include cycles (0->1->2->0), duplicates, stale, superseded, and foreign-workspace links
    raw_edges = [
        (0, 1), (0, 1), (1, 2), (2, 0),  # cycle + duplicate
        (1, 3), (2, 4), (3, 5), (3, 6), (6, 7),
        (0, 8), (1, 9), (2, 10),         # unauthorized: stale, superseded, foreign
    ]

    eligible_nodes = {
        n.node_id: n
        for n in nodes
        if n.workspace == "ws1" and n.graph_revision == "grev-2" and not n.superseded
    }
    authorized_edges = [
        (u, v) for (u, v) in raw_edges if u in eligible_nodes and v in eligible_nodes
    ]
    return nodes, eligible_nodes, authorized_edges


def test_golden_graph_csr_bfs_and_unauthorized_rejection() -> None:
    """Verify authorized golden graph CSR + native graphBFSExtended matches oracle bounded_bfs."""
    if not BRIDGE_NODE.is_file():
        pytest.skip("tensorrt_bridge.node not built")

    nodes, eligible_nodes, authorized_edges = _build_golden_fixture()
    n = len(nodes)
    offsets, cols = oracle.csr_from_edges(n, authorized_edges)

    scope = oracle.Scope(
        "task:golden-graph",
        "ws1",
        "rev1",
        frozenset(node.key for node in eligible_nodes.values()),
    )
    neighbors: dict[oracle.SourceKey, list[oracle.SourceKey]] = {node.key: [] for node in nodes}
    for u, v in authorized_edges:
        neighbors[nodes[u].key].append(nodes[v].key)

    oracle_bfs = oracle.bounded_bfs([nodes[0].key], neighbors, scope, max_depth=3, max_nodes=n, fanout=8)
    oracle_depths = {
        next(node.node_id for node in nodes if node.key == key): depth
        for key, depth in oracle_bfs
    }

    js = f"""
    const addon = require({json.dumps(str(BRIDGE_NODE))});
    const rowPtr = new Int32Array({json.dumps(offsets.astype(np.int32).tolist())});
    const colIdx = new Int32Array({json.dumps(cols.astype(np.int32).tolist())});
    const out = addon.graphBFSExtended(rowPtr, colIdx, 0, 3, {n}, 1000);
    console.log(JSON.stringify({{
        visited: Array.from(out.visited),
        distances: Array.from(out.distances),
    }}));
    """
    out_raw = subprocess.check_output(["node", "-"], input=js, text=True, timeout=15)
    got = json.loads(out_raw.strip().splitlines()[-1])

    visited_set = set(got["visited"])
    assert visited_set == set(oracle_depths.keys())
    # Stale (8), superseded (9), and foreign-workspace (10) nodes must never be reached.
    assert visited_set.isdisjoint({8, 9, 10})
    for nid, depth in oracle_depths.items():
        assert got["distances"][nid] == depth
