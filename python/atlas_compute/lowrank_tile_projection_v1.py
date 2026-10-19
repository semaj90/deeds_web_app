"""CPU oracle for LOWRANK-NORM-01 stage 2: versioned low-rank normalization of the 4-candidate x 6-feature tile.

    z = ((x - mu) / d) W_r        x, mu, d in R^6, W_r in R^{6 x r}, 1 <= r <= 6

mu/d are per-channel statistics over PRESENT values of a frozen fit set; W_r are the top-r right singular
vectors of the normalized fit matrix. A missing feature (presence 0) stays 0 AFTER normalization; it is never
imputed with mu. Output Z is a derived representation: it is not identity, not a retrieval vote, and does not
replace semantic_768. Pure numpy float64 (reference precision); no GPU, no writes, no persistence.
"""
from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from typing import Sequence

import numpy as np

CHANNELS = 6
SCHEMA = "atlas.lowrank-tile-projection.v1"
# Same channel order as the TS projection TILE_CHANNEL_FEATURES (semanticRelevance, lexicalRelevance, astAffinity,
# personalizedPageRank, domainAffinity, executionUtility).
CHANNEL_NAMES = ("semanticRelevance", "lexicalRelevance", "astAffinity", "personalizedPageRank", "domainAffinity", "executionUtility")
MIN_PRESENT_FOR_STATS = 2
# Missing-feature policy (operator-aligned 2026-10-19): the existing GEMM scores a missing feature as raw 0, so the
# baseline-compatible policy normalizes that raw 0 like any value ("raw_zero"). "zero_after_norm" (mean-fill) is kept
# only as the measured alternative.
MISSING_POLICIES = ("raw_zero", "zero_after_norm")
DEFAULT_MISSING_POLICY = "raw_zero"


@dataclass(frozen=True)
class LowRankProjectionV1:
    rank: int
    mu: tuple[float, ...]
    d: tuple[float, ...]
    w: tuple[tuple[float, ...], ...]          # [6][r]
    degenerate_channels: tuple[int, ...]      # channels with < 2 present fit values (mu=0, d=1)
    fit_set_digest: str
    fit_row_count: int
    projection_checksum: str
    missing_policy: str = DEFAULT_MISSING_POLICY


def _hex(values) -> list:
    return [float(v).hex() for v in np.ravel(values)]


