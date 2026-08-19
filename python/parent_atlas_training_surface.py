#!/usr/bin/env python3
"""Measured Parent Atlas training-configuration surface.

This helper proposes the next experiment inside ONE categorical execution stratum.
It never interpolates ZeRO stage/offload/optimizer family. Cubic mode uses SciPy
RegularGridInterpolator over normalized axes and refuses to run unless every axis
has at least four measured coordinates (cubic spline degree 3 => k+1 points).

Every proposal is UNPROVEN until a real training run emits AdapterTrainingReceiptV1.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
import argparse
import json
import math
import numpy as np

try:
    from scipy.interpolate import RegularGridInterpolator
except Exception:  # pragma: no cover - workstation dependency gate
    RegularGridInterpolator = None


@dataclass(frozen=True)
class SurfacePoint:
    learning_rate: float
    lora_rank: float
    resource_axis: float
    metric: float
    receipt_ref: str


def _sorted_unique(values: Iterable[float]) -> np.ndarray:
    return np.asarray(sorted(set(float(v) for v in values)), dtype=np.float64)


def _normalize(values: np.ndarray) -> tuple[np.ndarray, float, float]:
    lo, hi = float(values.min()), float(values.max())
    if not math.isfinite(lo) or not math.isfinite(hi) or hi <= lo:
        raise ValueError("surface axis must have a finite non-zero range")
    return (values - lo) / (hi - lo), lo, hi


def build_grid(points: list[SurfacePoint]):
    if not points:
        raise ValueError("at least one measured point is required")
    lr_axis = _sorted_unique(math.log10(p.learning_rate) for p in points)
    rank_axis = _sorted_unique(p.lora_rank for p in points)
    resource_axis = _sorted_unique(p.resource_axis for p in points)
    shape = (len(lr_axis), len(rank_axis), len(resource_axis))
    grid = np.full(shape, np.nan, dtype=np.float64)
    lookup = {(float(x), float(y), float(z)): p.metric for p in points for x, y, z in [(math.log10(p.learning_rate), p.lora_rank, p.resource_axis)]}
    for i, x in enumerate(lr_axis):
        for j, y in enumerate(rank_axis):
            for k, z in enumerate(resource_axis):
                value = lookup.get((float(x), float(y), float(z)))
                if value is None:
                    raise ValueError("surface requires a complete rectilinear measured grid; do not fabricate missing cells")
                grid[i, j, k] = value
    return lr_axis, rank_axis, resource_axis, grid


def propose(points: list[SurfacePoint], *, method: str = "cubic", samples_per_axis: int = 17) -> dict:
    if RegularGridInterpolator is None:
        return {"schema": "atlas.training-surface-proposal.v1", "status": "SCIPY_UNAVAILABLE", "proposals": []}
    lr, rank, resource, values = build_grid(points)
    if method == "cubic" and min(len(lr), len(rank), len(resource)) < 4:
        return {
            "schema": "atlas.training-surface-proposal.v1",
            "status": "INSUFFICIENT_CUBIC_GRID",
            "required_points_per_axis": 4,
            "axis_counts": [len(lr), len(rank), len(resource)],
            "proposals": [],
        }

    lr_n, lr_lo, lr_hi = _normalize(lr)
    rank_n, rank_lo, rank_hi = _normalize(rank)
    resource_n, res_lo, res_hi = _normalize(resource)
    interpolator = RegularGridInterpolator(
        (lr_n, rank_n, resource_n), values, method=method, bounds_error=True
    )
    x = np.linspace(0.0, 1.0, samples_per_axis)
    mesh = np.stack(np.meshgrid(x, x, x, indexing="ij"), axis=-1).reshape(-1, 3)
    pred = interpolator(mesh)
    order = np.argsort(-pred)
    proposals = []
    measured = {(round(math.log10(p.learning_rate), 12), round(p.lora_rank, 12), round(p.resource_axis, 12)) for p in points}
    for idx in order:
        a, b, c = mesh[int(idx)]
        log_lr = lr_lo + a * (lr_hi - lr_lo)
        r = rank_lo + b * (rank_hi - rank_lo)
        resource_value = res_lo + c * (res_hi - res_lo)
        key = (round(log_lr, 12), round(r, 12), round(resource_value, 12))
        if key in measured:
            continue
        proposals.append({
            "learningRate": 10.0 ** log_lr,
            "loraRankContinuousProposal": r,
            "loraRankExecutionCandidate": max(1, int(round(r))),
            "effectiveBatchOrResource": resource_value,
            "predictedMetric": float(pred[int(idx)]),
            "status": "UNPROVEN_PROPOSAL",
        })
        if len(proposals) >= 8:
            break

    return {
        "schema": "atlas.training-surface-proposal.v1",
        "status": "PROPOSAL_READY",
        "method": method,
        "axes_normalized": True,
        "measured_receipt_refs": sorted(p.receipt_ref for p in points),
        "proposals": proposals,
        "todo": [
            "Execute selected proposals as exact TrainingExecutionCandidateV1 configurations.",
            "Do not activate an adapter based on predictedMetric; require AdapterTrainingReceiptV1 + held-out evaluation.",
        ],
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("measurements", help="JSON array of measured surface points")
    ap.add_argument("--method", choices=["linear", "cubic"], default="cubic")
    args = ap.parse_args()
    raw = json.loads(open(args.measurements, "r", encoding="utf-8").read())
    points = [SurfacePoint(
        learning_rate=float(row["learningRate"]),
        lora_rank=float(row["loraRank"]),
        resource_axis=float(row["effectiveBatchOrResource"]),
        metric=float(row["metric"]),
        receipt_ref=str(row["receiptRef"]),
    ) for row in raw]
    print(json.dumps(propose(points, method=args.method), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
