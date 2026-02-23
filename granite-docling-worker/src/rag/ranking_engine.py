"""
Multi-factor ranking engine for RAG results.

Implements R2 (BM25) and R3 (semantic) ranking with score combination.
"""

import logging
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class RankedResult:
    """A ranked search result."""

    chunk_id: str
    content: str
    r2_score: float  # BM25 score
    r3_score: float  # Semantic score
    combined_score: float
    rank: int


class RankingEngine:
    """
    Multi-factor ranking engine for RAG results.

    Combines BM25 (R2) and semantic (R3) ranking.
    """

    # Default weights
    DEFAULT_R2_WEIGHT = 0.3  # BM25 weight
    DEFAULT_R3_WEIGHT = 0.7  # Semantic weight

    def __init__(
        self,
        r2_weight: float = DEFAULT_R2_WEIGHT,
        r3_weight: float = DEFAULT_R3_WEIGHT,
    ):
        """
        Initialize ranking engine.

        Args:
            r2_weight: Weight for BM25 ranking (0-1)
            r3_weight: Weight for semantic ranking (0-1)
        """
        # Normalize weights
        total = r2_weight + r3_weight
        self.r2_weight = r2_weight / total
        self.r3_weight = r3_weight / total

        logger.info(
            f"Initialized RankingEngine (R2={self.r2_weight:.2f}, R3={self.r3_weight:.2f})"
        )

    def rank_results(
        self,
        r2_results: List[Tuple[str, float]],
        r3_results: List[Tuple[str, float]],
        chunks: Dict[str, str],
        top_k: int = 10,
    ) -> List[RankedResult]:
        """
        Rank results combining R2 and R3 scores.

        Args:
            r2_results: BM25 results [(chunk_id, score), ...]
            r3_results: Semantic results [(chunk_id, score), ...]
            chunks: Dict of {chunk_id: content}
            top_k: Number of top results to return

        Returns:
            List of ranked results
        """
        # Normalize scores to 0-1 range
        r2_normalized = self._normalize_scores(r2_results)
        r3_normalized = self._normalize_scores(r3_results)

        # Combine scores
        combined_scores = {}

        # Add R2 scores
        for chunk_id, score in r2_normalized:
            combined_scores[chunk_id] = self.r2_weight * score

        # Add R3 scores
        for chunk_id, score in r3_normalized:
            if chunk_id not in combined_scores:
                combined_scores[chunk_id] = 0.0
            combined_scores[chunk_id] += self.r3_weight * score

        # Create ranked results
        ranked = []
        for rank, (chunk_id, combined_score) in enumerate(
            sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:top_k],
            start=1
        ):
            r2_score = dict(r2_normalized).get(chunk_id, 0.0)
            r3_score = dict(r3_normalized).get(chunk_id, 0.0)

            ranked.append(RankedResult(
                chunk_id=chunk_id,
                content=chunks.get(chunk_id, ""),
                r2_score=r2_score,
                r3_score=r3_score,
                combined_score=combined_score,
                rank=rank,
            ))

        logger.info(f"Ranked {len(ranked)} results")
        return ranked

    def _normalize_scores(
        self,
        results: List[Tuple[str, float]],
    ) -> List[Tuple[str, float]]:
        """
        Normalize scores to 0-1 range.

        Args:
            results: List of (id, score) tuples

        Returns:
            Normalized results
        """
        if not results:
            return []

        scores = [score for _, score in results]
        min_score = min(scores)
        max_score = max(scores)

        if max_score == min_score:
            # All scores are the same
            return [(id, 0.5) for id, _ in results]

        normalized = [
            (id, (score - min_score) / (max_score - min_score))
            for id, score in results
        ]

        return normalized

    def rank_r2_only(
        self,
        r2_results: List[Tuple[str, float]],
        chunks: Dict[str, str],
        top_k: int = 10,
    ) -> List[RankedResult]:
        """
        Rank using R2 (BM25) only.

        Args:
            r2_results: BM25 results
            chunks: Chunk content dict
            top_k: Number of results

        Returns:
            Ranked results
        """
        r2_normalized = self._normalize_scores(r2_results)

        ranked = []
        for rank, (chunk_id, score) in enumerate(r2_normalized[:top_k], start=1):
            ranked.append(RankedResult(
                chunk_id=chunk_id,
                content=chunks.get(chunk_id, ""),
                r2_score=score,
                r3_score=0.0,
                combined_score=score,
                rank=rank,
            ))

        return ranked

    def rank_r3_only(
        self,
        r3_results: List[Tuple[str, float]],
        chunks: Dict[str, str],
        top_k: int = 10,
    ) -> List[RankedResult]:
        """
        Rank using R3 (semantic) only.

        Args:
            r3_results: Semantic results
            chunks: Chunk content dict
            top_k: Number of results

        Returns:
            Ranked results
        """
        r3_normalized = self._normalize_scores(r3_results)

        ranked = []
        for rank, (chunk_id, score) in enumerate(r3_normalized[:top_k], start=1):
            ranked.append(RankedResult(
                chunk_id=chunk_id,
                content=chunks.get(chunk_id, ""),
                r2_score=0.0,
                r3_score=score,
                combined_score=score,
                rank=rank,
            ))

        return ranked

    def adjust_weights(
        self,
        r2_weight: float,
        r3_weight: float,
    ) -> None:
        """
        Adjust ranking weights.

        Args:
            r2_weight: New R2 weight
            r3_weight: New R3 weight
        """
        total = r2_weight + r3_weight
        self.r2_weight = r2_weight / total
        self.r3_weight = r3_weight / total

        logger.info(
            f"Adjusted weights (R2={self.r2_weight:.2f}, R3={self.r3_weight:.2f})"
        )

    def get_weights(self) -> Dict[str, float]:
        """Get current ranking weights."""
        return {
            'r2_weight': self.r2_weight,
            'r3_weight': self.r3_weight,
        }

    def explain_score(self, result: RankedResult) -> str:
        """
        Generate explanation for ranking score.

        Args:
            result: Ranked result

        Returns:
            Explanation string
        """
        explanation = (
            f"Chunk {result.chunk_id} (Rank #{result.rank}): "
            f"Combined Score={result.combined_score:.3f} "
            f"(BM25={result.r2_score:.3f} × {self.r2_weight:.2f} + "
            f"Semantic={result.r3_score:.3f} × {self.r3_weight:.2f})"
        )
        return explanation