def _checksum(rank: int, mu, d, w, fit_set_digest: str, fit_row_count: int, missing_policy: str) -> str:
    blob = json.dumps({"schema": SCHEMA, "channels": CHANNEL_NAMES, "rank": rank, "mu": _hex(mu), "d": _hex(d),
                       "w": _hex(w), "fitSetDigest": fit_set_digest, "fitRowCount": fit_row_count,
                       "missingPolicy": missing_policy},
                      sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()


def _arrays(x, present):
    xa = np.asarray(x, dtype=np.float64)
    pa = np.asarray(present, dtype=np.float64)
    if xa.ndim != 2 or xa.shape[1] != CHANNELS or pa.shape != xa.shape:
        raise ValueError("LOWRANK_SHAPE_MISMATCH")
    if not np.all(np.isfinite(xa)):
        raise ValueError("LOWRANK_NONFINITE")
    if not np.all((pa == 0) | (pa == 1)):
        raise ValueError("LOWRANK_PRESENCE_NOT_BINARY")
    if np.any((pa == 0) & (xa != 0)):
        raise ValueError("LOWRANK_ABSENT_FEATURE_MUST_BE_ZERO")
    return xa, pa


def _normalize(xa, pa, mu, d, policy=DEFAULT_MISSING_POLICY):
    if policy == "raw_zero":                      # missing raw value is 0 (already stored as 0) and is normalized like any value
        return (xa - mu) / d
    return np.where(pa == 1, (xa - mu) / d, 0.0)  # zero_after_norm: missing -> the mean (normalized 0)


def fit_lowrank_projection(x, present, rank: int, fit_set_digest: str,
                           missing_policy: str = DEFAULT_MISSING_POLICY) -> LowRankProjectionV1:
    """Deterministic fit. Rows with no present feature are ignored for statistics but counted in fit_row_count."""
    if missing_policy not in MISSING_POLICIES:
        raise ValueError("LOWRANK_MISSING_POLICY_UNKNOWN")
    if not isinstance(rank, int) or isinstance(rank, bool) or not 1 <= rank <= CHANNELS:
        raise ValueError("LOWRANK_RANK_OUT_OF_RANGE")
    if not str(fit_set_digest or "").strip():
        raise ValueError("LOWRANK_FIT_SET_DIGEST_REQUIRED")
    xa, pa = _arrays(x, present)
    if xa.shape[0] < 2:
        raise ValueError("LOWRANK_FIT_SET_TOO_SMALL")
    mu = np.zeros(CHANNELS)
    d = np.ones(CHANNELS)
    degenerate = []
    for c in range(CHANNELS):
        vals = xa[pa[:, c] == 1, c]
        if vals.size < MIN_PRESENT_FOR_STATS:
            degenerate.append(c)
            continue
        mu[c] = vals.mean()
        sd = vals.std()  # population std
        d[c] = sd if sd > 1e-12 else 1.0
        if sd <= 1e-12:
            degenerate.append(c)
    zn = _normalize(xa, pa, mu, d, missing_policy)
    _, _, vt = np.linalg.svd(zn, full_matrices=True)
    w = vt[:rank].T.copy()  # [6, r]
    for j in range(rank):   # deterministic sign: largest-magnitude entry positive
        if w[np.argmax(np.abs(w[:, j])), j] < 0:
            w[:, j] = -w[:, j]
    return LowRankProjectionV1(
        rank=rank, mu=tuple(float(v) for v in mu), d=tuple(float(v) for v in d),
        w=tuple(tuple(float(v) for v in row) for row in w), degenerate_channels=tuple(sorted(set(degenerate))),
        fit_set_digest=fit_set_digest, fit_row_count=int(xa.shape[0]),
        projection_checksum=_checksum(rank, mu, d, w, fit_set_digest, int(xa.shape[0]), missing_policy),
        missing_policy=missing_policy,
    )


def verify_projection(proj: LowRankProjectionV1) -> None:
    mu, d, w = np.array(proj.mu), np.array(proj.d), np.array(proj.w)
    if w.shape != (CHANNELS, proj.rank) or mu.shape != (CHANNELS,) or d.shape != (CHANNELS,):
        raise ValueError("LOWRANK_PROJECTION_SHAPE")
    if not (np.all(np.isfinite(mu)) and np.all(np.isfinite(d)) and np.all(np.isfinite(w))) or np.any(d <= 0):
        raise ValueError("LOWRANK_PROJECTION_INVALID")
    if proj.missing_policy not in MISSING_POLICIES:
        raise ValueError("LOWRANK_MISSING_POLICY_UNKNOWN")
    if _checksum(proj.rank, mu, d, w, proj.fit_set_digest, proj.fit_row_count, proj.missing_policy) != proj.projection_checksum:
        raise ValueError("LOWRANK_PROJECTION_CHECKSUM_MISMATCH")


def project(proj: LowRankProjectionV1, x, present):
    """Z [n, r]. A row with no present feature (padding) maps to the zero vector."""
    verify_projection(proj)
    xa, pa = _arrays(x, present)
    return _normalize(xa, pa, np.array(proj.mu), np.array(proj.d), proj.missing_policy) @ np.array(proj.w)


def reconstruct_normalized(proj: LowRankProjectionV1, z):
    return np.asarray(z, dtype=np.float64) @ np.array(proj.w).T


def reconstruction_error(proj: LowRankProjectionV1, x, present) -> float:
    """Mean squared error in normalized space over PRESENT cells only."""
    xa, pa = _arrays(x, present)
    zn = _normalize(xa, pa, np.array(proj.mu), np.array(proj.d), proj.missing_policy)
    err = (zn - reconstruct_normalized(proj, project(proj, xa, pa))) * pa
    n = pa.sum()
    return float((err ** 2).sum() / n) if n else 0.0


def head_scores(z, v: Sequence[float], bias: float):
    v = np.asarray(v, dtype=np.float64)
    z = np.asarray(z, dtype=np.float64)
    if v.shape != (z.shape[1],):
        raise ValueError("LOWRANK_HEAD_RANK_MISMATCH")
    return bias + z @ v


def equivalent_linear_weights(proj: LowRankProjectionV1, v: Sequence[float]):
    """For fully-present rows the projected linear head equals bias + w' . x - mu . w' with w' = (W v) / d."""
    return (np.array(proj.w) @ np.asarray(v, dtype=np.float64)) / np.array(proj.d)


def presence_dependent_constant(proj: LowRankProjectionV1, v: Sequence[float], present_row) -> float:
    """The additive part of the projected score beyond the raw linear term (x . w').

    zero_after_norm: -sum_{present j} mu_j w'_j, which depends on WHICH features are present (can reorder rows).
    raw_zero:        -sum_{all j} mu_j w'_j, the same for every row (cannot reorder rows)."""
    wp = equivalent_linear_weights(proj, v)
    mask = np.ones(CHANNELS) if proj.missing_policy == "raw_zero" else np.asarray(present_row, dtype=np.float64)
    return float(-(np.array(proj.mu) * wp * mask).sum())
