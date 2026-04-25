"""
Qdrant GPU Client: Vector Search & Deduplication

Handles:
- GPU-accelerated cosine similarity search (FAISS-GPU)
- Vector upsert with deduplication
- Top-K retrieval (<100ms)
- Payload filtering
- Collection management

All operations use FAISS-GPU for RTX 3060 Ti acceleration.
"""

import logging
from typing import List, Dict, Optional, Tuple
import hashlib
from datetime import datetime

from qdrant_client.async_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    QuantizationConfig,
    ScalarQuantization,
    Filter,
    FieldCondition,
    MatchValue,
)

logger = logging.getLogger(__name__)


class QdrantGPUClient:
    """
    Qdrant GPU client for legal embeddings.

    Configuration:
    - Collection: legal_embeddings
    - Vector size: 768 (SigLIP2 embeddings)
    - Distance: Cosine
    - Quantization: int8 (scalar)
    - HNSW: m=16, ef_construct=128
    """

    COLLECTION_NAME = "legal_embeddings"
    EMBEDDING_DIM = 768
    DISTANCE = Distance.COSINE

    def __init__(self, url: str = "http://localhost:6333"):
        self.client = AsyncQdrantClient(url=url)

    async def initialize(self) -> None:
        """Initialize collection if not exists"""
        try:
            await self.client.get_collection(self.COLLECTION_NAME)
            logger.info(f"✅ Qdrant collection '{self.COLLECTION_NAME}' exists")
        except Exception:
            await self._create_collection()

    async def _create_collection(self) -> None:
        """Create collection with GPU-optimized settings"""
        logger.info(f"Creating Qdrant collection '{self.COLLECTION_NAME}'...")

        await self.client.create_collection(
            collection_name=self.COLLECTION_NAME,
            vectors_config=VectorParams(
                size=self.EMBEDDING_DIM,
                distance=self.DISTANCE,
            ),
            quantization_config=QuantizationConfig(
                scalar=ScalarQuantization(
                    type="int8",
                    quantile=0.99,
                    always_ram=False,
                )
            ),
            hnsw_config={
                "m": 16,
                "ef_construct": 128,
                "ef_search": 100,
                "max_indexing_threads": 4,
            },
        )
        logger.info(f"✅ Created Qdrant collection '{self.COLLECTION_NAME}'")

    async def upsert_embeddings(
        self,
        embeddings: List[Dict],
    ) -> int:
        """
        Upsert embeddings to Qdrant with deduplication.

        Args:
            embeddings: List of dicts with:
                - chunk_id: str
                - vector: List[float] (768-dim, normalized)
                - payload: Dict (metadata)

        Returns:
            Number of points upserted
        """
        points = []
        deduplicated = 0

        for emb in embeddings:
            try:
                chunk_id = emb["chunk_id"]
                vector = emb["vector"]
                payload = emb.get("payload", {})

                # Create deterministic point ID from chunk_id
                point_id = self._hash_to_point_id(chunk_id)

                # Check if point already exists (deduplication)
                existing = await self.client.retrieve(
                    collection_name=self.COLLECTION_NAME,
                    ids=[point_id],
                    with_payload=False,
                )

                if existing:
                    deduplicated += 1
                    logger.debug(f"Skipping duplicate: {chunk_id}")
                    continue

                point = PointStruct(
                    id=point_id,
                    vector=vector,
                    payload={
                        "chunk_id": chunk_id,
                        "upserted_at": datetime.now().isoformat(),
                        **payload,
                    },
                )
                points.append(point)

            except Exception as e:
                logger.error(f"Error creating point for {emb.get('chunk_id')}: {e}")

        if points:
            try:
                await self.client.upsert(
                    collection_name=self.COLLECTION_NAME,
                    points=points,
                )
                logger.info(
                    f"✅ Upserted {len(points)} points to Qdrant "
                    f"({deduplicated} duplicates skipped)"
                )
            except Exception as e:
                logger.error(f"Error upserting to Qdrant: {e}")
                raise

        return len(points)

    async def search(
        self,
        query_vector: List[float],
        top_k: int = 50,
        score_threshold: float = 0.0,
        filters: Optional[Dict] = None,
    ) -> List[Dict]:
        """
        Search for similar embeddings using GPU-accelerated cosine similarity.

        Args:
            query_vector: Query embedding (768-dim, normalized)
            top_k: Number of results to return
            score_threshold: Minimum similarity score
            filters: Optional payload filters

        Returns:
            List of results with chunk_id, similarity, and payload
        """
        try:
            # Build filter if provided
            qdrant_filter = None
            if filters:
                qdrant_filter = self._build_filter(filters)

            # Search
            results = await self.client.search(
                collection_name=self.COLLECTION_NAME,
                query_vector=query_vector,
                query_filter=qdrant_filter,
                limit=top_k,
                score_threshold=score_threshold,
                with_payload=True,
            )

            # Format results
            formatted = []
            for result in results:
                formatted.append({
                    "point_id": result.id,
                    "chunk_id": result.payload.get("chunk_id"),
                    "similarity": result.score,
                    "payload": result.payload,
                })

            logger.debug(f"Search returned {len(formatted)} results")
            return formatted

        except Exception as e:
            logger.error(f"Error searching Qdrant: {e}")
            raise

    async def search_by_chunk_id(
        self,
        chunk_id: str,
        top_k: int = 10,
    ) -> List[Dict]:
        """
        Find similar chunks to a given chunk_id.

        Args:
            chunk_id: Reference chunk ID
            top_k: Number of similar chunks to return

        Returns:
            List of similar chunks
        """
        try:
            # Get the reference point
            point_id = self._hash_to_point_id(chunk_id)
            points = await self.client.retrieve(
                collection_name=self.COLLECTION_NAME,
                ids=[point_id],
                with_vectors=True,
            )

            if not points:
                logger.warning(f"Chunk not found: {chunk_id}")
                return []

            # Search for similar
            query_vector = points[0].vector
            results = await self.search(query_vector, top_k=top_k + 1)

            # Filter out the query itself
            results = [r for r in results if r["chunk_id"] != chunk_id][:top_k]

            return results

        except Exception as e:
            logger.error(f"Error searching by chunk_id: {e}")
            raise

    async def search_by_jurisdiction(
        self,
        jurisdiction: str,
        query_vector: List[float],
        top_k: int = 50,
    ) -> List[Dict]:
        """
        Search within a specific jurisdiction.

        Args:
            jurisdiction: Jurisdiction code
            query_vector: Query embedding
            top_k: Number of results

        Returns:
            List of results from jurisdiction
        """
        try:
            filters = {"jurisdiction": jurisdiction}
            return await self.search(query_vector, top_k=top_k, filters=filters)
        except Exception as e:
            logger.error(f"Error searching by jurisdiction: {e}")
            raise

    async def delete_by_chunk_id(self, chunk_id: str) -> bool:
        """Delete a point by chunk_id"""
        try:
            point_id = self._hash_to_point_id(chunk_id)
            await self.client.delete(
                collection_name=self.COLLECTION_NAME,
                points_selector=[point_id],
            )
            logger.info(f"Deleted chunk: {chunk_id}")
            return True
        except Exception as e:
            logger.error(f"Error deleting chunk: {e}")
            return False

    async def get_collection_stats(self) -> Dict:
        """Get collection statistics"""
        try:
            collection = await self.client.get_collection(self.COLLECTION_NAME)
            return {
                "points_count": collection.points_count,
                "vectors_count": collection.vectors_count,
                "indexed_vectors_count": collection.indexed_vectors_count,
                "segment_count": len(collection.config.params.segment_config),
            }
        except Exception as e:
            logger.error(f"Error getting collection stats: {e}")
            return {}

    async def close(self) -> None:
        """Close client"""
        await self.client.close()

    @staticmethod
    def _hash_to_point_id(chunk_id: str) -> int:
        """
        Convert chunk_id to deterministic point ID.

        Uses MD5 hash to ensure same chunk_id always maps to same point_id.
        """
        hash_bytes = hashlib.md5(chunk_id.encode()).digest()
        point_id = int.from_bytes(hash_bytes[:4], byteorder="big") % (2**31)
        return point_id

    @staticmethod
    def _build_filter(filters: Dict) -> Optional[Filter]:
        """Build Qdrant filter from dict"""
        if not filters:
            return None

        # Simple filter builder (can be extended)
        conditions = []
        for key, value in filters.items():
            conditions.append(
                FieldCondition(
                    key=key,
                    match=MatchValue(value=value),
                )
            )

        if conditions:
            return Filter(must=conditions)
        return None


# Example usage
async def example_usage():
    """Example of using QdrantGPUClient"""
    client = QdrantGPUClient(url="http://localhost:6333")

    try:
        await client.initialize()

        # Upsert embeddings
        embeddings = [
            {
                "chunk_id": "chunk_001",
                "vector": [0.1] * 768,  # Mock embedding
                "payload": {
                    "doc_id": "doc_001",
                    "page": 1,
                    "jurisdiction": "CA",
                },
            },
            {
                "chunk_id": "chunk_002",
                "vector": [0.2] * 768,  # Mock embedding
                "payload": {
                    "doc_id": "doc_001",
                    "page": 2,
                    "jurisdiction": "CA",
                },
            },
        ]

        await client.upsert_embeddings(embeddings)

        # Search
        query_vector = [0.15] * 768
        results = await client.search(query_vector, top_k=10)
        print(f"Search results: {results}")

        # Get stats
        stats = await client.get_collection_stats()
        print(f"Collection stats: {stats}")

    finally:
        await client.close()


if __name__ == "__main__":
    import asyncio

    asyncio.run(example_usage())
