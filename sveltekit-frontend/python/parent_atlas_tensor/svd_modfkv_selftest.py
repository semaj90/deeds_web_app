from __future__ import annotations

"""Deterministic smoke/proof fixtures for direct SVD parity and bounded ModFKV.

Run from sveltekit-frontend with the repository Python environment, e.g.:
  python -m python.parent_atlas_tensor.svd_modfkv_selftest
or with PYTHONPATH adjusted to include sveltekit-frontend/python:
  python -m parent_atlas_tensor.svd_modfkv_selftest
"""

import hashlib
import json

import numpy as np

from .modfkv_bounded import run_bounded_modfkv
from .svd_parity import run_fixture_suite


def _matrix_sha(matrix: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(matrix, dtype=np.float64).tobytes(order="C")).hexdigest()


def _low_rank_matrix(rows: int = 128, cols: int = 16, rank: int = 3, seed: int = 0xA71A5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    left = rng.normal(size=(rows, rank))
    right = rng.normal(size=(rank, cols))
    return left @ right


def run() -> dict[str, object]:
    direct = run_fixture_suite(require_cuda=False)

    matrix = _low_rank_matrix()
    common = {
        "schema": "atlas.modfkv-bounded-input.v1",
        "requestId": "selftest-modfkv-low-rank",
        "matrixSha256": _matrix_sha(matrix),
        "rows": int(matrix.shape[0]),
        "cols": int(matrix.shape[1]),
        "values": matrix.reshape(-1).tolist(),
        "sampleCount": 64,
        "seed": 0xA71A5,
        "desiredRank": 3,
        "singularValueThreshold": 1e-12,
        "producerRevision": "parent-atlas-modfkv-selftest.v1",
    }
    first = run_bounded_modfkv(common)
    second = run_bounded_modfkv(common)
    alternate = run_bounded_modfkv({**common, "seed": 0xA71A6})

    assert first["receiptSha256"] == second["receiptSha256"], "same seed must replay exactly"
    assert first["sampledRowIndices"] == second["sampledRowIndices"]
    assert first["sampledColumnIndices"] == second["sampledColumnIndices"]
    assert (
        first["sampledRowIndices"] != alternate["sampledRowIndices"]
        or first["sampledColumnIndices"] != alternate["sampledColumnIndices"]
    ), "different seed should alter at least one sample sequence"
    assert first["modFkvSamplingStructureExecuted"] is True
    assert first["sublinearInputModelSatisfied"] is False
    assert first["sublinearRuntimeClaimed"] is False
    assert first["recommendationRejectionSamplingExecuted"] is False
    assert first["fullTangRecommendationAlgorithmExecuted"] is False
    assert first["theoremGuaranteeClaimed"] is False
    assert first["retainedRank"] <= 3

    return {
        "schema": "atlas.svd-modfkv-selftest-receipt.v1",
        "directSvdFixtureSuite": direct,
        "modFkv": {
            "sameSeedReplay": True,
            "differentSeedChangesSampling": True,
            "retainedRank": first["retainedRank"],
            "boundedApproximationRelativeFrobeniusError": first[
                "boundedApproximationRelativeFrobeniusError"
            ],
            "optimalSameRankRelativeFrobeniusError": first[
                "optimalSameRankRelativeFrobeniusError"
            ],
            "approximationRatioToOptimalSameRank": first[
                "approximationRatioToOptimalSameRank"
            ],
            "receiptSha256": first["receiptSha256"],
        },
        "canonicalWritesAllowed": False,
    }


if __name__ == "__main__":
    print(json.dumps(run(), separators=(",", ":"), allow_nan=False))
