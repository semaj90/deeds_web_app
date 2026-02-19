"""Qdrant vector database client."""

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import structlog
from typing import List, Dict, Any, Optional
import uuid

from evidence_pipeline.config import settings

logger = structlog.get_logger(__name__)

# Global Qdrant client
_client: Optional[QdrantClient] = None


def get_client() -> QdrantClient:
    """Get or create Qdrant client."""
    global _client
    if _client is None:
        _client = QdrantClient(url=settings.QDRANT_URL)
    return _client


async def init_qdrant():
    """Initialize Qdrant collection."""
    try:
        client = get_client()

        # Check if collection exists
        try:
            client.get_collection(settings.QDRANT_COLLECTION)
            logger.info(f"Qdrant collection exists: {settings.QDRANT_COLLECTION}")
        except Exception:
            # Collection doesn't exist, create it
            client.create_collection(
                collection_name=settings.QDRANT_COLLECTION,
                vectors_config=VectorParams(
                    size=settings.QDRANT_VECTOR_SIZE,
                    distance=Distance.COSINE,
                ),
            )
            logger.info(f"Created Qdrant collection: {settings.QDRANT_COLLECTION}")

        logger.info("Qdrant initialized successfully")
    except Exception as e:
        logger.error("Failed to initialize Qdrant", error=str(e))
        raise


async def index_embedding(
    chunk_id: str,
    embedding: List[float],
    metadata: Dict[str, Any],
) -> bool:
    """Index an embedding in Qdrant."""
    try:
        client = get_client()

        # Create point with metadata as payload
        point = PointStruct(
            id=int(uuid.uuid4().int % (2**63 - 1)),  # Convert UUID to positive int
            vector=embedding,
            payload=metadata,
        )

        client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=[point],
        )

        logger.info(f"Embedding indexed in Qdrant", chunk_id=chunk_id)
        return True
    except Exception as e:
        logger.error(f"Failed to index embedding in Qdrant", error=str(e))
        return False


async def search_embeddings(
    query_embedding: List[float],
    limit: int = 10,
    score_threshold: float = 0.5,
) -> List[Dict[str, Any]]:
    """Search for similar embeddings in Qdrant."""
    try:
        client = get_client()

        results = client.search(
            collection_name=settings.QDRANT_COLLECTION,
            query_vector=query_embedding,
            limit=limit,
            score_threshold=score_threshold,
        )

        return [
            {
                "id": result.id,
                "score": result.score,
                "payload": result.payload,
            }
            for result in results
        ]
    except Exception as e:
        logger.error(f"Failed to search embeddings in Qdrant", error=str(e))
        return []


async def delete_embedding(point_id: int) -> bool:
    """Delete an embedding from Qdrant."""
    try:
        client = get_client()

        client.delete(
            collection_name=settings.QDRANT_COLLECTION,
            points_selector=[point_id],
        )

        logger.info(f"Embedding deleted from Qdrant", point_id=point_id)
        return True
    except Exception as e:
        logger.error(f"Failed to delete embedding from Qdrant", error=str(e))
        return False


async def health_check() -> dict:
    """Check Qdrant health."""
    try:
        client = get_client()
        collection = client.get_collection(settings.QDRANT_COLLECTION)
        return {
            "status": "healthy",
            "service": "qdrant",
            "collection": settings.QDRANT_COLLECTION,
            "points_count": collection.points_count,
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "service": "qdrant",
            "error": str(e),
        }
