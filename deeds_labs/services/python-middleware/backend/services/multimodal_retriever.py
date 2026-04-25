"""
Multimodal Retriever

Orchestrates RAG + KAG + VAG retrieval with fusion ranking.
Combines query embedding, Qdrant search, KAG expansion, and FAISS search.

Usage:
    retriever = MultimodalRetriever()
    results = await retriever.retrieve("What is the meaning of life?")
"""

import logging
import asyncio
import time
from typing import List, Dict, Optional
import numpy as np

try:
    from backend.services.query_embedder import get_query_embedder
    from backend.services.qdrant_client import QdrantClient
    from backend.services.kag_expander import get_kag_expander
    from backend.services.faiss_builder import FAISSBuilder
    from backend.services.fusion_ranker import get_fusion_ranker
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.warning(f"Import error: {e}")

logger = logging.getLogger(__name__)


class MultimodalRetriever:
    """Multimodal retriever orchestrating RAG + KAG + VAG"""

    def __init__(
        self,
        qdrant_collection: str = "embeddings",
        faiss_index_path: Optional[str] = None,
        rag_top_k: int = 20,
        kag_depth: int = 2,
        vag_top_k: int = 20,
        fusion_top_k: int = 20,
    ):
        """
        Initialize multimodal retriever.

        Args:
            qdrant_collection: Qdrant collection name for RAG
            faiss_index_path: Path to FAISS index for VAG
            rag_top_k: Number of RAG results
            kag_depth: KAG expansion depth
            vag_top_k: Number of VAG results
            fusion_top_k: Number of final fused results
        """
        self.query_embedder = get_query_embedder()
        self.qdrant = QdrantClient()
        self.kag_expander = get_kag_expander()
        self.faiss = FAISSBuilder()
        self.fusion_ranker = get_fusion_ranker()

        self.qdrant_collection = qdrant_collection
        self.faiss_index_path = faiss_index_path
        self.rag_top_k = rag_top_k
        self.kag_depth = kag_depth
        self.vag_top_k = vag_top_k
        self.fusion_top_k = fusion_top_k

        # Load FAISS index if provided
        self.faiss_index = None
        if faiss_index_path:
            try:
                self.faiss_index = self.faiss.load_index(faiss_index_path)
                logger.info(f"Loaded FAISS index from {faiss_index_path}")
            except Exception as e:
                logger.warning(f"Failed to load FAISS index: {e}")

        logger.info(
            f"MultimodalRetriever initialized "
            f"(RAG top-{rag_top_k}, KAG depth-{kag_depth}, VAG top-{vag_top_k}, "
            f"fusion top-{fusion_top_k})"
        )

    async def retrieve(
        self,
        query: str,
        rag_top_k: Optional[int] = None,
        kag_depth: Optional[int] = None,
        vag_top_k: Optional[int] = None,
        fusion_top_k: Optional[int] = None,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Dict]:
        """
        Full multimodal retrieval pipeline.

        Args:
            query: Query text
            rag_top_k: Override RAG top-k
            kag_depth: Override KAG depth
            vag_top_k: Override VAG top-k
            fusion_top_k: Override fusion top-k
            weights: Custom fusion weights

        Returns:
            List of ranked results
        """
        start_time = time.time()

        try:
            # Use provided values or defaults
            rag_k = rag_top_k or self.rag_top_k
            kag_d = kag_depth or self.kag_depth
            vag_k = vag_top_k or self.vag_top_k
            fusion_k = fusion_top_k or self.fusion_top_k

            logger.info(f"Starting multimodal retrieval for query: {query[:50]}...")

            # 1. Embed query
            query_vec = await self._embed_query(query)
            if query_vec is None:
                logger.error("Failed to embed query")
                return []

            # 2. RAG search (Qdrant)
            rag_results = await self._rag_search(query_vec, rag_k)

            # 3. KAG expansion
            kag_results = await self._kag_expand(rag_results, kag_d)

            # 4. VAG search (FAISS)
            vag_results = await self._vag_search(query_vec, vag_k)

            # 5. Fuse and rank
            final_results = await self._fuse_and_rank(
                query, rag_results, kag_results, vag_results, weights, fusion_k
            )

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.info(
                f"Multimodal retrieval completed in {elapsed_ms}ms "
                f"(RAG={len(rag_results)}, KAG={len(kag_results)}, VAG={len(vag_results)}, "
                f"final={len(final_results)})"
            )

            return final_results

        except Exception as e:
            logger.error(f"Multimodal retrieval failed: {e}")
            return []

    async def _embed_query(self, query: str) -> Optional[np.ndarray]:
        """Embed query using query embedder"""
        try:
            embedding = self.query_embedder.embed_query(query, normalize=True)
            logger.debug(f"Embedded query: {query[:50]}... (dim={embedding.shape[0]})")
            return embedding
        except Exception as e:
            logger.error(f"Query embedding failed: {e}")
            return None

    async def _rag_search(self, query_vec: np.ndarray, top_k: int) -> List[Dict]:
        """RAG search using Qdrant"""
        try:
            results = self.qdrant.search(self.qdrant_collection, query_vec, top_k=top_k)
            logger.debug(f"RAG search returned {len(results)} results")
            return results
        except Exception as e:
            logger.error(f"RAG search failed: {e}")
            return []

    async def _kag_expand(self, rag_results: List[Dict], depth: int) -> List[Dict]:
        """KAG expansion from RAG results"""
        try:
            kag_results = []

            # Expand from top RAG results
            for result in rag_results[:5]:  # Limit to top 5 for efficiency
                node_id = str(result.get("id", result.get("chunk_id", "")))
                expanded = self.kag_expander.expand(node_id, depth)
                kag_results.extend(expanded)

            logger.debug(f"KAG expansion returned {len(kag_results)} results")
            return kag_results

        except Exception as e:
            logger.error(f"KAG expansion failed: {e}")
            return []

    async def _vag_search(self, query_vec: np.ndarray, top_k: int) -> List[Dict]:
        """VAG search using FAISS"""
        try:
            if self.faiss_index is None:
                logger.warning("FAISS index not loaded, skipping VAG search")
                return []

            results = self.faiss.search(self.faiss_index, query_vec, k=top_k)
            logger.debug(f"VAG search returned {len(results)} results")
            return results

        except Exception as e:
            logger.error(f"VAG search failed: {e}")
            return []

    async def _fuse_and_rank(
        self,
        query: str,
        rag_results: List[Dict],
        kag_results: List[Dict],
        vag_results: List[Dict],
        weights: Optional[Dict[str, float]],
        top_k: int,
    ) -> List[Dict]:
        """Fuse and rank results"""
        try:
            results = await self.fusion_ranker.fuse_and_rank(
                query, rag_results, kag_results, vag_results, weights, top_k
            )
            logger.debug(f"Fusion and ranking returned {len(results)} results")
            return results

        except Exception as e:
            logger.error(f"Fusion and ranking failed: {e}")
            return []

    async def retrieve_with_details(
        self,
        query: str,
        include_scores: bool = True,
        include_metadata: bool = True,
    ) -> Dict:
        """
        Retrieve with detailed breakdown of each modality.

        Args:
            query: Query text
            include_scores: Include component scores
            include_metadata: Include metadata

        Returns:
            Dictionary with detailed results
        """
        start_time = time.time()

        try:
            # Embed query
            query_vec = await self._embed_query(query)
            if query_vec is None:
                return {"error": "Failed to embed query"}

            # RAG search
            rag_results = await self._rag_search(query_vec, self.rag_top_k)

            # KAG expansion
            kag_results = await self._kag_expand(rag_results, self.kag_depth)

            # VAG search
            vag_results = await self._vag_search(query_vec, self.vag_top_k)

            # Fuse and rank
            final_results = await self._fuse_and_rank(
                query, rag_results, kag_results, vag_results, None, self.fusion_top_k
            )

            elapsed_ms = int((time.time() - start_time) * 1000)

            return {
                "query": query,
                "elapsed_ms": elapsed_ms,
                "rag": {
                    "count": len(rag_results),
                    "results": rag_results if include_scores else [],
                },
                "kag": {
                    "count": len(kag_results),
                    "results": kag_results if include_scores else [],
                },
                "vag": {
                    "count": len(vag_results),
                    "results": vag_results if include_scores else [],
                },
                "final": {
                    "count": len(final_results),
                    "results": final_results,
                },
            }

        except Exception as e:
            logger.error(f"Detailed retrieval failed: {e}")
            return {"error": str(e)}

    def get_stats(self) -> Dict:
        """Get retriever statistics"""
        return {
            "query_embedder": self.query_embedder.get_cache_stats(),
            "kag_expander": self.kag_expander.get_cache_stats(),
            "qdrant_collection": self.qdrant_collection,
            "faiss_index_loaded": self.faiss_index is not None,
            "rag_top_k": self.rag_top_k,
            "kag_depth": self.kag_depth,
            "vag_top_k": self.vag_top_k,
            "fusion_top_k": self.fusion_top_k,
        }


# Singleton instance
_multimodal_retriever = None


def get_multimodal_retriever() -> MultimodalRetriever:
    """Get or create singleton multimodal retriever"""
    global _multimodal_retriever
    if _multimodal_retriever is None:
        _multimodal_retriever = MultimodalRetriever()
    return _multimodal_retriever
