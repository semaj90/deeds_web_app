from __future__ import annotations

"""Bounded ModFKV-style experiment for Parent Atlas.

This module implements the finite in-memory length-squared row/column sketch
used by FKV/ModFKV-style low-rank approximation:

  1. sample q rows with p_i = ||A_i||^2 / ||A||_F^2,
  2. rescale sampled rows into S,
  3. sample q columns from the induced squared-column-norm distribution of S,
  4. rescale sampled columns into W,
  5. direct-SVD W,
  6. form V_hat = S^T U_hat Sigma_hat^{-1},
  7. optionally materialize D = A V_hat V_hat^T for bounded evaluation.

It deliberately does NOT claim Tang's theorem-level sublinear runtime because
this first Parent Atlas implementation receives/materializes the full matrix.
It also does NOT implement the later recommendation inner-product estimation or
rejection-sampling procedure.
"""

from dataclasses import dataclass
import argparse
import hashlib
import json
import math
import sys
from typing import Any

import numpy as np


@dataclass(frozen=True)
class SamplingDraw:
    ordinal: int
    index: int
    probability: float


def _stable_sha256(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _matrix(raw: dict[str, Any]) -> np.ndarray:
    rows = int(raw["rows"])
    cols = int(raw["cols"])
    values = np.asarray(raw["values"], dtype=np.float64)
    if rows <= 0 or cols <= 0 or values.size != rows * cols:
        raise ValueError("MODFKV_MATRIX_SHAPE_INVALID")
    out = values.reshape(rows, cols)
    if not np.isfinite(out).all():
        raise ValueError("MODFKV_MATRIX_NONFINITE")
    return out


def _probabilities(weights: np.ndarray, error_code: str) -> np.ndarray:
    weights = np.asarray(weights, dtype=np.float64)
    total = float(weights.sum())
    if not math.isfinite(total) or total <= 0.0:
        raise ValueError(error_code)
    p = weights / total
    # Make the final entry absorb floating-point summation drift.
    p[-1] = 1.0 - float(p[:-1].sum())
    if np.any(p < 0.0):
        raise ValueError(f"{error_code}_NEGATIVE_PROBABILITY")
    return p


def _sample_with_replacement(
    rng: np.random.Generator,
    probabilities: np.ndarray,
    count: int,
) -> tuple[np.ndarray, list[SamplingDraw]]:
    indices = rng.choice(probabilities.size, size=count, replace=True, p=probabilities)
    draws = [
        SamplingDraw(ordinal=i, index=int(index), probability=float(probabilities[index]))
        for i, index in enumerate(indices.tolist())
    ]
    return indices.astype(np.int64, copy=False), draws


def _relative_frobenius_error(reference: np.ndarray, approximation: np.ndarray) -> float:
    denom = float(np.linalg.norm(reference, ord="fro"))
    numerator = float(np.linalg.norm(reference - approximation, ord="fro"))
    return numerator / denom if denom > 0 else numerator


def _orthonormality_defect(v_hat: np.ndarray) -> float:
    if v_hat.shape[1] == 0:
        return 0.0
    gram = v_hat.T @ v_hat
    identity = np.eye(v_hat.shape[1], dtype=np.float64)
    return float(np.linalg.norm(gram - identity, ord="fro"))


def run_bounded_modfkv(raw: dict[str, Any]) -> dict[str, Any]:
    if raw.get("schema") != "atlas.modfkv-bounded-input.v1":
        raise ValueError("MODFKV_INPUT_SCHEMA_MISMATCH")

    a = _matrix(raw)
    rows, cols = a.shape
    q = int(raw["sampleCount"])
    if q <= 0:
        raise ValueError("MODFKV_SAMPLE_COUNT_INVALID")

    seed = int(raw.get("seed", 0xA71A5))
    if seed < 0 or seed > (1 << 63) - 1:
        raise ValueError("MODFKV_SEED_OUT_OF_RANGE")
    rng = np.random.default_rng(seed)

    row_squared_norms = np.einsum("ij,ij->i", a, a, dtype=np.float64)
    row_probabilities = _probabilities(row_squared_norms, "MODFKV_ZERO_FROBENIUS_NORM")
    row_indices, row_draws = _sample_with_replacement(rng, row_probabilities, q)

    # Standard length-squared row-sketch rescaling. Every sampled row contributes
    # A_i / sqrt(q p_i), yielding an unbiased Gram estimator S^T S for A^T A.
    s = np.empty((q, cols), dtype=np.float64)
    for t, i in enumerate(row_indices.tolist()):
        p_i = float(row_probabilities[i])
        if p_i <= 0:
            raise ValueError("MODFKV_SELECTED_ZERO_PROBABILITY_ROW")
        s[t, :] = a[i, :] / math.sqrt(q * p_i)

    column_squared_norms = np.einsum("ij,ij->j", s, s, dtype=np.float64)
    column_probabilities = _probabilities(column_squared_norms, "MODFKV_ZERO_SKETCH_COLUMN_MASS")
    column_indices, column_draws = _sample_with_replacement(rng, column_probabilities, q)

    w = np.empty((q, q), dtype=np.float64)
    for t, j in enumerate(column_indices.tolist()):
        p_j = float(column_probabilities[j])
        if p_j <= 0:
            raise ValueError("MODFKV_SELECTED_ZERO_PROBABILITY_COLUMN")
        w[:, t] = s[:, j] / math.sqrt(q * p_j)

    u_w, sigma_w, vh_w = np.linalg.svd(w, full_matrices=False)
    sigma_threshold = float(raw.get("singularValueThreshold", 0.0))
    if not math.isfinite(sigma_threshold) or sigma_threshold < 0:
        raise ValueError("MODFKV_SINGULAR_VALUE_THRESHOLD_INVALID")

    desired_rank_raw = raw.get("desiredRank")
    desired_rank = int(desired_rank_raw) if desired_rank_raw is not None else None
    if desired_rank is not None and desired_rank <= 0:
        raise ValueError("MODFKV_DESIRED_RANK_INVALID")

    retained = np.flatnonzero(sigma_w > sigma_threshold)
    if desired_rank is not None:
        retained = retained[: min(desired_rank, retained.size)]
    retained_rank = int(retained.size)

    if retained_rank:
        u_hat = u_w[:, retained]
        sigma_hat = sigma_w[retained]
        v_hat = s.T @ u_hat @ np.diag(1.0 / sigma_hat)
        projector = v_hat @ v_hat.T
        approximation = a @ projector
    else:
        sigma_hat = np.empty((0,), dtype=np.float64)
        v_hat = np.empty((cols, 0), dtype=np.float64)
        approximation = np.zeros_like(a)

    # Full direct SVD is evaluation-only and is why this bounded implementation
    # does not satisfy Tang's sublinear input/runtime model.
    _, sigma_exact, vh_exact = np.linalg.svd(a, full_matrices=False)
    comparison_rank = min(retained_rank, sigma_exact.size)
    if comparison_rank:
        exact_rank_approximation = (
            (a @ vh_exact[:comparison_rank, :].T) @ vh_exact[:comparison_rank, :]
        )
        optimal_rank_relative_error = _relative_frobenius_error(a, exact_rank_approximation)
    else:
        optimal_rank_relative_error = 1.0 if float(np.linalg.norm(a, ord="fro")) > 0 else 0.0

    bounded_relative_error = _relative_frobenius_error(a, approximation)
    approximation_ratio_to_optimal = (
        bounded_relative_error / optimal_rank_relative_error
        if optimal_rank_relative_error > 0
        else (1.0 if bounded_relative_error == 0 else None)
    )

    row_draw_payload = [draw.__dict__ for draw in row_draws]
    column_draw_payload = [draw.__dict__ for draw in column_draws]
    receipt_without_hash = {
        "schema": "atlas.modfkv-bounded-receipt.v1",
        "requestId": str(raw["requestId"]),
        "matrixSha256": str(raw["matrixSha256"]),
        "rows": rows,
        "cols": cols,
        "sampleCount": q,
        "seed": seed,
        "prng": "NUMPY_PCG64_V1",
        "rowSamplingMode": "L2_ROW_NORM_SQUARED_WITH_REPLACEMENT",
        "columnSamplingMode": "L2_SKETCH_COLUMN_NORM_SQUARED_WITH_REPLACEMENT",
        "rowDraws": row_draw_payload,
        "columnDraws": column_draw_payload,
        "sampledRowIndices": [int(i) for i in row_indices.tolist()],
        "sampledColumnIndices": [int(i) for i in column_indices.tolist()],
        "rowProbabilityMass": [float(v) for v in row_probabilities.tolist()],
        "columnProbabilityMass": [float(v) for v in column_probabilities.tolist()],
        "wShape": [int(w.shape[0]), int(w.shape[1])],
        "wSingularValues": [float(v) for v in sigma_w.tolist()],
        "singularValueThreshold": sigma_threshold,
        "desiredRank": desired_rank,
        "retainedRank": retained_rank,
        "retainedSingularValues": [float(v) for v in sigma_hat.tolist()],
        "vHatShape": [int(v_hat.shape[0]), int(v_hat.shape[1])],
        "vHatOrthonormalityDefectFrobenius": _orthonormality_defect(v_hat),
        "boundedApproximationRelativeFrobeniusError": bounded_relative_error,
        "optimalSameRankRelativeFrobeniusError": optimal_rank_relative_error,
        "approximationRatioToOptimalSameRank": approximation_ratio_to_optimal,
        "modFkvSamplingStructureExecuted": True,
        "directSvdOfWSketchExecuted": True,
        "fullMatrixMaterializedForEvaluation": True,
        "sublinearInputModelSatisfied": False,
        "sublinearRuntimeClaimed": False,
        "recommendationRejectionSamplingExecuted": False,
        "fullTangRecommendationAlgorithmExecuted": False,
        "theoremGuaranteeClaimed": False,
        "proposalOnly": True,
        "canonicalWritesAllowed": False,
        "producerRevision": str(raw.get("producerRevision", "parent-atlas-modfkv-bounded.v1")),
    }
    return {
        **receipt_without_hash,
        "receiptSha256": _stable_sha256(receipt_without_hash),
    }


def main() -> None:
    parser = argparse.ArgumentParser(prog="parent-atlas-modfkv-bounded")
    parser.parse_args()
    payload = json.load(sys.stdin)
    print(json.dumps(run_bounded_modfkv(payload), separators=(",", ":"), allow_nan=False))


if __name__ == "__main__":
    main()
