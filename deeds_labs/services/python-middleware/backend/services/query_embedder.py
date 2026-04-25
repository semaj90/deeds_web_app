"""
Query Embedding Service

Wraps EmbeddingGemma for query embedding with caching and normalization.
Provides FP16 embeddings for efficient storage and computation.

Usage:
    embedder = QueryEmbedder()
    query_vec = embedder.embed_query("What is the meaning of life?")
    batch_vecs = embedder.embed_batch(["query1", "query2"])
"""

import logging
import numpy as np
from typing import List, Optional, Dict
import hashlib
import json

try:
    from backend.services.embedding_service import get_embedding_service
except ImportError:
    get_embedding_service = None

logger = logging.getLogger(__name__)


class QueryEmbedder:
    """Query embedding service with caching and normalization"""

    def __init__(self, cache_size: int = 1000, use_fp16: bool = True):
        """
        Initialize query embedder.

        Args:
            cache_size: Maximum number of cached embeddings
            use_fp16: Whether to use FP16 format for embeddings
        """
        self.embedding_service = get_embedding_service() if get_embedding_service else None
        self.cache_size = cache_size
        self.use_fp16 = use_fp16
        self.cache: Dict[str, np.ndarray] = {}
        self.embedding_dim = 768

        if self.embedding_service:
            self.embedding_dim = self.embedding_service.embedding_dim
            logger.info(f"QueryEmbedder initialized with {self.embedding_dim}d embeddings")
        else:
            logger.warning("EmbeddingGemma service not available")

    def _get_cache_key(self, text: str) -> str:
        """Generate cache key for text"""
        return hashlib.md5(text.encode()).hexdigest()

    def _normalize_embedding(self, embedding: np.ndarray) -> np.ndarray:
        """Normalize embedding to unit vector"""
        norm = np.linalg.norm(embedding)
        if norm > 0:
            return embedding / norm
        return embedding

    def _to_fp16(self, embedding: np.ndarray) -> np.ndarray:
        """Convert embedding to FP16 format"""
        if self.use_fp16:
            return embedding.astype(np.float16)
        return embedding

    def _from_fp16(self, embedding: np.ndarray) -> np.ndarray:
        """Convert embedding from FP16 format"""
        if embedding.dtype == np.float16:
            return embedding.astype(np.float32)
        return embedding

    def embed_query(self, query: str, normalize: bool = True) -> np.ndarray:
        """
        Embed a single query.

        Args:
            query: Query text
            normalize: Whether to normalize to unit vector

        Returns:
            Embedding vector (768-dim)
        """
        if not query or not self.embedding_service:
            logger.warning("Query is empty or embedding service unavailable")
            return np.zeros(self.embedding_dim, dtype=np.float32)

        # Check cache
        cache_key = self._get_cache_key(query)
        if cache_key in self.cache:
            embedding = self.cache[cache_key]
            logger.debug(f"Cache hit for query: {query[:50]}...")
            return embedding

        try:
            # Get embedding
            embedding = self.embedding_service.embed_single(query)

            # Normalize
            if normalize:
                embedding = self._normalize_embedding(embedding)

            # Convert to FP16
            embedding = self._to_fp16(embedding)

            # Cache
            if len(self.cache) >= self.cache_size:
                # Remove oldest entry (simple FIFO)
                self.cache.pop(next(iter(self.cache)))

            self.cache[cache_key] = embedding

            logger.debug(f"Embedded query: {query[:50]}... (dim={embedding.shape[0]})")
            return embedding

        except Exception as e:
            logger.error(f"Failed to embed query: {e}")
            return np.zeros(self.embedding_dim, dtype=np.float32)

    def embed_batch(
        self, queries: List[str], normalize: bool = True, batch_size: int = 32
    ) -> np.ndarray:
        """
        Embed multiple queries.

        Args:
            queries: List of query texts
            normalize: Whether to normalize to unit vectors
            batch_size: Batch size for processing

        Returns:
            Embedding matrix (len(queries) x 768)
        """
        if not queries or not self.embedding_service:
            logger.warning("Queries empty or embedding service unavailable")
            return np.zeros((len(queries), self.embedding_dim), dtype=np.float32)

        embeddings = []

        try:
            # Check cache for each query
            uncached_queries = []
            uncached_indices = []

            for idx, query in enumerate(queries):
                cache_key = self._get_cache_key(query)
                if cache_key in self.cache:
                    embeddings.append((idx, self.cache[cache_key]))
                else:
                    uncached_queries.append(query)
                    uncached_indices.append(idx)

            # Embed uncached queries
            if uncached_queries:
                batch_embeddings = self.embedding_service.embed(uncached_queries, batch_size)

                # Normalize
                if normalize:
                    batch_embeddings = np.array(
                        [self._normalize_embedding(e) for e in batch_embeddings]
                    )

                # Convert to FP16
                batch_embeddings = self._to_fp16(batch_embeddings)

                # Cache and collect
                for query, embedding, idx in zip(uncached_queries, batch_embeddings, uncached_indices):
                    cache_key = self._get_cache_key(query)

                    if len(self.cache) >= self.cache_size:
                        self.cache.pop(next(iter(self.cache)))

                    self.cache[cache_key] = embedding
                    embeddings.append((idx, embedding))

            # Sort by original index
            embeddings.sort(key=lambda x: x[0])
            result = np.array([e[1] for e in embeddings])

            logger.debug(f"Embedded {len(queries)} queries (dim={result.shape})")
            return result

        except Exception as e:
            logger.error(f"Failed to embed batch: {e}")
            return np.zeros((len(queries), self.embedding_dim), dtype=np.float32)

    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            "cache_size": len(self.cache),
            "max_cache_size": self.cache_size,
            "embedding_dim": self.embedding_dim,
            "use_fp16": self.use_fp16,
        }

    def clear_cache(self) -> None:
        """Clear embedding cache"""
        self.cache.clear()
        logger.info("Cleared embedding cache")

    def get_device_info(self) -> Dict:
        """Get device information"""
        if self.embedding_service:
            return self.embedding_service.get_device_info()
        return {"device": "unknown", "embedding_dim": self.embedding_dim}


# Singleton instance
_query_embedder = None


def get_query_embedder() -> QueryEmbedder:
    """Get or create singleton query embedder"""
    global _query_embedder
    if _query_embedder is None:
        _query_embedder = QueryEmbedder()
    return _query_embedder
