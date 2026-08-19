from __future__ import annotations

import unittest

import numpy as np

from atlas_compute.graph_programs import condense_and_lexicographically_sort, deterministic_bfs
from atlas_compute.representation_compare import compare_representations
from atlas_compute.spectral import symmetric_eigenspace


class AtlasGraphRepresentationTests(unittest.TestCase):
    def test_bfs_is_deterministic_by_canonical_id(self) -> None:
        nodes = ["d", "c", "b", "a"]
        edges = [("a", "c"), ("a", "b"), ("b", "d"), ("c", "d")]
        first = deterministic_bfs(nodes, edges, ["a"], depth_limit=2)
        second = deterministic_bfs(list(reversed(nodes)), list(reversed(edges)), ["a"], depth_limit=2)
        self.assertEqual(first.output_checksum, second.output_checksum)
        self.assertEqual(first.layers, [["a"], ["b", "c"], ["d"]])
        self.assertEqual(first.predecessor_by_id["d"], "b")

    def test_condensation_contracts_cycles_before_topological_order(self) -> None:
        receipt = condense_and_lexicographically_sort(
            ["a", "b", "c", "d"],
            [("a", "b"), ("b", "a"), ("b", "c"), ("c", "d")],
        )
        self.assertEqual(receipt.cyclic_component_count, 1)
        cyclic = next(members for members in receipt.component_members if members == ["a", "b"])
        self.assertEqual(cyclic, ["a", "b"])
        self.assertEqual(len(receipt.lexicographic_component_order), len(receipt.component_members))

    def test_spectral_receipt_is_sign_invariant_via_projector(self) -> None:
        matrix = np.array([[2.0, 1.0], [1.0, 2.0]], dtype=np.float64)
        vectors, receipt = symmetric_eigenspace(matrix, component_count=1, largest=True)
        flipped = -vectors
        projector = vectors @ vectors.T
        flipped_projector = flipped @ flipped.T
        self.assertTrue(np.allclose(projector, flipped_projector))
        self.assertGreater(receipt.eigenvalues[0], 0)
        self.assertFalse(receipt.canonical_authority)

    def test_representation_comparison_prefers_neighborhood_preservation(self) -> None:
        reference = np.array([[0, 0], [1, 0], [0, 1], [10, 10]], dtype=np.float32)
        good = reference[:, :1] + np.array([[0], [0.01], [0.02], [10]], dtype=np.float32)
        bad = np.array([[0], [10], [20], [30]], dtype=np.float32)
        receipt = compare_representations(reference, {"good": good, "bad": bad}, k=1)
        self.assertEqual(receipt.recommended_representation, "good")
        self.assertFalse(receipt.canonical_authority)


if __name__ == "__main__":
    unittest.main()
