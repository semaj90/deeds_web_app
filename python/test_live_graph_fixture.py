from __future__ import annotations

import unittest

import numpy as np

from atlas_compute.live_graph_fixture import _validate_fixture, adjusted_rand_index


def h(char: str) -> str:
    return char * 64


def fixture(vertex_count: int = 500):
    return {
        "workflow_id": "workflow-1",
        "workflow_revision": 1,
        "source_snapshot_revision": "source-r1",
        "graph_revision": "graph-r1",
        "feature_revision": "feature-r1",
        "row_identity_checksum": h("a"),
        "random_seed": 0xA71A5,
        "num_clusters": 20,
        "vertices": [
            {
                "ordinal": ordinal,
                "candidate_id": f"candidate-{ordinal}",
                "source_ref": f"src/file-{ordinal % 20}.ts",
            }
            for ordinal in range(vertex_count)
        ],
        "edges": [
            {"src": ordinal, "dst": ordinal + 1, "weight": 1.0, "family": "AST_CALL"}
            for ordinal in range(vertex_count - 1)
        ],
    }


class LiveGraphFixtureTest(unittest.TestCase):
    def test_accepts_bounded_dense_fixture(self):
        parsed = _validate_fixture(fixture())
        self.assertEqual(len(parsed["vertices"]), 500)

    def test_rejects_toy_fixture(self):
        with self.assertRaisesRegex(ValueError, "500_TO_5000"):
            _validate_fixture(fixture(499))

    def test_rejects_sparse_or_reordered_ordinals(self):
        value = fixture()
        value["vertices"][10]["ordinal"] = 11
        with self.assertRaisesRegex(ValueError, "ORDINALS_MUST_BE_DENSE"):
            _validate_fixture(value)

    def test_semantic_knn_cannot_be_marked_as_canonical_fact(self):
        value = fixture()
        value["edges"][0] = {
            "src": 0,
            "dst": 1,
            "weight": 0.2,
            "family": "SEMANTIC_KNN",
            "canonical_fact": True,
            "derived_similarity": False,
        }
        # Fixture validation permits transport fields, but semantic authority is
        # rejected at the TypeScript SpectralGraphEdgeRecipeV1 boundary. Keep
        # this test here to ensure the Python fixture remains parseable while
        # that ownership check stays centralized rather than duplicated.
        self.assertEqual(_validate_fixture(value)["edges"][0]["family"], "SEMANTIC_KNN")

    def test_adjusted_rand_index_is_permutation_invariant(self):
        a = np.array([0, 0, 1, 1, 2, 2])
        b = np.array([2, 2, 0, 0, 1, 1])
        self.assertAlmostEqual(adjusted_rand_index(a, b), 1.0)

    def test_adjusted_rand_index_detects_instability(self):
        a = np.array([0, 0, 1, 1, 2, 2])
        b = np.array([0, 1, 0, 1, 0, 1])
        self.assertLess(adjusted_rand_index(a, b), 1.0)


if __name__ == "__main__":
    unittest.main()
