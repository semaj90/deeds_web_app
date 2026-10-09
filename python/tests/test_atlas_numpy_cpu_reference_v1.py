from __future__ import annotations

import unittest

import numpy as np

from atlas_numpy_cpu_reference_v1 import exact_cosine_topk


class ExactCosineCpuTest(unittest.TestCase):
    def test_orders_by_score_then_row_id_deterministically(self) -> None:
        matrix = np.array([[1, 0], [0, 1], [1, 1], [1, 1]], dtype=np.float32)
        row_ids = ["b", "a", "d", "c"]

        result = exact_cosine_topk(matrix, [1, 0], k=3, row_ids=row_ids)

        self.assertEqual([row_id for row_id, _ in result], ["b", "c", "d"])
        self.assertEqual(result, exact_cosine_topk(matrix, [1, 0], k=3, row_ids=row_ids))

    def test_rejects_shape_mismatch_and_empty_vectors(self) -> None:
        with self.assertRaisesRegex(ValueError, "EMBEDDING_SHAPE_MISMATCH"):
            exact_cosine_topk([[1, 0]], [1], k=1, row_ids=["a"])
        with self.assertRaisesRegex(ValueError, "EMPTY_VECTOR_MATRIX"):
            exact_cosine_topk([], [], k=1, row_ids=[])

    def test_rejects_zero_norm_and_nonfinite_vectors(self) -> None:
        with self.assertRaisesRegex(ValueError, "ZERO_NORM_VECTOR"):
            exact_cosine_topk([[0, 0]], [1, 0], k=1, row_ids=["a"])
        with self.assertRaisesRegex(ValueError, "NONFINITE_VECTOR"):
            exact_cosine_topk([[float("nan"), 1]], [1, 0], k=1, row_ids=["a"])

    def test_rejects_duplicate_or_invalid_row_ids(self) -> None:
        with self.assertRaisesRegex(ValueError, "DUPLICATE_ROW_ID"):
            exact_cosine_topk([[1, 0], [0, 1]], [1, 0], k=1, row_ids=["a", "a"])
        with self.assertRaisesRegex(ValueError, "ROW_IDENTITY_INVALID"):
            exact_cosine_topk([[1, 0]], [1, 0], k=1, row_ids=[""])

    def test_rejects_invalid_top_k(self) -> None:
        for k in (0, 2, True, 1.5):
            with self.subTest(k=k), self.assertRaisesRegex(ValueError, "TOPK_INVALID"):
                exact_cosine_topk([[1, 0]], [1, 0], k=k, row_ids=["a"])


if __name__ == "__main__":
    unittest.main()
