"""Tests for 4D topology L1 and NetworkX parity specs (knn, bfs, dijkstra, astar)."""
from __future__ import annotations

from pathlib import Path

import networkx as nx
import numpy as np

from atlas_graph_runtime.graph_algorithm_parity_v1 import (
    verify_bfs_parity,
    verify_knn_tie_aware_recall,
    verify_shortest_path_parity,
    write_graph_pass_parity_receipt,
)
from atlas_graph_runtime.topology_4d_l1_v1 import topology_4d_l1_knn


def test_topology_4d_l1_knn_deterministic() -> None:
    coords = np.array(
        [
            [0.9, 0.8, 0.2, 0.7],
            [0.1, 0.2, 0.9, 0.1],
            [0.85, 0.8, 0.25, 0.7],
        ],
        dtype=np.float32,
    )
    res = topology_4d_l1_knn([0.9, 0.8, 0.2, 0.7], coords, ["pkt:a", "pkt:b", "pkt:c"], top_k=2)
    assert res["canonical_authority"] is False
    assert res["writes_performed"] is False
    assert [h["packet_key"] for h in res["hits"]] == ["pkt:a", "pkt:c"]
    assert res["hits"][0]["l1_distance_4d"] == 0.0


def test_networkx_parity_and_receipts(tmp_path: Path) -> None:
    # 1. KNN tie-aware recall (orthogonal pairs test tie-tolerance cleanly)
    vecs = {
        "n1": [1.0, 0.0, 0.0, 0.0],
        "n2": [0.99, 0.1, 0.0, 0.0],
        "n3": [0.0, 0.0, 1.0, 0.0],
        "n4": [0.0, 0.0, 0.99, 0.1],
    }
    knn_cands = {"n1": ["n2", "n3"], "n2": ["n1", "n3"], "n3": ["n4", "n1"], "n4": ["n3", "n1"]}
    knn_res = verify_knn_tie_aware_recall(knn_cands, vecs, k=2)
    assert knn_res["passed"] is True

    # 2. Graph for BFS, Dijkstra, A*
    g = nx.Graph()
    g.add_edge("a", "b", weight=1.0)
    g.add_edge("b", "c", weight=1.5)
    g.add_edge("a", "d", weight=4.0)
    g.add_edge("d", "c", weight=1.0)
    coords = {"a": (0.0, 0.0), "b": (1.0, 0.0), "c": (2.0, 0.0), "d": (1.0, 2.0)}

    bfs_res = verify_bfs_parity(g, "a", {"a": 0, "b": 1, "d": 1, "c": 2}, max_depth=2)
    assert bfs_res["passed"] is True

    dijk_res = verify_shortest_path_parity("dijkstra", g, "a", "c", ["a", "b", "c"], 2.5)
    assert dijk_res["passed"] is True

    astar_res = verify_shortest_path_parity("astar", g, "a", "c", ["a", "b", "c"], 2.5, coords=coords)
    assert astar_res["passed"] is True

    for algo, payload in [("knn", knn_res), ("bfs", bfs_res), ("dijkstra", dijk_res), ("astar", astar_res)]:
        p = write_graph_pass_parity_receipt(algo, payload, tmp_path, date_tag="20261128")
        assert p.exists()
