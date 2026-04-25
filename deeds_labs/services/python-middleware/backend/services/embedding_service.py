#!/usr/bin/env python3
"""
Centralized Embedding Service
- Single source of truth for all embeddings via Ollama
- No HF models loaded in-process
- Supports both single and batch operations
- Used by all workers: ingest_pdf_worker, chr97_image_processor, etc.
"""

import os
import requests
import numpy as np
from typing import List, Union
import logging

logger = logging.getLogger(__name__)

# Configuration
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "60"))


class EmbeddingService:
    """
    Centralized embedding service using Ollama.
    All workers call this instead of loading HF models locally.
    """

    def __init__(self, url: str = OLLAMA_URL, model: str = OLLAMA_EMBED_MODEL):
        self.url = url
        self.model = model
        self.timeout = OLLAMA_TIMEOUT
        logger.info(f"🧠 EmbeddingService initialized: {model} @ {url}")

    def embed_one(self, text: str) -> np.ndarray:
        """
        Embed a single text string.
        Returns: (768,) float32 array
        """
        try:
            resp = requests.post(
                f"{self.url}/api/embeddings",
                json={"model": self.model, "prompt": text},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()

            # Handle both 'embedding' and 'embeddings' keys
            if "embedding" in data:
                vec = data["embedding"]
            elif "embeddings" in data:
                vec = data["embeddings"][0] if data["embeddings"] else None
            else:
                raise RuntimeError(
                    f"Unexpected Ollama response keys: {list(data.keys())}"
                )

            if vec is None:
                raise RuntimeError("Ollama returned empty embedding")

            return np.array(vec, dtype=np.float32)
        except Exception as e:
            logger.error(f"❌ Embedding failed for text: {text[:50]}... Error: {e}")
            raise

    def embed_batch(self, texts: List[str], batch_size: int = 32) -> np.ndarray:
        """
        Embed multiple texts in batches.
        Returns: (N, 768) float32 array
        """
        embeddings = []
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            try:
                resp = requests.post(
                    f"{self.url}/api/embeddings",
                    json={"model": self.model, "input": batch},
                    timeout=self.timeout,
                )
                resp.raise_for_status()
                data = resp.json()

                if "embeddings" in data:
                    batch_embeddings = data["embeddings"]
                else:
                    raise RuntimeError(
                        f"Unexpected Ollama response keys: {list(data.keys())}"
                    )

                embeddings.extend(batch_embeddings)
                logger.info(
                    f"   ✓ Embedded {min(i + batch_size, len(texts))}/{len(texts)}"
                )
            except Exception as e:
                logger.error(f"❌ Batch embedding failed: {e}")
                raise

        return np.array(embeddings, dtype=np.float32)

    def health_check(self) -> bool:
        """
        Check if Ollama is running and model is available.
        """
        try:
            resp = requests.get(f"{self.url}/api/tags", timeout=5)
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            if self.model in models or any(self.model.split(":")[0] in m for m in models):
                logger.info(f"✅ Ollama health check passed: {self.model} available")
                return True
            else:
                logger.warning(
                    f"⚠️  Model {self.model} not found. Available: {models}"
                )
                return False
        except Exception as e:
            logger.error(f"❌ Ollama health check failed: {e}")
            return False


# Singleton instance
_embedding_service = None


def get_embedding_service() -> EmbeddingService:
    """
    Get or create the singleton embedding service.
    """
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


# Convenience functions
def embed_one(text: str) -> np.ndarray:
    """Embed a single text."""
    return get_embedding_service().embed_one(text)


def embed_batch(texts: List[str], batch_size: int = 32) -> np.ndarray:
    """Embed multiple texts."""
    return get_embedding_service().embed_batch(texts, batch_size)


def health_check() -> bool:
    """Check Ollama health."""
    return get_embedding_service().health_check()


if __name__ == "__main__":
    # Test the service
    logging.basicConfig(level=logging.INFO)

    service = get_embedding_service()

    if not service.health_check():
        print("❌ Ollama is not running or model is not available")
        exit(1)

    # Test single embedding
    test_text = "The Supremacy Clause establishes federal law as the supreme law of the land."
    vec = service.embed_one(test_text)
    print(f"✅ Single embedding: {vec.shape}")

    # Test batch embedding
    test_texts = [
        "Preemption doctrine prevents state laws from conflicting with federal law.",
        "Intergovernmental immunity protects federal operations from state regulation.",
        "The DOJ challenged California's A.B. 32 private detention facility ban.",
    ]
    vecs = service.embed_batch(test_texts)
    print(f"✅ Batch embeddings: {vecs.shape}")
