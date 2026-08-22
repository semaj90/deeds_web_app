"""Fail-closed Qdrant exact eligibility for aligned-snapshot proofs.

Qdrant HNSW may only be evaluated when BOTH aggregate and worst-query exact
Top-K overlap meet the configured floor. A strong mean must never hide one
badly misaligned query.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Any, Sequence


@dataclass(frozen=True)
class QdrantExactAlignmentGateV1:
    schema: str
    minimum_exact_overlap_at_k: float
    mean_exact_overlap_at_k: float
    minimum_query_exact_overlap_at_k: float
    query_count: int
    mean_floor_met: bool
    minimum_query_floor_met: bool
    status: str
    hnsw_allowed: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def evaluate_qdrant_exact_alignment_gate(
    exact_overlaps: Sequence[float],
    *,
    minimum_exact_overlap_at_k: float,
) -> QdrantExactAlignmentGateV1:
    overlaps = [float(value) for value in exact_overlaps]
    floor = float(minimum_exact_overlap_at_k)
    if not 0.0 <= floor <= 1.0:
        raise ValueError("minimum_exact_overlap_at_k must be in [0,1]")
    if not overlaps:
        raise ValueError("exact_overlaps must be non-empty")
    if any(not 0.0 <= value <= 1.0 for value in overlaps):
        raise ValueError("exact overlap values must be in [0,1]")

    mean_overlap = sum(overlaps) / len(overlaps)
    minimum_query_overlap = min(overlaps)
    mean_floor_met = mean_overlap >= floor
    minimum_query_floor_met = minimum_query_overlap >= floor
    aligned = mean_floor_met and minimum_query_floor_met

    return QdrantExactAlignmentGateV1(
        schema="atlas.qdrant-exact-alignment-gate.v1",
        minimum_exact_overlap_at_k=floor,
        mean_exact_overlap_at_k=mean_overlap,
        minimum_query_exact_overlap_at_k=minimum_query_overlap,
        query_count=len(overlaps),
        mean_floor_met=mean_floor_met,
        minimum_query_floor_met=minimum_query_floor_met,
        status="QDRANT_EXACT_ALIGNED" if aligned else "QDRANT_EXACT_STORE_MISMATCH",
        hnsw_allowed=aligned,
    )


def evaluate_qdrant_exact_alignment_receipt(receipt: Any) -> QdrantExactAlignmentGateV1:
    """Re-evaluate an existing scoped-ann receipt without trusting mean-only status."""
    floor = float(receipt.minimum_exact_overlap_at_k)
    mean_overlap = float(receipt.pytorch_qdrant_exact_mean_overlap_at_k)
    minimum_query_overlap = float(receipt.pytorch_qdrant_exact_minimum_query_overlap_at_k)
    # Preserve both independently observed aggregate values. This path cannot
    # reconstruct every query overlap, so apply the same conjunction directly.
    mean_floor_met = mean_overlap >= floor
    minimum_query_floor_met = minimum_query_overlap >= floor
    aligned = mean_floor_met and minimum_query_floor_met
    return QdrantExactAlignmentGateV1(
        schema="atlas.qdrant-exact-alignment-gate.v1",
        minimum_exact_overlap_at_k=floor,
        mean_exact_overlap_at_k=mean_overlap,
        minimum_query_exact_overlap_at_k=minimum_query_overlap,
        query_count=int(receipt.query_count),
        mean_floor_met=mean_floor_met,
        minimum_query_floor_met=minimum_query_floor_met,
        status="QDRANT_EXACT_ALIGNED" if aligned else "QDRANT_EXACT_STORE_MISMATCH",
        hnsw_allowed=aligned,
    )
