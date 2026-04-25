"""
Service initialization and dependency injection for Legal AI Backend
"""

import os
import logging
from typing import Optional
import asyncpg

from backend.services.embedding_service import EmbeddingService
from backend.services.qdrant_poi_service import QdrantPOIService
from backend.services.poi_service_complete import POIService

logger = logging.getLogger(__name__)

# Global service instances
_poi_service: Optional[POIService] = None
_embedding_service: Optional[EmbeddingService] = None
_qdrant_service: Optional[QdrantPOIService] = None


async def init_services(db_pool: asyncpg.Pool) -> None:
    """Initialize all services"""
    global _poi_service, _embedding_service, _qdrant_service

    try:
        # Initialize embedding service
        _embedding_service = EmbeddingService(
            url=os.getenv("OLLAMA_URL", "http://localhost:11434"),
            model=os.getenv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest")
        )
        logger.info("✅ Embedding service initialized")

        # Initialize Qdrant service
        _qdrant_service = QdrantPOIService(
            qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333")
        )
        logger.info("✅ Qdrant POI service initialized")

        # Initialize POI service
        _poi_service = POIService(
            db_pool=db_pool,
            embedding_service=_embedding_service,
            qdrant_service=_qdrant_service
        )
        logger.info("✅ POI service initialized")

    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise


def get_poi_service() -> POIService:
    """Get the POI service instance"""
    if _poi_service is None:
        raise RuntimeError("POI service not initialized. Call init_services() first.")
    return _poi_service


def get_embedding_service() -> EmbeddingService:
    """Get the embedding service instance"""
    if _embedding_service is None:
        raise RuntimeError("Embedding service not initialized. Call init_services() first.")
    return _embedding_service


def get_qdrant_service() -> QdrantPOIService:
    """Get the Qdrant service instance"""
    if _qdrant_service is None:
        raise RuntimeError("Qdrant service not initialized. Call init_services() first.")
    return _qdrant_service
