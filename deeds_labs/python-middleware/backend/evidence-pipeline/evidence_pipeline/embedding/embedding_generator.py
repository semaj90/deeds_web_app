"""
Embedding generation module for evidence processing pipeline.
Generates 768-dimensional embeddings using Gemma3 embedding model.
"""

import logging
import asyncio
import numpy as np
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import aiohttp

logger = logging.getLogger(__name__)


@dataclass
class EmbeddingResult:
    """Result of embedding generation."""
    chunk_id: str
    embedding: List[float]
    model: str = "embeddinggemma:latest"
    confidence: float = 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            'chunk_id': self.chunk_id,
            'embedding': self.embedding,
            'model': self.model,
            'confidence': self.confidence,
            'metadata': self.metadata
        }

    def to_numpy(self) -> np.ndarray:
        """Convert embedding to numpy array."""
        return np.array(self.embedding, dtype=np.float32)


class EmbeddingGenerator:
    """Generates embeddings using Gemma3 embedding model."""

    def __init__(
        self,
        ollama_base_url: str = "http://localhost:11434",
        model_name: str = "embeddinggemma:latest",
        embedding_dim: int = 768,
        timeout: int = 60,
        max_retries: int = 3,
        retry_backoff: float = 2.0
    ):
        """
        Initialize embedding generator.

        Args:
            ollama_base_url: Base URL for Ollama API
            model_name: Embedding model name
            embedding_dim: Expected embedding dimension
            timeout: Request timeout in seconds
            max_retries: Maximum retry attempts
            retry_backoff: Backoff multiplier for retries
        """
        self.ollama_base_url = ollama_base_url
        self.model_name = model_name
        self.embedding_dim = embedding_dim
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff

        logger.info(
            f"Initialized EmbeddingGenerator: {model_name} "
            f"({embedding_dim}-dimensional)"
        )

    async def generate_embedding(
        self,
        chunk_id: str,
        text: str
    ) -> Optional[EmbeddingResult]:
        """
        Generate embedding for text chunk.

        Args:
            chunk_id: Unique chunk identifier
            text: Text to embed

        Returns:
            EmbeddingResult or None on failure
        """
        try:
            logger.info(f"Generating embedding for chunk: {chunk_id}")

            # Call Ollama API with retry logic
            embedding = await self._call_ollama_with_retry(text)

            if embedding is None:
                logger.error(f"Failed to generate embedding for chunk: {chunk_id}")
                return None

            # Validate embedding
            if not await self._validate_embedding(embedding):
                logger.error(f"Invalid embedding for chunk: {chunk_id}")
                return None

            # Normalize embedding
            embedding = await self._normalize_embedding(embedding)

            result = EmbeddingResult(
                chunk_id=chunk_id,
                embedding=embedding,
                model=self.model_name,
                confidence=1.0,
                metadata={
                    'text_length': len(text),
                    'word_count': len(text.split())
                }
            )

            logger.info(f"Embedding generated successfully for chunk: {chunk_id}")
            return result

        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return None

    async def batch_generate_embeddings(
        self,
        chunks: List[Dict[str, str]],
        max_concurrent: int = 5
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for multiple chunks concurrently.

        Args:
            chunks: List of dicts with 'id' and 'content' keys
            max_concurrent: Maximum concurrent requests

        Returns:
            List of EmbeddingResult objects
        """
        try:
            logger.info(f"Batch generating embeddings for {len(chunks)} chunks")

            # Create semaphore for concurrency control
            semaphore = asyncio.Semaphore(max_concurrent)

            async def generate_with_semaphore(chunk):
                async with semaphore:
                    return await self.generate_embedding(chunk['id'], chunk['content'])

            # Generate all embeddings concurrently
            results = await asyncio.gather(
                *[generate_with_semaphore(chunk) for chunk in chunks],
                return_exceptions=True
            )

            # Filter out exceptions and None values
            embeddings = [
                r for r in results
                if isinstance(r, EmbeddingResult) and r is not None
            ]

            logger.info(
                f"Batch embedding generation complete: "
                f"{len(embeddings)}/{len(chunks)} successful"
            )

            return embeddings

        except Exception as e:
            logger.error(f"Failed to batch generate embeddings: {e}")
            return []

    async def _call_ollama_with_retry(self, text: str) -> Optional[List[float]]:
        """
        Call Ollama embedding API with retry logic.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None on failure
        """
        for attempt in range(self.max_retries):
            try:
                embedding = await self._call_ollama(text)

                if embedding is not None:
                    return embedding

                # Exponential backoff before retry
                if attempt < self.max_retries - 1:
                    wait_time = self.retry_backoff ** attempt
                    logger.warning(
                        f"Embedding generation failed, retrying in {wait_time}s "
                        f"(attempt {attempt + 1}/{self.max_retries})"
                    )
                    await asyncio.sleep(wait_time)

            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} failed: {e}")

                if attempt < self.max_retries - 1:
                    wait_time = self.retry_backoff ** attempt
                    await asyncio.sleep(wait_time)

        logger.error(f"Failed to generate embedding after {self.max_retries} attempts")
        return None

    async def _call_ollama(self, text: str) -> Optional[List[float]]:
        """
        Call Ollama embedding API.

        Args:
            text: Text to embed

        Returns:
            Embedding vector or None on failure
        """
        try:
            url = f"{self.ollama_base_url}/api/embeddings"

            payload = {
                "model": self.model_name,
                "prompt": text
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=self.timeout)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        embedding = data.get('embedding', None)
                        return embedding
                    else:
                        logger.error(f"Ollama API error: {response.status}")
                        return None

        except asyncio.TimeoutError:
            logger.error("Ollama API timeout")
            return None
        except Exception as e:
            logger.error(f"Failed to call Ollama: {e}")
            return None

    async def _validate_embedding(self, embedding: List[float]) -> bool:
        """
        Validate embedding vector.

        Args:
            embedding: Embedding vector

        Returns:
            True if valid, False otherwise
        """
        try:
            if not isinstance(embedding, list):
                logger.warning("Embedding is not a list")
                return False

            if len(embedding) != self.embedding_dim:
                logger.warning(
                    f"Embedding dimension mismatch: "
                    f"expected {self.embedding_dim}, got {len(embedding)}"
                )
                return False

            # Check for NaN or Inf values
            for value in embedding:
                if not isinstance(value, (int, float)):
                    logger.warning(f"Invalid embedding value type: {type(value)}")
                    return False

                if np.isnan(value) or np.isinf(value):
                    logger.warning(f"Invalid embedding value: {value}")
                    return False

            return True

        except Exception as e:
            logger.error(f"Embedding validation failed: {e}")
            return False

    async def _normalize_embedding(self, embedding: List[float]) -> List[float]:
        """
        Normalize embedding vector to unit length.

        Args:
            embedding: Embedding vector

        Returns:
            Normalized embedding vector
        """
        try:
            arr = np.array(embedding, dtype=np.float32)

            # Calculate L2 norm
            norm = np.linalg.norm(arr)

            if norm == 0:
                logger.warning("Embedding has zero norm, returning as-is")
                return embedding

            # Normalize
            normalized = arr / norm

            return normalized.tolist()

        except Exception as e:
            logger.warning(f"Embedding normalization failed: {e}")
            return embedding

    def calculate_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float]
    ) -> float:
        """
        Calculate cosine similarity between two embeddings.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Similarity score (0-1)
        """
        try:
            arr1 = np.array(embedding1, dtype=np.float32)
            arr2 = np.array(embedding2, dtype=np.float32)

            # Calculate cosine similarity
            similarity = np.dot(arr1, arr2) / (
                np.linalg.norm(arr1) * np.linalg.norm(arr2)
            )

            # Clamp to [0, 1]
            return float(np.clip(similarity, 0, 1))

        except Exception as e:
            logger.error(f"Similarity calculation failed: {e}")
            return 0.0

    def get_embedding_statistics(
        self,
        embeddings: List[EmbeddingResult]
    ) -> Dict[str, Any]:
        """
        Get statistics about embeddings.

        Args:
            embeddings: List of EmbeddingResult objects

        Returns:
            Statistics dictionary
        """
        try:
            if not embeddings:
                return {
                    'total_embeddings': 0,
                    'avg_confidence': 0.0,
                    'embedding_dim': self.embedding_dim
                }

            embedding_arrays = [
                np.array(e.embedding, dtype=np.float32) for e in embeddings
            ]

            # Calculate statistics
            confidences = [e.confidence for e in embeddings]
            norms = [np.linalg.norm(arr) for arr in embedding_arrays]

            return {
                'total_embeddings': len(embeddings),
                'avg_confidence': np.mean(confidences),
                'min_confidence': np.min(confidences),
                'max_confidence': np.max(confidences),
                'embedding_dim': self.embedding_dim,
                'avg_norm': np.mean(norms),
                'min_norm': np.min(norms),
                'max_norm': np.max(norms)
            }

        except Exception as e:
            logger.error(f"Failed to get embedding statistics: {e}")
            return {}
