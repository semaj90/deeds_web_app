"""
Search API Routes: FastAPI endpoints for semantic search

Endpoints:
- POST /api/search/evidence - Search with query and filters
- GET /api/search/results/{search_id} - Get search results
- POST /api/search/rerank - Rerank results
- GET /api/search/stream/{search_id} - Stream progress events
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette import EventSourceResponse

from ..search_service import SearchService, SearchResult, get_search_service
from ..search_cache import CacheManager, get_cache_manager
from ..reranker_service import RerankerService, get_reranker_service
from ..search_events import SearchEventEmitter, get_event_emitter

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/search", tags=["search"])


class SearchRequest(BaseModel):
    """Search request"""
    query: str
    filters: Optional[Dict] = None
    top_k: int = 50


class RerankerRequest(BaseModel):
    """Reranker request"""
    query: str
    candidates: List[Dict]
    top_k: int = 5


class SearchResponse(BaseModel):
    """Search response"""
    search_id: str
    query: str
    results: List[Dict]
    total_results: int
    latency_ms: int
    cached: bool


@router.post("/evidence")
async def search_evidence(request: SearchRequest) -> Dict:
    """Search for evidence by semantic meaning"""
    try:
        # Validate query
        if not request.query or len(request.query.strip()) == 0:
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        if len(request.query) > 1000:
            raise HTTPException(status_code=400, detail="Query too long (max 1000 chars)")

        # Get services
        search_service = await get_search_service()
        cache_manager = await get_cache_manager()
        event_emitter = await get_event_emitter()

        # Check cache
        cached_result = await cache_manager.get(request.query, request.filters)
        if cached_result:
            logger.info(f"✅ Returning cached result for query: {request.query[:50]}...")
            return {
                "search_id": cached_result.search_id,
                "query": cached_result.query,
                "results": [
                    {
                        "rank": r.rank,
                        "chunk_id": r.chunk_id,
                        "doc_id": r.doc_id,
                        "text": r.text[:200],  # Truncate for response
                        "relevance_score": r.relevance_score,
                        "page": r.page,
                    }
                    for r in cached_result.results
                ],
                "total_results": cached_result.total_results,
                "latency_ms": cached_result.latency_ms,
                "cached": True,
                "stream_url": f"/api/search/stream/{cached_result.search_id}",
            }

        # Perform search
        logger.info(f"🔍 Searching for: {request.query[:50]}...")
        search_result = await search_service.search_with_metadata(
            query=request.query,
            top_k=request.top_k,
            filters=request.filters,
        )

        # Cache result
        await cache_manager.set(request.query, search_result, request.filters)

        # Emit event
        await event_emitter.emit_search_complete(
            search_result.search_id,
            len(search_result.results),
        )

        return {
            "search_id": search_result.search_id,
            "query": search_result.query,
            "results": [
                {
                    "rank": r.rank,
                    "chunk_id": r.chunk_id,
                    "doc_id": r.doc_id,
                    "text": r.text[:200],  # Truncate for response
                    "relevance_score": r.relevance_score,
                    "page": r.page,
                }
                for r in search_result.results
            ],
            "total_results": search_result.total_results,
            "latency_ms": search_result.latency_ms,
            "cached": False,
            "stream_url": f"/api/search/stream/{search_result.search_id}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/results/{search_id}")
async def get_search_results(search_id: str) -> Dict:
    """Get full search results"""
    try:
        # This would typically retrieve from cache or database
        # For now, return placeholder
        return {
            "search_id": search_id,
            "results": [],
            "total_results": 0,
        }

    except Exception as e:
        logger.error(f"Error getting results: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rerank")
async def rerank_results(request: RerankerRequest) -> Dict:
    """Rerank search results"""
    try:
        if not request.query:
            raise HTTPException(status_code=400, detail="Query cannot be empty")

        if not request.candidates:
            raise HTTPException(status_code=400, detail="No candidates to rerank")

        # Get reranker service
        reranker_service = await get_reranker_service()

        # Rerank
        logger.info(f"Reranking {len(request.candidates)} candidates...")
        reranked = await reranker_service.rerank(
            query=request.query,
            candidates=request.candidates,
            top_k=request.top_k,
        )

        return {
            "query": request.query,
            "reranked": [
                {
                    "chunk_id": r.chunk_id,
                    "doc_id": r.doc_id,
                    "score": r.score,
                    "rank": i + 1,
                }
                for i, r in enumerate(reranked)
            ],
            "total_reranked": len(reranked),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reranking error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream/{search_id}")
async def stream_search_progress(search_id: str):
    """Stream search progress events via SSE"""
    try:
        event_emitter = await get_event_emitter()

        async def event_generator():
            # Subscribe to events
            async for event in event_emitter.subscribe(search_id):
                yield f"event: {event['type']}\n"
                yield f"data: {json.dumps(event['data'])}\n\n"

        return EventSourceResponse(event_generator())

    except Exception as e:
        logger.error(f"Stream error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache/stats")
async def get_cache_stats() -> Dict:
    """Get cache statistics"""
    try:
        cache_manager = await get_cache_manager()
        stats = await cache_manager.get_stats()

        return {
            "total_hits": stats.total_hits,
            "total_misses": stats.total_misses,
            "hit_rate": f"{stats.hit_rate:.2f}%",
            "cached_queries": stats.cached_queries,
            "cache_size_bytes": stats.cache_size_bytes,
            "cache_size_mb": f"{stats.cache_size_bytes / 1024 / 1024:.2f}",
            "last_updated": stats.last_updated.isoformat(),
        }

    except Exception as e:
        logger.error(f"Error getting cache stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_cache() -> Dict:
    """Clear all cached results"""
    try:
        cache_manager = await get_cache_manager()
        cleared = await cache_manager.clear_all()

        return {
            "status": "success",
            "cleared_entries": cleared,
        }

    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/invalidate/{doc_id}")
async def invalidate_doc_cache(doc_id: str) -> Dict:
    """Invalidate cache for a document"""
    try:
        cache_manager = await get_cache_manager()
        invalidated = await cache_manager.invalidate_doc(doc_id)

        return {
            "status": "success",
            "invalidated_entries": invalidated,
            "doc_id": doc_id,
        }

    except Exception as e:
        logger.error(f"Error invalidating cache: {e}")
        raise HTTPException(status_code=500, detail=str(e))
