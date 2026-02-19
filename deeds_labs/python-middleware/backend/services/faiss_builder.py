"""
FAISS Index Builder

Builds and manages FAISS indices for approximate nearest neighbor search.
Supports fast ANN search with configurable parameters.

Usage:
    builder = FAISSBuilder()
    index = builder.build_index(embeddings)
    results = builder.search(index, query, k=20)
"""

import logging
from typing import List, Tuple, Optional, Dict
import numpy as np
import os

try:
    import faiss
except ImportError:
    faiss = None

logger = logging.getLogger(__name__)


class FAISSBuilder:
    """FAISS index builder and searcher"""

    def __init__(self, index_type: str = "IVF", nprobe: int = 10):
        """
        Initialize FAISS builder.

        Args:
            index_type: Index type (IVF, HNSW, Flat)
            nprobe: Number of probes for IVF search
        """
        self.index_type = index_type
        self.nprobe = nprobe

        if faiss is None:
            logger.warning("faiss not installed, ANN search disabled")

    def build_index(
        self,
        embeddings: np.ndarray,
        n_clusters: int = 100,
    ) -> Optional[faiss.Index]:
        """
        Build FAISS index from embeddings.

        Args:
            embeddings: Embedding matrix (N × D)
            n_clusters: Number of clusters for IVF

        Returns:
            FAISS index or None
        """
        if faiss is None:
            logger.warning("faiss not installed")
            return None

        try:
            n_samples, dim = embeddings.shape

            if self.index_type == "IVF":
                # IVF (Inverted File) index
                quantizer = faiss.IndexFlatL2(dim)
                index = faiss.IndexIVFFlat(quantizer, dim, n_clusters)
                index.train(embeddings.astype(np.float32))
                index.add(embeddings.astype(np.float32))
                index.nprobe = self.nprobe

            elif self.index_type == "HNSW":
                # HNSW (Hierarchical Navigable Small World) index
                index = faiss.IndexHNSWFlat(dim, 32)
                index.add(embeddings.astype(np.float32))

            elif self.index_type == "Flat":
                # Flat (brute force) index
                index = faiss.IndexFlatL2(dim)
                index.add(embeddings.astype(np.float32))

            else:
                logger.error(f"Unknown index type: {self.index_type}")
                return None

            logger.info(f"Built {self.index_type} index with {n_samples} vectors")
            return index

        except Exception as e:
            logger.error(f"Failed to build index: {e}")
            return None

    def search(
        self,
        index: faiss.Index,
        query: np.ndarray,
        k: int = 20,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Search index.

        Args:
            index: FAISS index
            query: Query vector (D,) or (N × D)
            k: Number of results

        Returns:
            Tuple of (distances, indices)
        """
        if faiss is None:
            logger.warning("faiss not installed")
            return np.array([]), np.array([])

        try:
            # Ensure query is 2D
            if query.ndim == 1:
                query = query.reshape(1, -1)

            query = query.astype(np.float32)

            distances, indices = index.search(query, k)

            return distances, indices

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return np.array([]), np.array([])

    def batch_search(
        self,
        index: faiss.Index,
        queries: np.ndarray,
        k: int = 20,
    ) -> List[Tuple[np.ndarray, np.ndarray]]:
        """
        Batch search.

        Args:
            index: FAISS index
            queries: Query vectors (N × D)
            k: Number of results per query

        Returns:
            List of (distances, indices) tuples
        """
        batch_results = []

        for query in queries:
            distances, indices = self.search(index, query, k)
            batch_results.append((distances, indices))

        return batch_results

    def save_index(self, index: faiss.Index, filepath: str) -> bool:
        """
        Save index to file.

        Args:
            index: FAISS index
            filepath: Output file path

        Returns:
            True if successful, False otherwise
        """
        if faiss is None:
            logger.warning("faiss not installed")
            return False

        try:
            faiss.write_index(index, filepath)
            logger.info(f"Saved index to {filepath}")
            return True

        except Exception as e:
            logger.error(f"Failed to save index: {e}")
            return False

    def load_index(self, filepath: str) -> Optional[faiss.Index]:
        """
        Load index from file.

        Args:
            filepath: Input file path

        Returns:
            FAISS index or None
        """
        if faiss is None:
            logger.warning("faiss not installed")
            return None

        try:
            index = faiss.read_index(filepath)
            logger.info(f"Loaded index from {filepath}")
            return index

        except Exception as e:
            logger.error(f"Failed to load index: {e}")
            return None

    def get_index_info(self, index: faiss.Index) -> Dict:
        """
        Get index information.

        Args:
            index: FAISS index

        Returns:
            Index info dictionary
        """
        try:
            return {
                "ntotal": index.ntotal,
                "d": index.d,
                "index_type": type(index).__name__,
            }

        except Exception as e:
            logger.error(f"Failed to get index info: {e}")
            return {}

    def rerank_with_exact(
        self,
        embeddings: np.ndarray,
        query: np.ndarray,
        ann_indices: np.ndarray,
        k: int = 20,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Re-rank ANN results with exact similarity.

        Args:
            embeddings: All embeddings
            query: Query vector
            ann_indices: ANN result indices
            k: Number of final results

        Returns:
            Tuple of (distances, indices)
        """
        try:
            # Compute exact distances
            query_norm = np.linalg.norm(query)
            exact_distances = []

            for idx in ann_indices[0]:
                embedding = embeddings[idx]
                embedding_norm = np.linalg.norm(embedding)

                # Cosine distance
                similarity = np.dot(query, embedding) / (query_norm * embedding_norm + 1e-8)
                distance = 1.0 - similarity

                exact_distances.append(distance)

            exact_distances = np.array(exact_distances)

            # Sort by exact distance
            sorted_indices = np.argsort(exact_distances)[:k]
            sorted_distances = exact_distances[sorted_indices]

            # Map back to original indices
            final_indices = ann_indices[0][sorted_indices]

            return sorted_distances, final_indices

        except Exception as e:
            logger.error(f"Re-ranking failed: {e}")
            return np.array([]), np.array([])


# Convenience functions

def build_index(embeddings: np.ndarray, index_type: str = "IVF") -> Optional[faiss.Index]:
    """Build index (convenience function)."""
    builder = FAISSBuilder(index_type=index_type)
    return builder.build_index(embeddings)


def search_index(
    index: faiss.Index,
    query: np.ndarray,
    k: int = 20,
) -> Tuple[np.ndarray, np.ndarray]:
    """Search index (convenience function)."""
    builder = FAISSBuilder()
    return builder.search(index, query, k)


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    if faiss is None:
        print("FAISS not installed")
    else:
        # Create sample embeddings
        np.random.seed(42)
        embeddings = np.random.randn(1000, 768).astype(np.float32)

        builder = FAISSBuilder(index_type="IVF", nprobe=10)

        # Build index
        index = builder.build_index(embeddings, n_clusters=100)
        print(f"Index info: {builder.get_index_info(index)}")

        # Search
        query = np.random.randn(768).astype(np.float32)
        distances, indices = builder.search(index, query, k=10)

        print(f"Search results:")
        for i, (dist, idx) in enumerate(zip(distances[0], indices[0])):
            print(f"  {i}: ID={idx}, Distance={dist:.3f}")

        # Save/load
        builder.save_index(index, "test_index.faiss")
        loaded_index = builder.load_index("test_index.faiss")
        print(f"Loaded index: {builder.get_index_info(loaded_index)}")
