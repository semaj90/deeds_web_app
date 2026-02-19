"""
Fusion Ranker

Implements weighted combination of RAG, KAG, and VAG scores.
Ensures monotonicity with component scores and provides final ranking.

Usage:
    ranker = FusionRanker()
    results = ranker.fuse_and_rank(
        query="What is X?",
        rag_results=[...],
        kag_results=[...],
        vag_results=[...],
        weights={"rag": 0.4, "kag": 0.3, "vag": 0.3}
    )
"""

import logging
import asyncio
import time
from typing import List, Dict, Optional
from dataclasses import dataclass
import numpy as np

try:
    from backend.reranker_service import get_reranker_service
except ImportError:
    get_reranker_service = None

logger = logging.getLogger(__name__)


@dataclass
class FusedResult:
    """Fused and ranked result"""

    id: str
    text: str
    rag_score: float
    kag_score: float
    vag_score: float
    fusion_score: float
    rank: int
    metadata: Dict


class FusionRanker:
    """Fusion ranker for multimodal retrieval"""

    def __init__(
        self,
        rag_weight: float = 0.4,
        kag_weight: float = 0.3,
        vag_weight: float = 0.3,
        use_reranker: bool = True,
    ):
        """
        Initialize fusion ranker.

        Args:
            rag_weight: Weight for RAG scores
            kag_weight: Weight for KAG scores
            vag_weight: Weight for VAG scores
            use_reranker: Whether to use cross-encoder reranking
        """
        # Normalize weights
        total = rag_weight + kag_weight + vag_weight
        self.rag_weight = rag_weight / total
        self.kag_weight = kag_weight / total
        self.vag_weight = vag_weight / total

        self.use_reranker = use_reranker
        self.reranker = None

        if use_reranker and get_reranker_service:
            try:
                # Note: get_reranker_service is async, we'll handle it in async context
                logger.info("Fusion ranker will use cross-encoder reranking")
            except Exception as e:
                logger.warning(f"Failed to initialize reranker: {e}")
                self.use_reranker = False

        logger.info(
            f"FusionRanker initialized (RAG={self.rag_weight:.2f}, "
            f"KAG={self.kag_weight:.2f}, VAG={self.vag_weight:.2f})"
        )

    def _normalize_scores(self, scores: List[float]) -> List[float]:
        """Normalize scores to [0, 1] range"""
        if not scores:
            return []

        min_score = min(scores)
        max_score = max(scores)

        if max_score == min_score:
            return [0.5] * len(scores)

        return [(s - min_score) / (max_score - min_score) for s in scores]

    def _compute_fusion_score(
        self, rag_score: float, kag_score: float, vag_score: float
    ) -> float:
        """
        Compute weighted fusion score.

        Ensures monotonicity: if any component score increases, fusion score increases.
        """
        fusion = (
            self.rag_weight * rag_score
            + self.kag_weight * kag_score
            + self.vag_weight * vag_score
        )
        return fusion

    def _extract_score(self, result: Dict, score_key: str = "score") -> float:
        """Extract score from result dictionary"""
        if isinstance(result, dict):
            return float(result.get(score_key, 0.0))
        return 0.0

    def fuse_results(
        self,
        rag_results: List[Dict],
        kag_results: List[Dict],
        vag_results: List[Dict],
        weights: Optional[Dict[str, float]] = None,
    ) -> List[FusedResult]:
        """
        Fuse RAG, KAG, and VAG results.

        Args:
            rag_results: RAG search results
            kag_results: KAG expansion results
            vag_results: VAG search results
            weights: Optional custom weights

        Returns:
            List of fused results
        """
        # Update weights if provided
        if weights:
            total = weights.get("rag", 0.4) + weights.get("kag", 0.3) + weights.get("vag", 0.3)
            rag_w = weights.get("rag", 0.4) / total
            kag_w = weights.get("kag", 0.3) / total
            vag_w = weights.get("vag", 0.3) / total
        else:
            rag_w = self.rag_weight
            kag_w = self.kag_weight
            vag_w = self.vag_weight

        # Create result map
        result_map: Dict[str, FusedResult] = {}

        # Process RAG results
        rag_scores = [self._extract_score(r) for r in rag_results]
        rag_normalized = self._normalize_scores(rag_scores)

        for result, score in zip(rag_results, rag_normalized):
            result_id = str(result.get("id", result.get("chunk_id", "")))
            if result_id not in result_map:
                result_map[result_id] = FusedResult(
                    id=result_id,
                    text=result.get("text", ""),
                    rag_score=score,
                    kag_score=0.0,
                    vag_score=0.0,
                    fusion_score=0.0,
                    rank=0,
                    metadata=result.get("metadata", {}),
                )
            else:
                result_map[result_id].rag_score = max(result_map[result_id].rag_score, score)

        # Process KAG results
        kag_scores = [self._extract_score(r, "weight") for r in kag_results]
        kag_normalized = self._normalize_scores(kag_scores)

        for result, score in zip(kag_results, kag_normalized):
            result_id = str(result.get("id", ""))
            if result_id not in result_map:
                result_map[result_id] = FusedResult(
                    id=result_id,
                    text=result.get("symbol", ""),
                    rag_score=0.0,
                    kag_score=score,
                    vag_score=0.0,
                    fusion_score=0.0,
                    rank=0,
                    metadata=result.get("metadata", {}),
                )
            else:
                result_map[result_id].kag_score = max(result_map[result_id].kag_score, score)

        # Process VAG results
        vag_scores = [self._extract_score(r) for r in vag_results]
        vag_normalized = self._normalize_scores(vag_scores)

        for result, score in zip(vag_results, vag_normalized):
            result_id = str(result.get("id", ""))
            if result_id not in result_map:
                result_map[result_id] = FusedResult(
                    id=result_id,
                    text=result.get("text", ""),
                    rag_score=0.0,
                    kag_score=0.0,
                    vag_score=score,
                    fusion_score=0.0,
                    rank=0,
                    metadata=result.get("metadata", {}),
                )
            else:
                result_map[result_id].vag_score = max(result_map[result_id].vag_score, score)

        # Compute fusion scores
        fused_results = list(result_map.values())
        for result in fused_results:
            result.fusion_score = self._compute_fusion_score(
                result.rag_score, result.kag_score, result.vag_score
            )

        # Sort by fusion score
        fused_results.sort(key=lambda x: x.fusion_score, reverse=True)

        # Assign ranks
        for rank, result in enumerate(fused_results, 1):
            result.rank = rank

        logger.debug(
            f"Fused {len(rag_results)} RAG + {len(kag_results)} KAG + {len(vag_results)} VAG "
            f"results into {len(fused_results)} unique results"
        )

        return fused_results

    async def fuse_and_rank(
        self,
        query: str,
        rag_results: List[Dict],
        kag_results: List[Dict],
        vag_results: List[Dict],
        weights: Optional[Dict[str, float]] = None,
        top_k: int = 20,
    ) -> List[Dict]:
        """
        Fuse results and optionally rerank with cross-encoder.

        Args:
            query: Original query
            rag_results: RAG search results
            kag_results: KAG expansion results
            vag_results: VAG search results
            weights: Optional custom weights
            top_k: Number of top results to return

        Returns:
            List of ranked results
        """
        start_time = time.time()

        try:
            # Fuse results
            fused_results = self.fuse_results(rag_results, kag_results, vag_results, weights)

            # Optionally rerank with cross-encoder
            if self.use_reranker and get_reranker_service:
                try:
                    reranker = await get_reranker_service()

                    # Prepare candidates for reranking
                    candidates = [
                        {
                            "id": r.id,
                            "text": r.text,
                            "chunk_id": r.id,
                            "doc_id": r.id,
                            "page": 0,
                            "bounding_boxes": [],
                            "semantic_type": "text",
                            "metadata": r.metadata,
                        }
                        for r in fused_results[:50]  # Rerank top 50
                    ]

                    # Rerank
                    reranked = await reranker.rerank(query, candidates, top_k=top_k)

                    # Convert back to dict format
                    results = [
                        {
                            "id": r.chunk_id,
                            "text": r.text,
                            "score": r.score,
                            "rank": idx + 1,
                            "metadata": r.metadata,
                        }
                        for idx, r in enumerate(reranked)
                    ]

                    elapsed_ms = int((time.time() - start_time) * 1000)
                    logger.debug(f"Fused and reranked in {elapsed_ms}ms (top-{len(results)})")

                    return results

                except Exception as e:
                    logger.warning(f"Reranking failed, using fusion scores: {e}")

            # Return top-k fused results
            results = [
                {
                    "id": r.id,
                    "text": r.text,
                    "score": r.fusion_score,
                    "rag_score": r.rag_score,
                    "kag_score": r.kag_score,
                    "vag_score": r.vag_score,
                    "rank": r.rank,
                    "metadata": r.metadata,
                }
                for r in fused_results[:top_k]
            ]

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Fused and ranked in {elapsed_ms}ms (top-{len(results)})")

            return results

        except Exception as e:
            logger.error(f"Fusion and ranking failed: {e}")
            return []

    def verify_monotonicity(
        self, rag_score: float, kag_score: float, vag_score: float
    ) -> bool:
        """
        Verify that fusion score is monotonic with component scores.

        For any increase in a component score, fusion score should increase.
        """
        base_fusion = self._compute_fusion_score(rag_score, kag_score, vag_score)

        # Test RAG increase
        rag_fusion = self._compute_fusion_score(rag_score + 0.1, kag_score, vag_score)
        if rag_fusion <= base_fusion:
            return False

        # Test KAG increase
        kag_fusion = self._compute_fusion_score(rag_score, kag_score + 0.1, vag_score)
        if kag_fusion <= base_fusion:
            return False

        # Test VAG increase
        vag_fusion = self._compute_fusion_score(rag_score, kag_score, vag_score + 0.1)
        if vag_fusion <= base_fusion:
            return False

        return True


# Singleton instance
_fusion_ranker = None


def get_fusion_ranker() -> FusionRanker:
    """Get or create singleton fusion ranker"""
    global _fusion_ranker
    if _fusion_ranker is None:
        _fusion_ranker = FusionRanker()
    return _fusion_ranker
