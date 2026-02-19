"""
FastAPI Bridge Layer

Unified API for multimodal retrieval, 3D visualization, and cartridge assembly.
Provides endpoints for search, 3D memory palace, and cartridge generation.

Usage:
    from backend.api.bridge import router
    app.include_router(router, prefix="/bridge")
"""

import logging
import asyncio
from typing import List, Dict, Optional
from dataclasses import dataclass
import time

from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Import services
try:
    from backend.services.multimodal_retriever import get_multimodal_retriever
    from backend.services.manifold_projector import get_manifold_projector
    from backend.services.latent_collapse import get_latent_collapser
    from backend.services.cartridge_builder import get_cartridge_builder
    from backend.services.visual_context import get_visual_context_enhancer
    from backend.services.faiss_reranker import get_faiss_reranker
except ImportError as e:
    logger.warning(f"Failed to import services: {e}")


# Request/Response Models
class SearchRequest(BaseModel):
    """Search request"""

    query: str
    top_k: Optional[int] = 20
    include_vision: Optional[bool] = False
    include_3d: Optional[bool] = False


class SearchResult(BaseModel):
    """Search result"""

    id: str
    text: str
    score: float
    rank: int
    metadata: Optional[Dict] = None


class SearchResponse(BaseModel):
    """Search response"""

    query: str
    num_results: int
    elapsed_ms: int
    results: List[SearchResult]
    error: Optional[str] = None


class Point3D(BaseModel):
    """3D coordinate"""

    id: str
    x: float
    y: float
    z: float


class Memory3DResponse(BaseModel):
    """3D memory palace response"""

    num_points: int
    points: List[Point3D]
    elapsed_ms: int


class CartridgeRequest(BaseModel):
    """Cartridge assembly request"""

    query: str
    results: List[SearchResult]
    include_metadata: Optional[bool] = True


class CartridgeResponse(BaseModel):
    """Cartridge response"""

    cartridge_id: str
    size_bytes: int
    num_runes: int
    num_edges: int
    elapsed_ms: int


# Create router
router = APIRouter(prefix="/bridge", tags=["bridge"])


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    """
    Unified multimodal search endpoint.

    Combines RAG + KAG + VAG retrieval with optional vision enhancement.

    Args:
        request: Search request with query and options

    Returns:
        Search results with ranking
    """
    start_time = time.time()

    try:
        logger.info(f"Search request: {request.query[:50]}...")

        # Get retriever
        retriever = get_multimodal_retriever()

        # Perform retrieval
        results = await retriever.retrieve(
            query=request.query,
            fusion_top_k=request.top_k,
        )

        # Convert to response format
        search_results = [
            SearchResult(
                id=r.get("id", ""),
                text=r.get("text", ""),
                score=float(r.get("score", 0.0)),
                rank=i + 1,
                metadata=r.get("metadata", {}),
            )
            for i, r in enumerate(results)
        ]

        elapsed_ms = int((time.time() - start_time) * 1000)

        return SearchResponse(
            query=request.query,
            num_results=len(search_results),
            elapsed_ms=elapsed_ms,
            results=search_results,
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        elapsed_ms = int((time.time() - start_time) * 1000)
        return SearchResponse(
            query=request.query,
            num_results=0,
            elapsed_ms=elapsed_ms,
            results=[],
            error=str(e),
        )


@router.post("/3d/memory", response_model=Memory3DResponse)
async def get_3d_memory(
    embeddings: List[List[float]] = Body(...),
    rotation_roll: Optional[float] = 0.0,
    rotation_pitch: Optional[float] = 0.0,
    rotation_yaw: Optional[float] = 0.0,
) -> Memory3DResponse:
    """
    Get 3D memory palace coordinates.

    Projects embeddings to 3D space for visualization.

    Args:
        embeddings: List of 4D or 3D embeddings
        rotation_roll: Roll rotation (radians)
        rotation_pitch: Pitch rotation (radians)
        rotation_yaw: Yaw rotation (radians)

    Returns:
        3D coordinates for visualization
    """
    start_time = time.time()

    try:
        logger.info(f"3D memory request: {len(embeddings)} embeddings")

        # Get projector
        projector = get_manifold_projector()

        # Set rotation
        projector.set_rotation(rotation_roll, rotation_pitch, rotation_yaw)

        # Get 3D coordinates
        import numpy as np

        embeddings_array = np.array(embeddings)
        coords = projector.get_3d_coordinates(embeddings_array)

        # Convert to response format
        points = [
            Point3D(
                id=c.get("id", ""),
                x=c.get("x", 0.0),
                y=c.get("y", 0.0),
                z=c.get("z", 0.0),
            )
            for c in coords
        ]

        elapsed_ms = int((time.time() - start_time) * 1000)

        return Memory3DResponse(
            num_points=len(points),
            points=points,
            elapsed_ms=elapsed_ms,
        )

    except Exception as e:
        logger.error(f"3D memory failed: {e}")
        elapsed_ms = int((time.time() - start_time) * 1000)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cartridge", response_model=CartridgeResponse)
async def assemble_cartridge(request: CartridgeRequest) -> CartridgeResponse:
    """
    Assemble CH-ROM97 cartridge.

    Encodes search results into binary cartridge format.

    Args:
        request: Cartridge assembly request

    Returns:
        Cartridge metadata
    """
    start_time = time.time()

    try:
        logger.info(f"Cartridge request: {len(request.results)} results")

        # Get services
        collapser = get_latent_collapser()
        builder = get_cartridge_builder()

        # Create runes from results
        runes = []
        edges = []

        for i, result in enumerate(request.results):
            rune = {
                "id": i,
                "uuid": result.id,
                "embedding": [0.0] * 768,  # Placeholder
            }
            runes.append(rune)

            # Create edges between consecutive results
            if i < len(request.results) - 1:
                edges.append((i, i + 1, 0.8))

        # Build cartridge
        metadata = {
            "query": request.query,
            "num_results": len(request.results),
        }

        cartridge = builder.build_ch_rom97(runes, [], edges, metadata)

        # Serialize
        serialized = builder.serialize_cartridge(cartridge)

        # Get size breakdown
        size_info = builder.get_cartridge_size(cartridge)

        elapsed_ms = int((time.time() - start_time) * 1000)

        return CartridgeResponse(
            cartridge_id=f"cartridge-{int(time.time())}",
            size_bytes=size_info.get("total", 0),
            num_runes=cartridge.num_runes,
            num_edges=cartridge.num_edges,
            elapsed_ms=elapsed_ms,
        )

    except Exception as e:
        logger.error(f"Cartridge assembly failed: {e}")
        elapsed_ms = int((time.time() - start_time) * 1000)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check() -> Dict:
    """
    Health check endpoint.

    Returns:
        Health status
    """
    try:
        # Check service availability
        retriever = get_multimodal_retriever()
        projector = get_manifold_projector()
        collapser = get_latent_collapser()
        builder = get_cartridge_builder()

        return {
            "status": "healthy",
            "services": {
                "retriever": "available",
                "projector": "available",
                "collapser": "available",
                "builder": "available",
            },
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
        }


@router.get("/stats")
async def get_stats() -> Dict:
    """
    Get system statistics.

    Returns:
        System statistics
    """
    try:
        retriever = get_multimodal_retriever()
        projector = get_manifold_projector()
        collapser = get_latent_collapser()

        return {
            "retriever": retriever.get_stats(),
            "projector": projector.get_stats(),
            "collapser": collapser.get_stats(),
        }

    except Exception as e:
        logger.error(f"Stats retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
