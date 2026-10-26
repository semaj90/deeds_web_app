#!/usr/bin/env python3
"""low_rank_feature_scorer.py — Multi-Datastream Feature Normalization & Low-Rank Re-Scorer.

Implements the multi-datastream feature fusion and low-rank scoring contract:
    X in R^{B x F} where F = 8 qualified features:
    1. dense_similarity (pgvector / Qdrant / cuVS)
    2. lexical_rank (PostgreSQL FTS tsvector / GIN)
    3. pagerank (NetworkX / Neo4j / cuGraph)
    4. ast_distance (Tree-sitter bounded inverse distance)
    5. domain_confidence (Calibrated classifier probability)
    6. freshness (Source revision ledger recency score)
    7. retrieval_uncertainty (Canary evaluation uncertainty)
    8. cache_residency (BitFrost / ACE hot cache indicator)

Transformation:
    z_i = (x_i - mu_i) / max(sigma_i, epsilon)
    h = GELU(Z W_1 + b_1)   [B, hidden_dim]
    s = h W_2 + b_2         [B, 1]

Invariants:
- NEVER an independent RRF vote: strictly an optional advisory re-ranker applied
  AFTER canonical SearchRuntime fusion.
- Zero canonical writes (`writesPerformed = False`, `canonicalAuthority = False`).
- No hidden thoughts, KV cache or raw tensor state persisted.
"""
from __future__ import annotations

import json
import math
from typing import Any, Dict, List, NamedTuple, Optional, Sequence, Tuple

FEATURE_NAMES: Tuple[str, ...] = (
    "dense_similarity",
    "lexical_rank",
    "pagerank",
    "ast_distance",
    "domain_confidence",
    "freshness",
    "retrieval_uncertainty",
    "cache_residency",
)
NUM_FEATURES = len(FEATURE_NAMES)


def gelu(x: float) -> float:
    """Exact Gaussian Error Linear Unit (GELU) with tanh approximation."""
    return 0.5 * x * (1.0 + math.tanh(math.sqrt(2.0 / math.pi) * (x + 0.044715 * (x ** 3))))


class ScoredCandidate(NamedTuple):
    candidate_id: str
    original_rank: int
    raw_features: Tuple[float, ...]
    normalized_features: Tuple[float, ...]
    advisory_score: float
    advisory_rank: int


class LowRankFeatureScorer:
    """Lightweight 2-layer low-rank feature scorer with frozen calibration statistics."""

    def __init__(
        self,
        hidden_dim: int = 16,
        in_features: int = NUM_FEATURES,
        mu: Optional[Sequence[float]] = None,
        sigma: Optional[Sequence[float]] = None,
        eps: float = 1e-6,
        seed: int = 42,
    ):
        self.in_features = in_features
        self.hidden_dim = hidden_dim
        self.eps = eps

        # Calibration means and standard deviations (default unit scale)
        self.mu = list(mu) if mu is not None else [0.0] * in_features
        self.sigma = list(sigma) if sigma is not None else [1.0] * in_features
        if len(self.mu) != in_features or len(self.sigma) != in_features:
            raise ValueError(f"mu and sigma must match in_features={in_features}")

        # Deterministic Xavier/Glorot weight initialization
        limit1 = math.sqrt(6.0 / (in_features + hidden_dim))
        step1 = 2.0 * limit1 / (in_features * hidden_dim)
        self.w1 = [
            [-limit1 + ((i * hidden_dim + j) * step1) % (2.0 * limit1) for j in range(hidden_dim)]
            for i in range(in_features)
        ]
        self.b1 = [0.0] * hidden_dim

        limit2 = math.sqrt(6.0 / (hidden_dim + 1))
        step2 = 2.0 * limit2 / hidden_dim
        self.w2 = [-limit2 + (j * step2) % (2.0 * limit2) for j in range(hidden_dim)]
        self.b2 = 0.0

    def normalize(self, features: Sequence[float]) -> List[float]:
        """Apply z-score normalization: z_i = (x_i - mu_i) / max(sigma_i, eps)."""
        if len(features) != self.in_features:
            raise ValueError(f"Expected {self.in_features} features, got {len(features)}")
        return [
            (float(x) - self.mu[i]) / max(self.sigma[i], self.eps)
            for i, x in enumerate(features)
        ]

    def score_single(self, normalized_features: Sequence[float]) -> float:
        """Compute s = GELU(z W_1 + b_1) W_2 + b_2."""
        # Layer 1: h = GELU(z W_1 + b_1)
        h = [0.0] * self.hidden_dim
        for j in range(self.hidden_dim):
            acc = self.b1[j]
            for i in range(self.in_features):
                acc += normalized_features[i] * self.w1[i][j]
            h[j] = gelu(acc)

        # Layer 2: s = h W_2 + b_2
        score = self.b2 + sum(h[j] * self.w2[j] for j in range(self.hidden_dim))
        return round(score, 6)

    def rerank_candidates(
        self,
        candidate_ids: Sequence[str],
        feature_matrix: Sequence[Sequence[float]],
    ) -> List[ScoredCandidate]:
        """Apply advisory low-rank re-scoring. Preserves original rank for traceability."""
        if len(candidate_ids) != len(feature_matrix):
            raise ValueError("candidate_ids and feature_matrix lengths must match")

        scored: List[Tuple[float, int, str, Tuple[float, ...], Tuple[float, ...]]] = []
        for rank, (cid, raw_f) in enumerate(zip(candidate_ids, feature_matrix)):
            norm_f = self.normalize(raw_f)
            s = self.score_single(norm_f)
            scored.append((s, rank, cid, tuple(raw_f), tuple(norm_f)))

        # Sort descending by advisory score, breaking ties by original rank
        scored.sort(key=lambda item: (-item[0], item[1]))

        result: List[ScoredCandidate] = []
        for adv_rank, (s, orig_rank, cid, raw_t, norm_t) in enumerate(scored):
            result.append(
                ScoredCandidate(
                    candidate_id=cid,
                    original_rank=orig_rank,
                    raw_features=raw_t,
                    normalized_features=norm_t,
                    advisory_score=s,
                    advisory_rank=adv_rank,
                )
            )

        return result
