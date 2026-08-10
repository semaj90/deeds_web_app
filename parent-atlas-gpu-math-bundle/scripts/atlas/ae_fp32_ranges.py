#!/usr/bin/env python3
"""FP32 range and interpolation utilities for Parent Atlas autoencoder work.

These utilities are diagnostics first. They do not silently clip canonical
semantic_768 vectors or add interpolated examples to the training set.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Iterable
import math
import numpy as np

EPS = np.float32(1e-8)
SEMANTIC_DIM = 768

@dataclass(frozen=True)
class RangeStats:
    shape: tuple[int, ...]
    dtype: str
    finite: bool
    min: float
    max: float
    mean: float
    std: float
    p001: float
    p01: float
    p50: float
    p99: float
    p999: float
    max_abs: float

    def to_dict(self) -> dict:
        d = asdict(self)
        d["shape"] = list(self.shape)
        return d


def ensure_fp32_finite(x: np.ndarray, *, expected_dim: int | None = None) -> np.ndarray:
    y = np.asarray(x, dtype=np.float32)
    if expected_dim is not None:
        if y.ndim == 0 or y.shape[-1] != expected_dim:
            raise ValueError(f"expected last dimension {expected_dim}, got shape={y.shape}")
    if not np.isfinite(y).all():
        bad = int(np.size(y) - np.isfinite(y).sum())
        raise ValueError(f"non-finite FP32 values: {bad}")
    return np.ascontiguousarray(y, dtype=np.float32)


def range_stats(x: np.ndarray) -> RangeStats:
    y = ensure_fp32_finite(x)
    q = np.quantile(y.astype(np.float64), [0.001, 0.01, 0.5, 0.99, 0.999])
    return RangeStats(
        shape=tuple(y.shape), dtype=str(y.dtype), finite=True,
        min=float(y.min()), max=float(y.max()), mean=float(y.mean()),
        std=float(y.std()), p001=float(q[0]), p01=float(q[1]),
        p50=float(q[2]), p99=float(q[3]), p999=float(q[4]),
        max_abs=float(np.abs(y).max()),
    )


def l2_normalize_fp32(x: np.ndarray, axis: int = -1) -> np.ndarray:
    y = ensure_fp32_finite(x)
    norms = np.linalg.norm(y.astype(np.float64), axis=axis, keepdims=True)
    norms = np.maximum(norms, float(EPS))
    out = (y.astype(np.float64) / norms).astype(np.float32)
    return ensure_fp32_finite(out)


def lerp_fp32(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    if not 0.0 <= t <= 1.0:
        raise ValueError("t must be in [0,1]")
    aa = ensure_fp32_finite(a)
    bb = ensure_fp32_finite(b)
    if aa.shape != bb.shape:
        raise ValueError(f"shape mismatch: {aa.shape} vs {bb.shape}")
    return ((1.0 - t) * aa.astype(np.float64) + t * bb.astype(np.float64)).astype(np.float32)


def slerp_fp32(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    """Spherical interpolation for vector pairs, returned as normalized FP32.

    Inputs are normalized internally. Near-collinear vectors fall back to LERP
    followed by normalization for numerical stability.
    """
    if not 0.0 <= t <= 1.0:
        raise ValueError("t must be in [0,1]")
    aa = l2_normalize_fp32(np.asarray(a, dtype=np.float32).reshape(1, -1))[0]
    bb = l2_normalize_fp32(np.asarray(b, dtype=np.float32).reshape(1, -1))[0]
    if aa.shape != bb.shape:
        raise ValueError("shape mismatch")
    dot = float(np.clip(np.dot(aa.astype(np.float64), bb.astype(np.float64)), -1.0, 1.0))
    if abs(dot) > 0.9995:
        return l2_normalize_fp32(lerp_fp32(aa, bb, t).reshape(1, -1))[0]
    theta = math.acos(dot)
    sin_theta = math.sin(theta)
    out = (math.sin((1.0 - t) * theta) / sin_theta) * aa.astype(np.float64)
    out += (math.sin(t * theta) / sin_theta) * bb.astype(np.float64)
    return l2_normalize_fp32(out.astype(np.float32).reshape(1, -1))[0]


def interpolation_path(a: np.ndarray, b: np.ndarray, steps: int = 9, *, spherical: bool = True) -> np.ndarray:
    if steps < 2:
        raise ValueError("steps must be >= 2")
    fn = slerp_fp32 if spherical else lerp_fp32
    return np.stack([fn(a, b, i / (steps - 1)) for i in range(steps)], axis=0).astype(np.float32)


def interpolation_report(path: np.ndarray) -> dict:
    p = ensure_fp32_finite(path)
    if p.ndim != 2 or len(p) < 2:
        raise ValueError("path must be [steps,dim] with steps>=2")
    deltas = p[1:].astype(np.float64) - p[:-1].astype(np.float64)
    step_l2 = np.linalg.norm(deltas, axis=1)
    norms = np.linalg.norm(p.astype(np.float64), axis=1)
    return {
        "steps": int(len(p)),
        "dim": int(p.shape[1]),
        "step_l2_min": float(step_l2.min()),
        "step_l2_max": float(step_l2.max()),
        "step_l2_mean": float(step_l2.mean()),
        "norm_min": float(norms.min()),
        "norm_max": float(norms.max()),
        "finite": bool(np.isfinite(p).all()),
    }
