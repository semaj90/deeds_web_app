#!/usr/bin/env python3
"""test_procedural_canary_graph_router_v1.py — Offline test suite for canary selection and graph navigation."""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from atlas_compute.ast_chunk_routing_helpers import AstChunkRouteTuple
from atlas_compute.procedural_canary_graph_router_v1 import (
    GraphChunkNavigator,
    ProceduralCanarySelector,
)


class TestProceduralCanarySelector(unittest.TestCase):
    def setUp(self):
        self.selector = ProceduralCanarySelector()

    def test_select_turbovec_k150_for_95_recall(self):
        choice = self.selector.select_best_hyperparameters("turbovec-http-ann", target_recall=0.95)
        self.assertEqual(choice.sequence_id, "turbovec-http-ann:k=150")
        self.assertEqual(choice.hyperparameters.get("retrieve_k"), 150)
        self.assertGreaterEqual(choice.recall_top10, 0.95)
        self.assertAlmostEqual(choice.p50_ms, 6.67, places=2)

    def test_select_turbovec_k100_for_94_recall(self):
        choice = self.selector.select_best_hyperparameters("turbovec-http-ann", target_recall=0.94)
        self.assertEqual(choice.sequence_id, "turbovec-http-ann:k=100")
        self.assertEqual(choice.hyperparameters.get("retrieve_k"), 100)
        self.assertGreaterEqual(choice.recall_top10, 0.94)
        self.assertAlmostEqual(choice.p50_ms, 5.80, places=2)

    def test_select_pgvector_hnsw(self):
        choice = self.selector.select_best_hyperparameters("pgvector-hnsw-768", target_recall=0.92)
        self.assertIn("pgvector-hnsw-768", choice.sequence_id)
        self.assertGreaterEqual(choice.recall_top10, 0.92)


class TestGraphChunkNavigator(unittest.TestCase):
    def setUp(self):
        # Create a linear bidirectional chain of 5 chunks: 0 <-> 1 <-> 2 <-> 3 <-> 4
        self.chunks = [
            AstChunkRouteTuple("src/a.ts", "rev1", 0, 100, 1, 0x01, prev_ordinal=-1, next_ordinal=1),
            AstChunkRouteTuple("src/b.ts", "rev1", 100, 200, 1, 0x01, prev_ordinal=0, next_ordinal=2),
            AstChunkRouteTuple("src/c.ts", "rev1", 200, 300, 1, 0x01, prev_ordinal=1, next_ordinal=3),
            AstChunkRouteTuple("src/d.ts", "rev1", 300, 400, 1, 0x01, prev_ordinal=2, next_ordinal=4),
            AstChunkRouteTuple("src/e.ts", "rev1", 400, 500, 1, 0x01, prev_ordinal=3, next_ordinal=-1),
        ]
        self.navigator = GraphChunkNavigator(self.chunks)

    def test_bfs_traversal_depth(self):
        # Traversal from middle node 2 with depth 1 should hit [2, 1, 3]
        visited = self.navigator.bfs_traverse(start_ordinal=2, max_depth=1)
        self.assertEqual(set(visited), {1, 2, 3})

        # Traversal with depth 2 should reach all 5 nodes
        all_visited = self.navigator.bfs_traverse(start_ordinal=2, max_depth=2)
        self.assertEqual(set(all_visited), {0, 1, 2, 3, 4})

    def test_astar_search_path(self):
        # Path from start node 0 to end node 4
        path = self.navigator.astar_search(
            start_ordinal=0,
            is_goal=lambda c: c.source_ref == "src/e.ts",
            heuristic_fn=lambda c: abs(4 - c.end_byte // 100),
        )
        self.assertEqual(path, [0, 1, 2, 3, 4])

    def test_subgraph_pagerank(self):
        scores = self.navigator.compute_subgraph_pagerank([0, 1, 2, 3, 4])
        self.assertEqual(len(scores), 5)
        # Probabilities must sum approximately to 1.0
        total_p = sum(scores.values())
        self.assertAlmostEqual(total_p, 1.0, places=2)
        # Central node 2 should have equal or higher PageRank than leaf node 0
        self.assertGreater(scores[2], scores[0])


if __name__ == "__main__":
    unittest.main()
