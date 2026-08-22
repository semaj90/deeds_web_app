from __future__ import annotations

import unittest

from atlas_compute.cluster_softmax import (
    DEFAULT_PREDICTION_BATCH_SIZE,
    resolve_prediction_batch_size,
)


class ClusterSoftmaxConfigTests(unittest.TestCase):
    def test_zero_prediction_batch_selects_bounded_default(self) -> None:
        self.assertEqual(resolve_prediction_batch_size(0), DEFAULT_PREDICTION_BATCH_SIZE)

    def test_explicit_prediction_batch_is_preserved(self) -> None:
        self.assertEqual(resolve_prediction_batch_size(4096), 4096)

    def test_negative_prediction_batch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            resolve_prediction_batch_size(-1)


if __name__ == "__main__":
    unittest.main()
