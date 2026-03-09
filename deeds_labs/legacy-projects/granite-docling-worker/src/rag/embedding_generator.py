"""
Semantic embedding generation for legal documents.

Generates embeddings using LegalBERT or similar legal-domain models.
"""

import logging
import numpy as np
from typing import List, Dict, Optional, Tuple
import os

logger = logging.getLogger(__name__)


class EmbeddingGenerator:
    """
    Semantic embedding generator for document chunks.

    Uses legal-domain models (LegalBERT) for embedding generation.
    """

    # Default embedding model
    DEFAULT_MODEL = "nlpaueb/legal-bert-base-uncased"
    EMBEDDING_DIM = 768  # LegalBERT embedding dimension

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL,
        batch_size: int = 32,
        device: str = "cpu",
    ):
        """
        Initialize embedding generator.

        Args:
            model_name: HuggingFace model name
            batch_size: Batch size for embedding generation
            device: Device to use ('cpu' or 'cuda')
        """
        self.model_name = model_name
        self.batch_size = batch_size
        self.device = device
        self.model = None
        self.tokenizer = None

        self._load_model()

    def _load_model(self) -> None:
        """Load embedding model and tokenizer."""
        try:
            from transformers import AutoTokenizer, AutoModel

            logger.info(f"Loading embedding model: {self.model_name}")

            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
            self.model = AutoModel.from_pretrained(self.model_name)

            if self.device == "cuda":
                self.model = self.model.cuda()

            self.model.eval()
            logger.info(f"Loaded embedding model on device: {self.device}")

        except ImportError:
            logger.warning("transformers not installed, using mock embeddings")
            self.model = None
            self.tokenizer = None
        except Exception as e:
            logger.error(f"Error loading embedding model: {e}")
            self.model = None
            self.tokenizer = None

    def generate_embeddings(
        self,
        texts: List[str],
        show_progress: bool = False,
    ) -> List[np.ndarray]:
        """
        Generate embeddings for texts.

        Args:
            texts: List of texts to embed
            show_progress: Whether to show progress

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        if self.model is None:
            logger.warning("Model not loaded, using mock embeddings")
            return self._generate_mock_embeddings(texts)

        embeddings = []

        # Process in batches
        for i in range(0, len(texts), self.batch_size):
            batch_texts = texts[i:i + self.batch_size]
            batch_embeddings = self._embed_batch(batch_texts)
            embeddings.extend(batch_embeddings)

            if show_progress:
                logger.info(f"Generated embeddings for {min(i + self.batch_size, len(texts))}/{len(texts)}")

        return embeddings

    def _embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Embed a batch of texts."""
        try:
            import torch

            # Tokenize
            encoded = self.tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )

            if self.device == "cuda":
                encoded = {k: v.cuda() for k, v in encoded.items()}

            # Generate embeddings
            with torch.no_grad():
                outputs = self.model(**encoded)
                embeddings = outputs.last_hidden_state[:, 0, :]  # Use [CLS] token

            # Convert to numpy
            embeddings = embeddings.cpu().numpy()

            return [emb for emb in embeddings]

        except Exception as e:
            logger.error(f"Error embedding batch: {e}")
            return self._generate_mock_embeddings(texts)

    def _generate_mock_embeddings(self, texts: List[str]) -> List[np.ndarray]:
        """Generate mock embeddings (for testing)."""
        embeddings = []
        for text in texts:
            # Simple hash-based mock embedding
            hash_val = hash(text) % 1000
            emb = np.random.RandomState(hash_val).randn(self.EMBEDDING_DIM).astype(np.float32)
            # Normalize
            emb = emb / np.linalg.norm(emb)
            embeddings.append(emb)
        return embeddings

    def embed_chunk(self, chunk_content: str) -> np.ndarray:
        """
        Embed a single chunk.

        Args:
            chunk_content: Chunk text

        Returns:
            Embedding vector
        """
        embeddings = self.generate_embeddings([chunk_content])
        return embeddings[0] if embeddings else np.zeros(self.EMBEDDING_DIM)

    def embed_chunks(
        self,
        chunks: List[Dict],
        show_progress: bool = False,
    ) -> List[Tuple[str, np.ndarray]]:
        """
        Embed multiple chunks.

        Args:
            chunks: List of chunk dicts with 'id' and 'content' keys
            show_progress: Whether to show progress

        Returns:
            List of (chunk_id, embedding) tuples
        """
        texts = [chunk['content'] for chunk in chunks]
        embeddings = self.generate_embeddings(texts, show_progress)

        return [
            (chunk['id'], emb)
            for chunk, emb in zip(chunks, embeddings)
        ]

    def similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two embeddings.

        Args:
            emb1: First embedding
            emb2: Second embedding

        Returns:
            Similarity score (0-1)
        """
        # Normalize
        emb1 = emb1 / (np.linalg.norm(emb1) + 1e-8)
        emb2 = emb2 / (np.linalg.norm(emb2) + 1e-8)

        # Cosine similarity
        similarity = np.dot(emb1, emb2)
        return float(similarity)

    def find_similar(
        self,
        query_embedding: np.ndarray,
        embeddings: List[Tuple[str, np.ndarray]],
        top_k: int = 10,
        threshold: float = 0.5,
    ) -> List[Tuple[str, float]]:
        """
        Find similar embeddings to query.

        Args:
            query_embedding: Query embedding
            embeddings: List of (id, embedding) tuples
            top_k: Number of top results
            threshold: Minimum similarity threshold

        Returns:
            List of (id, similarity) tuples
        """
        similarities = []

        for emb_id, emb in embeddings:
            sim = self.similarity(query_embedding, emb)
            if sim >= threshold:
                similarities.append((emb_id, sim))

        # Sort by similarity descending
        similarities.sort(key=lambda x: x[1], reverse=True)

        return similarities[:top_k]

    def get_model_info(self) -> Dict:
        """Get model information."""
        return {
            'model_name': self.model_name,
            'embedding_dim': self.EMBEDDING_DIM,
            'device': self.device,
            'batch_size': self.batch_size,
            'model_loaded': self.model is not None,
        }
