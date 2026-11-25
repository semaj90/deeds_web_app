"""Deterministic proposal ordering for Naive Bayes / logistic domain guesses.

This is not a retrieval lane, ontology admission rule, calibrated confidence
score, or ACE evidence gate. It orders an already-built, bounded candidate batch
and always leaves non-consensus/missing outputs in an explicit UNKNOWN bucket.
"""

from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

from atlas_compute.radix_sort_cpp_helper_v1 import radix_sort_u64_cpp_or_fallback

MAX_DOMAIN_GUESS_CANDIDATES_V1 = 65_536
MAX_CANDIDATE_ORDINAL_V1 = 0xFFFFFFFF


def rank_domain_classifier_guesses_v1(
    candidates: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    """Sort consensus proposals first, by conservative score bucket, then ordinal.

    Each input row uses ``candidateOrdinal``, ``naive_bayes_label``,
    ``logistic_regression_label``, ``naive_bayes_domain_probability`` and
    ``logistic_regression_domain_probability``. A candidate is consensus only
    when both non-empty labels agree and both finite probabilities are in [0, 1].
    The minimum probability is a coarse shadow-ranking signal, not calibrated
    confidence or relevance. Original rows are returned unchanged.
    """
    if len(candidates) > MAX_DOMAIN_GUESS_CANDIDATES_V1:
        raise ValueError("DOMAIN_GUESS_RADIX_CANDIDATE_LIMIT_EXCEEDED")

    ordinals: list[int] = []
    keys: list[int] = []
    bins: list[str] = []
    labels: list[str | None] = []
    quantized: list[int] = []

    for row in candidates:
        ordinal = row.get("candidateOrdinal")
        if isinstance(ordinal, bool) or not isinstance(ordinal, int) or not 0 <= ordinal <= MAX_CANDIDATE_ORDINAL_V1:
            raise ValueError("DOMAIN_GUESS_CANDIDATE_ORDINAL_INVALID")
        ordinals.append(ordinal)

        nb_label = row.get("naive_bayes_label")
        lr_label = row.get("logistic_regression_label")
        nb_score = row.get("naive_bayes_domain_probability")
        lr_score = row.get("logistic_regression_domain_probability")
        valid_scores = all(
            isinstance(score, (int, float))
            and not isinstance(score, bool)
            and math.isfinite(float(score))
            and 0.0 <= float(score) <= 1.0
            for score in (nb_score, lr_score)
        )
        consensus = (
            isinstance(nb_label, str)
            and bool(nb_label)
            and nb_label == lr_label
            and valid_scores
        )
        if consensus:
            score_bucket = int(round(min(float(nb_score), float(lr_score)) * 255.0))
            bucket = "CONSENSUS_PROPOSAL"
            label: str | None = nb_label
            # uint64 ascending: known before unknown, higher score first,
            # stable candidate ordinal last. Bit 63 is the unknown marker.
            key = ((255 - score_bucket) << 32) | ordinal
        else:
            score_bucket = 0
            bucket = "UNKNOWN"
            label = None
            key = (1 << 63) | ordinal
        bins.append(bucket)
        labels.append(label)
        quantized.append(score_bucket)
        keys.append(key)

    if len(set(ordinals)) != len(ordinals):
        raise ValueError("DOMAIN_GUESS_CANDIDATE_ORDINALS_MUST_BE_UNIQUE")

    _, sorted_indices, backend = radix_sort_u64_cpp_or_fallback(keys)
    ranked = []
    for index in sorted_indices:
        row = dict(candidates[index])
        row["classificationBin"] = bins[index]
        row["consensusLabel"] = labels[index]
        row["scoreBucket255"] = quantized[index]
        row["guessAuthority"] = "SHADOW_ONLY_UNCALIBRATED"
        row["canonicalAuthority"] = False
        row["writesPerformed"] = False
        ranked.append(row)

    return {
        "schema": "atlas.domain-classifier-radix-rank.v1",
        "status": "PROPOSAL_ONLY",
        "candidateCount": len(ranked),
        "consensusCount": sum(value == "CONSENSUS_PROPOSAL" for value in bins),
        "unknownCount": sum(value == "UNKNOWN" for value in bins),
        "sortBackend": backend,
        "scoreSemantics": "minimum of two uncalibrated class probabilities, quantized to 8 bits",
        "rankedCandidates": ranked,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "promotionAuthorized": False,
    }
