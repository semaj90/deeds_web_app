from __future__ import annotations

import unittest

import numpy as np

from atlas_compute.cluster_softmax import (
    DEFAULT_PREDICTION_BATCH_SIZE,
    _as_cupy_array,
    resolve_prediction_batch_size,
    run_cuvs_soft_kmeans,
)


class ClusterSoftmaxConfigTests(unittest.TestCase):
    def test_zero_prediction_batch_selects_bounded_default(self) -> None:
        self.assertEqual(resolve_prediction_batch_size(0), DEFAULT_PREDICTION_BATCH_SIZE)

    def test_explicit_prediction_batch_is_preserved(self) -> None:
        self.assertEqual(resolve_prediction_batch_size(4096), 4096)

    def test_negative_prediction_batch_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            resolve_prediction_batch_size(-1)


class _FakeCupyArray:
    """Stands in for cupy.ndarray: supports arithmetic."""

    def __init__(self, payload: object) -> None:
        self.payload = payload

    def __mul__(self, other: "_FakeCupyArray") -> "_FakeCupyArray":
        return _FakeCupyArray(("squared", self.payload))


class _FakeCupyModule:
    ndarray = _FakeCupyArray

    @staticmethod
    def asarray(value: object) -> _FakeCupyArray:
        return _FakeCupyArray(value)


class _FakePylibraftDeviceNdarray:
    """Stands in for pylibraft device_ndarray (cuVS 26.6 pairwise_distance result): no arithmetic."""

    __cuda_array_interface__ = {"shape": (1,), "typestr": "<f4", "version": 3}


class CuvsDeviceArrayAdapterTests(unittest.TestCase):
    """Regression: cuVS 26.6 returned an object that raised TypeError on `euclidean * euclidean`."""

    def test_device_ndarray_has_no_arithmetic_until_converted(self) -> None:
        raw = _FakePylibraftDeviceNdarray()
        with self.assertRaises(TypeError):
            raw * raw  # type: ignore[operator]
        converted = _as_cupy_array(raw, _FakeCupyModule)
        self.assertIsInstance(converted, _FakeCupyArray)
        self.assertEqual((converted * converted).payload[0], "squared")

    def test_cupy_array_passes_through_unchanged(self) -> None:
        array = _FakeCupyArray("already-cupy")
        self.assertIs(_as_cupy_array(array, _FakeCupyModule), array)


def _cuvs_gpu_available() -> bool:
    try:
        import cupy  # noqa: F401
        import cuvs  # noqa: F401
        import torch

        return bool(torch.cuda.is_available())
    except Exception:
        return False


@unittest.skipUnless(_cuvs_gpu_available(), "needs the WSL atlas-rapids-cu13 environment with a free GPU")
class CuvsSoftKMeansGpuRegressionTests(unittest.TestCase):
    def test_small_run_is_finite_normalized_and_non_authoritative(self) -> None:
        rng = np.random.default_rng(7)
        k, per, dim = 4, 200, 64
        centers = rng.normal(size=(k, dim)).astype(np.float32) * 4.0
        matrix = np.concatenate([centers[c] + 0.2 * rng.normal(size=(per, dim)) for c in range(k)]).astype(np.float32)

        labels, centroids, probabilities, receipt = run_cuvs_soft_kmeans(
            matrix, n_clusters=k, input_normalization="l2_row", max_iter=20,
        )

        self.assertEqual(labels.shape, (k * per,))
        self.assertEqual(centroids.shape, (k, dim))
        self.assertEqual(probabilities.shape, (k * per, k))
        self.assertTrue(np.isfinite(probabilities).all())
        self.assertLess(float(np.max(np.abs(probabilities.sum(axis=1, dtype=np.float64) - 1.0))), 1e-5)
        self.assertEqual(len(set(labels.tolist())), k)
        self.assertFalse(receipt.canonical_authority)


if __name__ == "__main__":
    unittest.main()
