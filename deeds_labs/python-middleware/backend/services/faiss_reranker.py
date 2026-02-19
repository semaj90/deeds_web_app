"""
FAISS Re-ranking Service

Re-ranks ANN results with exact similarity computation.
Verifies and corrects approximate nearest neighbor ordering.

Usage:
    reranker = FAISSReranker()
    reranked = reranker.rerank_with_exact(query_embedding, ann_results, embeddings)
"""

import logging
import numpy as np
from typing import List, Dict, Tuple, Optional
import time

logger = logging.getLogger(__name__)


class FAISSReranker:
    """FAISS re-ranking service"""

    def __init__(self):
        """Initialize FAISS reranker"""
        logger.info("FAISSReranker initialized")

    def rerank_with_exact(
        self,
        query_embedding: np.ndarray,
        ann_results: List[Dict],
        embeddings: Optional[np.ndarray] = None,
        top_k: Optional[int] = None,
    ) -> List[Dict]:
        """
        Re-rank ANN results with exact similarity.

        Args:
            query_embedding: Query embedding vector
            ann_results: Results from ANN search
            embeddings: Optional embedding matrix for exact computation
            top_k: Optional number of top results to return

        Returns:
            Re-ranked results
        """
        try:
            start_time = time.time()

            if not ann_results:
                return []

            # Normalize query
            query_norm = query_embedding / (np.linalg.norm(query_embedding) + 1e-8)

            # Compute exact similarities
            reranked = []
            for result in ann_results:
                result_id = result.get("id", "")
                result_embedding = result.get("embedding")

                if result_embedding is not None:
                    # Normalize result embedding
                    if isinstance(result_embedding, list):
                        result_embedding = np.array(result_embedding)

                    result_norm = result_embedding / (
                        np.linalg.norm(result_embedding) + 1e-8
                    )

                    # Compute exact cosine similarity
                    exact_score = float(np.dot(query_norm, result_norm))
                else:
                    # Use approximate score if embedding not available
                    exact_score = float(result.get("score", 0.0))

                reranked_result = result.copy()
                reranked_result["exact_score"] = exact_score
                reranked_result["original_score"] = result.get("score", 0.0)
                reranked.append(reranked_result)

            # Sort by exact score
            reranked.sort(key=lambda x: x["exact_score"], reverse=True)

            # Apply top-k if specified
            if top_k is not None:
                reranked = reranked[:top_k]

            # Update ranks
            for rank, result in enumerate(reranked, 1):
                result["rank"] = rank

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Re-ranked {len(ann_results)} results in {elapsed_ms}ms")

            return reranked

        except Exception as e:
            logger.error(f"Re-ranking failed: {e}")
            return ann_results

    def verify_ranking_correctness(
        self, reranked_results: List[Dict]
    ) -> Tuple[bool, List[str]]:
        """
        Verify that re-ranked results are correctly ordered.

        Args:
            reranked_results: Re-ranked results

        Returns:
            Tuple of (is_correct, errors)
        """
        errors = []

        try:
            # Check that scores are monotonically decreasing
            for i in range(len(reranked_results) - 1):
                current_score = reranked_results[i].get("exact_score", 0.0)
                next_score = reranked_results[i + 1].get("exact_score", 0.0)

                if current_score < next_score:
                    errors.append(
                        f"Score ordering violation at index {i}: "
                        f"{current_score} < {next_score}"
                    )

            # Check that ranks are sequential
            for i, result in enumerate(reranked_results):
                expected_rank = i + 1
                actual_rank = result.get("rank", 0)

                if actual_rank != expected_rank:
                    errors.append(
                        f"Rank mismatch at index {i}: "
                        f"expected {expected_rank}, got {actual_rank}"
                    )

            is_correct = len(errors) == 0

            if is_correct:
                logger.debug("Ranking verification passed")
            else:
                logger.warning(f"Ranking verification failed: {len(errors)} errors")

            return is_correct, errors

        except Exception as e:
            logger.error(f"Ranking verification failed: {e}")
            return False, [str(e)]

    def compute_ranking_quality(
        self, ann_results: List[Dict], reranked_results: List[Dict]
    ) -> Dict:
        """
        Compute quality metrics for re-ranking.

        Args:
            ann_results: Original ANN results
            reranked_results: Re-ranked results

        Returns:
            Quality metrics dictionary
        """
        try:
            # Compute rank changes
            rank_changes = []
            for i, reranked in enumerate(reranked_results):
                result_id = reranked.get("id", "")

                # Find original rank
                original_rank = None
                for j, ann in enumerate(ann_results):
                    if ann.get("id", "") == result_id:
                        original_rank = j + 1
                        break

                if original_rank is not None:
                    rank_change = original_rank - (i + 1)
                    rank_changes.append(rank_change)

            # Compute metrics
            avg_rank_change = np.mean(rank_changes) if rank_changes else 0.0
            max_rank_change = max(rank_changes) if rank_changes else 0
            num_reordered = sum(1 for rc in rank_changes if rc != 0)

            # Compute score improvements
            score_improvements = []
            for reranked in reranked_results:
                original_score = reranked.get("original_score", 0.0)
                exact_score = reranked.get("exact_score", 0.0)
                improvement = exact_score - original_score
                score_improvements.append(improvement)

            avg_score_improvement = (
                np.mean(score_improvements) if score_improvements else 0.0
            )

            return {
                "num_results": len(reranked_results),
                "num_reordered": num_reordered,
                "avg_rank_change": float(avg_rank_change),
                "max_rank_change": int(max_rank_change),
                "avg_score_improvement": float(avg_score_improvement),
            }

        except Exception as e:
            logger.error(f"Quality computation failed: {e}")
            return {}

    def get_stats(self) -> Dict:
        """Get reranker statistics"""
        return {
            "service": "FAISSReranker",
            "version": "1.0",
        }


# Singleton instance
_faiss_reranker = None


def get_faiss_reranker() -> FAISSReranker:
    """Get or create singleton FAISS reranker"""
    global _faiss_reranker
    if _faiss_reranker is None:
        _faiss_reranker = FAISSReranker()
    return _faiss_reranker
