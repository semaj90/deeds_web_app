"""
Qdrant Vector Store Integration

Provides ANN search for semantic retrieval using Qdrant.
Integrated with existing vector store infrastructure.

Usage:
    client = QdrantClient()
    client.create_collection("embeddings", 768)
    results = client.search(query_embedding, top_k=20)
"""

import logging
from typing import List, Dict, Optional, Tuple
import os

try:
    from qdrant_client import QdrantClient as QdrantClientLib
    from qdrant_client.http import models
except ImportError:
    QdrantClientLib = None
    models = None

logger = logging.getLogger(__name__)


class QdrantClient:
    """Qdrant vector store client"""

    def __init__(
        self,
        url: str = "http://localhost:6333",
        api_key: Optional[str] = None,
        timeout: int = 30,
    ):
        """
        Initialize Qdrant client.

        Args:
            url: Qdrant server URL
            api_key: API key (optional)
            timeout: Request timeout in seconds
        """
        self.url = url
        self.api_key = api_key
        self.timeout = timeout
        self.client: Optional[QdrantClientLib] = None

        self._connect()

    def _connect(self) -> None:
        """Connect to Qdrant."""
        if QdrantClientLib is None:
            logger.warning("qdrant-client not installed, vector search disabled")
            return

        try:
            self.client = QdrantClientLib(
                url=self.url,
                api_key=self.api_key,
                timeout=self.timeout,
            )

            # Test connection
            self.client.get_collections()
            logger.info(f"Connected to Qdrant at {self.url}")

        except Exception as e:
            logger.error(f"Failed to connect to Qdrant: {e}")
            self.client = None

    def create_collection(
        self,
        collection_name: str,
        vector_size: int = 768,
        distance: str = "Cosine",
    ) -> bool:
        """
        Create a collection.

        Args:
            collection_name: Collection name
            vector_size: Vector dimensionality
            distance: Distance metric (Cosine, Euclid, Manhattan)

        Returns:
            True if successful, False otherwise
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return False

        try:
            # Check if collection exists
            try:
                self.client.get_collection(collection_name)
                logger.info(f"Collection {collection_name} already exists")
                return True
            except Exception:
                pass

            # Create collection
            self.client.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=vector_size,
                    distance=models.Distance[distance],
                ),
            )

            logger.info(f"Created collection {collection_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to create collection: {e}")
            return False

    def upsert_vectors(
        self,
        collection_name: str,
        vectors: List[List[float]],
        ids: List[int],
        payloads: Optional[List[Dict]] = None,
    ) -> bool:
        """
        Upsert vectors into collection.

        Args:
            collection_name: Collection name
            vectors: List of vectors
            ids: Vector IDs
            payloads: Optional metadata

        Returns:
            True if successful, False otherwise
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return False

        try:
            if payloads is None:
                payloads = [{} for _ in vectors]

            points = [
                models.PointStruct(
                    id=id_,
                    vector=vector,
                    payload=payload,
                )
                for id_, vector, payload in zip(ids, vectors, payloads)
            ]

            self.client.upsert(
                collection_name=collection_name,
                points=points,
            )

            logger.info(f"Upserted {len(vectors)} vectors into {collection_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to upsert vectors: {e}")
            return False

    def search(
        self,
        collection_name: str,
        query_vector: List[float],
        top_k: int = 20,
        score_threshold: Optional[float] = None,
    ) -> List[Dict]:
        """
        Search for similar vectors.

        Args:
            collection_name: Collection name
            query_vector: Query vector
            top_k: Number of results
            score_threshold: Minimum score threshold

        Returns:
            List of search results
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return []

        try:
            results = self.client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                limit=top_k,
                score_threshold=score_threshold,
            )

            search_results = []
            for result in results:
                search_results.append(
                    {
                        "id": result.id,
                        "score": result.score,
                        "payload": result.payload,
                    }
                )

            logger.debug(f"Search returned {len(search_results)} results")
            return search_results

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    def batch_search(
        self,
        collection_name: str,
        query_vectors: List[List[float]],
        top_k: int = 20,
    ) -> List[List[Dict]]:
        """
        Batch search for multiple queries.

        Args:
            collection_name: Collection name
            query_vectors: List of query vectors
            top_k: Number of results per query

        Returns:
            List of search result lists
        """
        batch_results = []
        for query_vector in query_vectors:
            results = self.search(collection_name, query_vector, top_k)
            batch_results.append(results)

        return batch_results

    def delete_collection(self, collection_name: str) -> bool:
        """
        Delete a collection.

        Args:
            collection_name: Collection name

        Returns:
            True if successful, False otherwise
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return False

        try:
            self.client.delete_collection(collection_name)
            logger.info(f"Deleted collection {collection_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete collection: {e}")
            return False

    def get_collection_info(self, collection_name: str) -> Optional[Dict]:
        """
        Get collection information.

        Args:
            collection_name: Collection name

        Returns:
            Collection info or None
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return None

        try:
            collection = self.client.get_collection(collection_name)
            return {
                "name": collection.name,
                "vectors_count": collection.vectors_count,
                "points_count": collection.points_count,
            }

        except Exception as e:
            logger.error(f"Failed to get collection info: {e}")
            return None

    def list_collections(self) -> List[str]:
        """
        List all collections.

        Returns:
            List of collection names
        """
        if self.client is None:
            logger.warning("Qdrant not connected")
            return []

        try:
            collections = self.client.get_collections()
            return [c.name for c in collections.collections]

        except Exception as e:
            logger.error(f"Failed to list collections: {e}")
            return []

    def close(self) -> None:
        """Close connection."""
        if self.client:
            logger.info("Closed Qdrant connection")


# Convenience functions

def search(
    collection_name: str,
    query_vector: List[float],
    top_k: int = 20,
) -> List[Dict]:
    """Search (convenience function)."""
    client = QdrantClient()
    results = client.search(collection_name, query_vector, top_k)
    client.close()
    return results


if __name__ == "__main__":
    # Example usage
    logging.basicConfig(level=logging.INFO)

    import numpy as np

    client = QdrantClient()

    # Create collection
    success = client.create_collection("test_embeddings", 768)
    print(f"Create collection: {success}")

    # Upsert vectors
    vectors = [np.random.randn(768).tolist() for _ in range(10)]
    ids = list(range(10))
    payloads = [{"index": i} for i in range(10)]

    success = client.upsert_vectors("test_embeddings", vectors, ids, payloads)
    print(f"Upsert vectors: {success}")

    # Search
    query = np.random.randn(768).tolist()
    results = client.search("test_embeddings", query, top_k=5)
    print(f"Search results: {len(results)}")
    for result in results:
        print(f"  ID: {result['id']}, Score: {result['score']:.3f}")

    # Get collection info
    info = client.get_collection_info("test_embeddings")
    print(f"Collection info: {info}")

    client.close()
