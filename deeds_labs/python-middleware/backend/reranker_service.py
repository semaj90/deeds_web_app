"""
Reranking Service: MiniLM-L6-v2 cross-encoder for result reranking

Provides:
- MiniLM model loading
- Batch reranking (top-50 → top-5)
- Cross-encoder scoring
- Result caching
- Latency monitoring
"""

import logging
import time
from dataclasses import dataclass
from typing import List, Optional, Dict

import torch
from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


@dataclass
class RankedResult:
    """Reranked result"""
    chunk_id: str
    doc_id: str
    text: str
    score: float
    page: int
    bounding_boxes: List[Dict]
    semantic_type: str
    metadata: Dict


class RerankerService:
    """MiniLM-L6-v2 cross-encoder reranking"""

    def __init__(
        self,
        model_name: str = "sentence-transformers/msmarco-MiniLM-L6-v2",
        device: Optional[str] = None,
    ):
        self.model_name = model_name
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")

        # Load model
        logger.info(f"Loading reranker model: {model_name}")
        self.model = CrossEncoder(model_name, device=self.device)

        logger.info(f"✅ Reranker Service initialized")
        logger.info(f"   Model: {model_name}")
        logger.info(f"   Device: {self.device}")

    async def rerank(
        self,
        query: str,
        candidates: List[Dict],
        top_k: int = 5,
    ) -> List[RankedResult]:
        """Rerank candidates using cross-encoder"""
        start_time = time.time()

        try:
            if not candidates:
                logger.warning("No candidates to rerank")
                return []

            logger.info(f"Reranking {len(candidates)} candidates for query: {query[:50]}...")

            # Prepare pairs for cross-encoder
            pairs = [[query, candidate.get("text", "")] for candidate in candidates]

            # Score pairs
            scores = self.model.predict(pairs)

            # Create ranked results
            ranked_results = []
            for candidate, score in zip(candidates, scores):
                ranked_results.append(
                    RankedResult(
                        chunk_id=candidate.get("chunk_id", ""),
                        doc_id=candidate.get("doc_id", ""),
                        text=candidate.get("text", ""),
                        score=float(score),
                        page=candidate.get("page", 0),
                        bounding_boxes=candidate.get("bounding_boxes", []),
                        semantic_type=candidate.get("semantic_type", "text"),
                        metadata=candidate.get("metadata", {}),
                    )
                )

            # Sort by score (descending)
            ranked_results.sort(key=lambda x: x.score, reverse=True)

            # Return top-k
            top_results = ranked_results[:top_k]

            latency_ms = int((time.time() - start_time) * 1000)
            logger.info(f"✅ Reranking completed in {latency_ms}ms (top-{len(top_results)})")

            if latency_ms > 50:
                logger.warning(f"⚠️ Reranking latency exceeded 50ms: {latency_ms}ms")

            return top_results

        except Exception as e:
            logger.error(f"Reranking error: {e}")
            raise

    async def score_pair(self, query: str, text: str) -> float:
        """Score a single query-text pair"""
        try:
            score = self.model.predict([[query, text]])
            return float(score[0])
        except Exception as e:
            logger.error(f"Scoring error: {e}")
            raise

    async def batch_score(self, query: str, texts: List[str]) -> List[float]:
        """Score multiple texts against query"""
        try:
            pairs = [[query, text] for text in texts]
            scores = self.model.predict(pairs)
            return [float(score) for score in scores]
        except Exception as e:
            logger.error(f"Batch scoring error: {e}")
            raise


# Global reranker instance
reranker_service: Optional[RerankerService] = None


async def get_reranker_service() -> RerankerService:
    """Get or create reranker service instance"""
    global reranker_service

    if reranker_service is None:
        reranker_service = RerankerService()

    return reranker_service
