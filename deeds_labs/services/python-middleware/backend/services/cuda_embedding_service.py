#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - CUDA Embedding Service
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: GPU-accelerated embedding generation and similarity computation
Task: 7.1 - Create CUDA embedding service
Task: 7.2 - Create similarity computation
Task: 7.3 - Create coordinate computation
═══════════════════════════════════════════════════════════════════════
"""

import os
import logging
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import numpy as np
import aiohttp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import CUDA libraries
try:
    import torch
    TORCH_AVAILABLE = True
    CUDA_AVAILABLE = torch.cuda.is_available()
    if CUDA_AVAILABLE:
        DEVICE = torch.device("cuda")
        logger.info(f"🚀 CUDA available: {torch.cuda.get_device_name(0)}")
    else:
        DEVICE = torch.device("cpu")
        logger.info("⚠️ CUDA not available, using CPU")
except ImportError:
    TORCH_AVAILABLE = False
    CUDA_AVAILABLE = False
    DEVICE = None
    logger.warning("⚠️ PyTorch not installed, using Ollama API only")


@dataclass
class EmbeddingResult:
    """Result of embedding generation."""
    text: str
    embedding: List[float]
    dimension: int
    model: str
    cuda_used: bool
    generation_time_ms: float


@dataclass
class SimilarityResult:
    """Result of similarity computation."""
    id1: str
    id2: str
    similarity: float
    cuda_used: bool


@dataclass
class CoordinateResult:
    """Result of coordinate computation (3D projection)."""
    id: str
    x: float
    y: float
    z: float
    method: str  # 'umap', 'tsne', 'pca'


class CUDAEmbeddingService:
    """
    CUDA Embedding Service - GPU-accelerated embeddings and similarity.

    Features:
    - Batch embedding generation via Ollama
    - GPU-accelerated cosine similarity
    - Dimensionality reduction for 3D visualization
    - Memory-efficient batch processing
    """

    OLLAMA_URL = "http://localhost:11434"
    EMBEDDING_MODEL = "embeddinggemma:latest"
    EMBEDDING_DIM = 768
    BATCH_SIZE = 32  # Process embeddings in batches

    def __init__(self, ollama_url: Optional[str] = None):
        """Initialize CUDA embedding service."""
        self.ollama_url = ollama_url or os.getenv("OLLAMA_URL", self.OLLAMA_URL)
        self.embedding_cache: Dict[str, List[float]] = {}

        if CUDA_AVAILABLE:
            logger.info(f"🚀 CUDAEmbeddingService initialized with GPU: {torch.cuda.get_device_name(0)}")
            logger.info(f"   GPU Memory: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
        else:
            logger.info("⚠️ CUDAEmbeddingService initialized (CPU mode)")

    async def generate_embedding(self, text: str, use_cache: bool = True) -> EmbeddingResult:
        """
        Generate embedding for text using Ollama.

        Args:
            text: Text to embed
            use_cache: Whether to use cached embeddings

        Returns:
            EmbeddingResult with embedding vector
        """
        import time
        start_time = time.time()

        # Check cache
        cache_key = hash(text)
        if use_cache and cache_key in self.embedding_cache:
            embedding = self.embedding_cache[cache_key]
            return EmbeddingResult(
                text=text[:100],
                embedding=embedding,
                dimension=len(embedding),
                model=self.EMBEDDING_MODEL,
                cuda_used=False,
                generation_time_ms=0.0
            )

        # Generate via Ollama
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.ollama_url}/api/embeddings",
                json={"model": self.EMBEDDING_MODEL, "prompt": text},
                timeout=aiohttp.ClientTimeout(total=60)
            ) as response:
                if response.status != 200:
                    raise Exception(f"Embedding API error: {await response.text()}")
                data = await response.json()
                embedding = data.get("embedding", [])

        # Cache result
        if use_cache:
            self.embedding_cache[cache_key] = embedding

        generation_time = (time.time() - start_time) * 1000

        return EmbeddingResult(
            text=text[:100],
            embedding=embedding,
            dimension=len(embedding),
            model=self.EMBEDDING_MODEL,
            cuda_used=False,  # Ollama handles GPU internally
            generation_time_ms=generation_time
        )

    async def generate_batch_embeddings(
        self,
        texts: List[str],
        batch_size: Optional[int] = None
    ) -> List[EmbeddingResult]:
        """
        Generate embeddings for multiple texts in batches.

        Args:
            texts: List of texts to embed
            batch_size: Batch size (default: 32)

        Returns:
            List of EmbeddingResult objects
        """
        batch_size = batch_size or self.BATCH_SIZE
        results = []

        logger.info(f"🧮 Generating {len(texts)} embeddings in batches of {batch_size}")

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            batch_results = await asyncio.gather(*[
                self.generate_embedding(text) for text in batch
            ])
            results.extend(batch_results)
            logger.info(f"  Batch {i // batch_size + 1}: {len(batch)} embeddings")

        return results

    def compute_cosine_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float]
    ) -> float:
        """
        Compute cosine similarity between two embeddings.
        Uses GPU if available.

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity score (0-1)
        """
        if CUDA_AVAILABLE and TORCH_AVAILABLE:
            # GPU computation
            t1 = torch.tensor(embedding1, device=DEVICE)
            t2 = torch.tensor(embedding2, device=DEVICE)
            similarity = torch.nn.functional.cosine_similarity(
                t1.unsqueeze(0), t2.unsqueeze(0)
            ).item()
        else:
            # CPU computation with numpy
            e1 = np.array(embedding1)
            e2 = np.array(embedding2)
            similarity = np.dot(e1, e2) / (np.linalg.norm(e1) * np.linalg.norm(e2))

        return float(similarity)

    def compute_similarity_matrix(
        self,
        embeddings: List[List[float]],
        ids: Optional[List[str]] = None
    ) -> Tuple[np.ndarray, List[SimilarityResult]]:
        """
        Compute pairwise similarity matrix for all embeddings.
        Uses GPU for batch computation.

        Args:
            embeddings: List of embedding vectors
            ids: Optional list of IDs for each embedding

        Returns:
            Tuple of (similarity matrix, list of SimilarityResult)
        """
        n = len(embeddings)
        ids = ids or [str(i) for i in range(n)]

        logger.info(f"🧮 Computing {n}x{n} similarity matrix")

        if CUDA_AVAILABLE and TORCH_AVAILABLE:
            # GPU batch computation
            tensor = torch.tensor(embeddings, device=DEVICE)
            # Normalize
            tensor = tensor / tensor.norm(dim=1, keepdim=True)
            # Compute similarity matrix
            sim_matrix = torch.mm(tensor, tensor.t()).cpu().numpy()
            cuda_used = True
        else:
            # CPU computation
            arr = np.array(embeddings)
            # Normalize
            norms = np.linalg.norm(arr, axis=1, keepdims=True)
            arr = arr / norms
            # Compute similarity matrix
            sim_matrix = np.dot(arr, arr.T)
            cuda_used = False

        # Convert to SimilarityResult list (upper triangle only)
        results = []
        for i in range(n):
            for j in range(i + 1, n):
                results.append(SimilarityResult(
                    id1=ids[i],
                    id2=ids[j],
                    similarity=float(sim_matrix[i, j]),
                    cuda_used=cuda_used
                ))

        logger.info(f"  ✓ Matrix computed ({len(results)} pairs, CUDA={cuda_used})")
        return sim_matrix, results

    def compute_3d_coordinates(
        self,
        embeddings: List[List[float]],
        ids: List[str],
        method: str = "pca"
    ) -> List[CoordinateResult]:
        """
        Compute 3D coordinates for visualization using dimensionality reduction.

        Args:
            embeddings: List of embedding vectors
            ids: List of IDs for each embedding
            method: Reduction method ('pca', 'tsne', 'umap')

        Returns:
            List of CoordinateResult with x, y, z coordinates
        """
        from sklearn.decomposition import PCA

        logger.info(f"🗺️ Computing 3D coordinates using {method.upper()}")

        arr = np.array(embeddings)

        if method == "pca":
            reducer = PCA(n_components=3)
            coords = reducer.fit_transform(arr)
        elif method == "tsne":
            from sklearn.manifold import TSNE
            reducer = TSNE(n_components=3, perplexity=min(30, len(embeddings) - 1))
            coords = reducer.fit_transform(arr)
        elif method == "umap":
            try:
                import umap
                reducer = umap.UMAP(n_components=3, n_neighbors=min(15, len(embeddings) - 1))
                coords = reducer.fit_transform(arr)
            except ImportError:
                logger.warning("UMAP not installed, falling back to PCA")
                reducer = PCA(n_components=3)
                coords = reducer.fit_transform(arr)
        else:
            raise ValueError(f"Unknown method: {method}")

        # Normalize to [-1, 1] range
        coords = (coords - coords.min(axis=0)) / (coords.max(axis=0) - coords.min(axis=0) + 1e-8)
        coords = coords * 2 - 1

        results = []
        for i, (id_, coord) in enumerate(zip(ids, coords)):
            results.append(CoordinateResult(
                id=id_,
                x=float(coord[0]),
                y=float(coord[1]),
                z=float(coord[2]),
                method=method
            ))

        logger.info(f"  ✓ {len(results)} coordinates computed")
        return results

    def get_gpu_memory_info(self) -> Dict[str, Any]:
        """Get GPU memory information."""
        if not CUDA_AVAILABLE:
            return {"cuda_available": False}

        return {
            "cuda_available": True,
            "device_name": torch.cuda.get_device_name(0),
            "total_memory_gb": torch.cuda.get_device_properties(0).total_memory / 1e9,
            "allocated_memory_gb": torch.cuda.memory_allocated(0) / 1e9,
            "cached_memory_gb": torch.cuda.memory_reserved(0) / 1e9,
        }

    def clear_cache(self):
        """Clear embedding cache and GPU memory."""
        self.embedding_cache.clear()
        if CUDA_AVAILABLE:
            torch.cuda.empty_cache()
        logger.info("🧹 Cache cleared")


# Example usage
async def example_usage():
    """Example of using the CUDAEmbeddingService."""
    service = CUDAEmbeddingService()

    # Generate single embedding
    result = await service.generate_embedding("Hello, world!")
    print(f"\n✅ Single embedding:")
    print(f"   Dimension: {result.dimension}")
    print(f"   Time: {result.generation_time_ms:.1f}ms")

    # Generate batch embeddings
    texts = ["First text", "Second text", "Third text"]
    results = await service.generate_batch_embeddings(texts)
    print(f"\n✅ Batch embeddings: {len(results)}")

    # Compute similarity
    sim = service.compute_cosine_similarity(
        results[0].embedding,
        results[1].embedding
    )
    print(f"\n✅ Similarity: {sim:.4f}")

    # Compute 3D coordinates
    embeddings = [r.embedding for r in results]
    ids = [f"text_{i}" for i in range(len(texts))]
    coords = service.compute_3d_coordinates(embeddings, ids, method="pca")
    print(f"\n✅ 3D Coordinates:")
    for c in coords:
        print(f"   {c.id}: ({c.x:.3f}, {c.y:.3f}, {c.z:.3f})")

    # GPU info
    gpu_info = service.get_gpu_memory_info()
    print(f"\n✅ GPU Info: {gpu_info}")


if __name__ == "__main__":
    asyncio.run(example_usage())
