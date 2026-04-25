"""
Self-Organizing Map (SOM) Fallback Clustering Engine

Implements SOM for unsupervised clustering when semantic recall is weak.
Maps queries to nearest SOM nodes and returns cluster neighbors.

Usage:
    som = SOMEngine(grid_size=10)
    som.train(embeddings)
    neighbors = som.get_cluster_neighbors(query_embedding)
"""

import logging
import numpy as np
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import time

logger = logging.getLogger(__name__)


@dataclass
class SOMNode:
    """Self-organizing map node"""

    node_id: int
    weights: np.ndarray
    activation_count: int
    last_activated: float


class SOMEngine:
    """Self-Organizing Map for fallback clustering"""

    def __init__(self, grid_size: int = 10, embedding_dim: int = 768, learning_rate: float = 0.5):
        """
        Initialize SOM engine.

        Args:
            grid_size: Size of SOM grid (grid_size x grid_size)
            embedding_dim: Dimension of embeddings
            learning_rate: Initial learning rate
        """
        self.grid_size = grid_size
        self.embedding_dim = embedding_dim
        self.learning_rate = learning_rate
        self.num_nodes = grid_size * grid_size

        # Initialize SOM nodes with random weights
        self.nodes: List[SOMNode] = []
        for i in range(self.num_nodes):
            weights = np.random.randn(embedding_dim) * 0.1
            self.nodes.append(
                SOMNode(
                    node_id=i,
                    weights=weights,
                    activation_count=0,
                    last_activated=0.0,
                )
            )

        # Neighborhood function parameters
        self.sigma = grid_size / 2.0
        self.sigma_decay = 0.99

        logger.info(f"SOMEngine initialized (grid={grid_size}x{grid_size}, dim={embedding_dim})")

    def train(self, embeddings: np.ndarray, epochs: int = 10, batch_size: int = 32) -> None:
        """
        Train SOM using competitive learning.

        Args:
            embeddings: Training embeddings (N x embedding_dim)
            epochs: Number of training epochs
            batch_size: Batch size for training
        """
        try:
            N = embeddings.shape[0]
            logger.info(f"Training SOM on {N} embeddings ({epochs} epochs)")

            for epoch in range(epochs):
                # Shuffle embeddings
                indices = np.random.permutation(N)
                shuffled = embeddings[indices]

                # Process batches
                for batch_start in range(0, N, batch_size):
                    batch_end = min(batch_start + batch_size, N)
                    batch = shuffled[batch_start:batch_end]

                    # Train on batch
                    for embedding in batch:
                        self._train_step(embedding, epoch, epochs)

                # Decay learning rate and neighborhood
                self.learning_rate *= 0.95
                self.sigma *= self.sigma_decay

                logger.debug(f"Epoch {epoch + 1}/{epochs} completed")

            logger.info("SOM training completed")

        except Exception as e:
            logger.error(f"SOM training failed: {e}")

    def _train_step(self, embedding: np.ndarray, epoch: int, total_epochs: int) -> None:
        """Single training step"""
        # Find best matching unit (BMU)
        bmu_idx = self._find_bmu(embedding)

        # Update weights in neighborhood
        for i, node in enumerate(self.nodes):
            distance = self._grid_distance(bmu_idx, i)
            neighborhood = np.exp(-(distance**2) / (2 * self.sigma**2))

            # Update weight
            delta = self.learning_rate * neighborhood * (embedding - node.weights)
            node.weights += delta

    def _find_bmu(self, embedding: np.ndarray) -> int:
        """Find best matching unit (BMU) for embedding"""
        distances = np.array([np.linalg.norm(embedding - node.weights) for node in self.nodes])
        return int(np.argmin(distances))

    def _grid_distance(self, idx1: int, idx2: int) -> float:
        """Compute grid distance between two nodes"""
        row1, col1 = divmod(idx1, self.grid_size)
        row2, col2 = divmod(idx2, self.grid_size)

        return np.sqrt((row1 - row2) ** 2 + (col1 - col2) ** 2)

    def get_cluster_neighbors(
        self, query_embedding: np.ndarray, k: int = 5, radius: int = 2
    ) -> List[Dict]:
        """
        Get cluster neighbors for query embedding.

        Args:
            query_embedding: Query embedding vector
            k: Number of neighbors to return
            radius: Neighborhood radius in grid

        Returns:
            List of neighbor nodes with distances
        """
        try:
            start_time = time.time()

            # Find BMU
            bmu_idx = self._find_bmu(query_embedding)
            bmu_node = self.nodes[bmu_idx]

            # Update activation
            bmu_node.activation_count += 1
            bmu_node.last_activated = time.time()

            # Get neighbors within radius
            neighbors = []
            bmu_row, bmu_col = divmod(bmu_idx, self.grid_size)

            for i, node in enumerate(self.nodes):
                node_row, node_col = divmod(i, self.grid_size)

                # Check if within radius
                if (
                    abs(node_row - bmu_row) <= radius
                    and abs(node_col - bmu_col) <= radius
                ):
                    distance = np.linalg.norm(query_embedding - node.weights)
                    neighbors.append(
                        {
                            "node_id": i,
                            "distance": float(distance),
                            "activation_count": node.activation_count,
                            "weights": node.weights.tolist(),
                        }
                    )

            # Sort by distance
            neighbors.sort(key=lambda x: x["distance"])

            # Return top-k
            result = neighbors[:k]

            elapsed_ms = int((time.time() - start_time) * 1000)
            logger.debug(f"Found {len(result)} neighbors in {elapsed_ms}ms")

            return result

        except Exception as e:
            logger.error(f"Getting cluster neighbors failed: {e}")
            return []

    def get_activation_map(self) -> np.ndarray:
        """Get activation count map for visualization"""
        activation_map = np.zeros((self.grid_size, self.grid_size))

        for i, node in enumerate(self.nodes):
            row, col = divmod(i, self.grid_size)
            activation_map[row, col] = node.activation_count

        return activation_map

    def get_weight_map(self, dimension: int = 0) -> np.ndarray:
        """Get weight map for specific dimension"""
        weight_map = np.zeros((self.grid_size, self.grid_size))

        for i, node in enumerate(self.nodes):
            row, col = divmod(i, self.grid_size)
            if dimension < len(node.weights):
                weight_map[row, col] = node.weights[dimension]

        return weight_map

    def quantize(self, embeddings: np.ndarray) -> np.ndarray:
        """
        Quantize embeddings to nearest SOM nodes.

        Args:
            embeddings: Input embeddings (N x embedding_dim)

        Returns:
            Quantized embeddings (N x embedding_dim)
        """
        try:
            quantized = np.zeros_like(embeddings)

            for i, embedding in enumerate(embeddings):
                bmu_idx = self._find_bmu(embedding)
                quantized[i] = self.nodes[bmu_idx].weights

            logger.debug(f"Quantized {len(embeddings)} embeddings")
            return quantized

        except Exception as e:
            logger.error(f"Quantization failed: {e}")
            return embeddings

    def get_stats(self) -> Dict:
        """Get SOM statistics"""
        activation_counts = [node.activation_count for node in self.nodes]

        return {
            "grid_size": self.grid_size,
            "num_nodes": self.num_nodes,
            "embedding_dim": self.embedding_dim,
            "total_activations": sum(activation_counts),
            "avg_activations": np.mean(activation_counts),
            "max_activations": max(activation_counts) if activation_counts else 0,
            "learning_rate": float(self.learning_rate),
            "sigma": float(self.sigma),
        }

    def reset_activations(self) -> None:
        """Reset activation counts"""
        for node in self.nodes:
            node.activation_count = 0
            node.last_activated = 0.0

        logger.info("Reset SOM activations")


# Singleton instance
_som_engine = None


def get_som_engine() -> SOMEngine:
    """Get or create singleton SOM engine"""
    global _som_engine
    if _som_engine is None:
        _som_engine = SOMEngine()
    return _som_engine
