"""Deterministic score/rank comparison metrics for graph executor receipts."""

from __future__ import annotations

import math
from typing import Mapping


def _average_ranks(scores: Mapping[int, float]) -> dict[int, float]:
    ordered = sorted(scores, key=lambda ordinal: (float(scores[ordinal]), ordinal))
    ranks: dict[int, float] = {}
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and float(scores[ordered[end]]) == float(scores[ordered[start]]):
            end += 1
        average = ((start + 1) + end) / 2.0
        for index in range(start, end):
            ranks[ordered[index]] = average
        start = end
    return ranks


def _pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) < 2:
        return None
    lm = math.fsum(left) / len(left)
    rm = math.fsum(right) / len(right)
    lc = [value - lm for value in left]
    rc = [value - rm for value in right]
    ll = math.fsum(value * value for value in lc)
    rr = math.fsum(value * value for value in rc)
    if ll == 0.0 or rr == 0.0:
        return None
    return math.fsum(a * b for a, b in zip(lc, rc)) / math.sqrt(ll * rr)


def compare_ranked_scores(
    reference: Mapping[int, float],
    challenger: Mapping[int, float],
    *,
    top_ks: tuple[int, ...] = (10, 50, 100),
) -> dict[str, object]:
    """Compare complete ordinal-keyed score maps, using CandidateOrdinal ties."""
    if set(reference) != set(challenger):
        raise ValueError("RANK_METRIC_ORDINAL_SET_MISMATCH")
    ordinals = sorted(reference)
    if not ordinals:
        raise ValueError("RANK_METRIC_EMPTY_SCORE_MAP")
    for scores in (reference, challenger):
        for ordinal, score in scores.items():
            if isinstance(ordinal, bool) or not isinstance(ordinal, int) or ordinal < 0:
                raise ValueError("RANK_METRIC_ORDINAL_INVALID")
            if isinstance(score, bool) or not math.isfinite(float(score)):
                raise ValueError("RANK_METRIC_SCORE_NONFINITE")

    left = [float(reference[o]) for o in ordinals]
    right = [float(challenger[o]) for o in ordinals]
    left_ranks = _average_ranks(reference)
    right_ranks = _average_ranks(challenger)
    rank_deltas = [abs(left_ranks[o] - right_ranks[o]) for o in ordinals]
    abs_errors = [abs(a - b) for a, b in zip(left, right)]
    ranked_left = sorted(ordinals, key=lambda o: (-float(reference[o]), o))
    ranked_right = sorted(ordinals, key=lambda o: (-float(challenger[o]), o))
    rank_left = {ordinal: index + 1 for index, ordinal in enumerate(ranked_left)}
    rank_right = {ordinal: index + 1 for index, ordinal in enumerate(ranked_right)}
    displacement = [abs(rank_left[o] - rank_right[o]) for o in ordinals]
    sorted_displacement = sorted(displacement)
    midpoint = len(sorted_displacement) // 2
    median_displacement = (
        float(sorted_displacement[midpoint])
        if len(sorted_displacement) % 2
        else (sorted_displacement[midpoint - 1] + sorted_displacement[midpoint]) / 2.0
    )

    overlap: dict[str, dict[str, int | float]] = {}
    for requested in top_ks:
        if isinstance(requested, bool) or not isinstance(requested, int) or requested <= 0:
            raise ValueError("RANK_METRIC_TOP_K_INVALID")
        k = min(requested, len(ordinals))
        common = len(set(ranked_left[:k]) & set(ranked_right[:k]))
        overlap[str(requested)] = {"k": k, "count": common, "fraction": common / k}

    return {
        "pearson": _pearson(left, right),
        "spearman": _pearson(
            [left_ranks[o] for o in ordinals],
            [right_ranks[o] for o in ordinals],
        ),
        "scoreL1": math.fsum(abs_errors),
        "scoreLInf": max(abs_errors),
        "referenceScoreSum": math.fsum(left),
        "challengerScoreSum": math.fsum(right),
        "topKOverlap": overlap,
        "meanAbsoluteRankDisplacement": math.fsum(displacement) / len(displacement),
        "medianAbsoluteRankDisplacement": median_displacement,
        "maxAbsoluteRankDisplacement": max(displacement),
    }
