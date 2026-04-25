#!/usr/bin/env python3
"""
Phase 89: Timeline API Endpoints

FastAPI router for querying the Phase 89 event timeline.
Provides semantic search, recent events, file history, and timeline statistics.

Author: ACE (Agentic Code Evolution)
Date: 2025-01-01
"""

import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Query, HTTPException, Path
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Import timeline logger
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.timeline_logger import TimelineLogger

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/timeline", tags=["Timeline"])

# ═══════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════

class TimelineEvent(BaseModel):
    """Timeline event response model"""
    event_id: int
    timestamp: str
    operation: str
    collection: str
    point_id: Optional[str] = None
    actor: str
    note_text: Optional[str] = None
    tags: Optional[List[str]] = None
    ref: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    similarity: Optional[float] = None  # For search results

class TimelineStats(BaseModel):
    """Timeline statistics response model"""
    total_events: int
    events_last_24h: int
    events_last_7d: int
    top_collections: List[Dict[str, Any]]
    top_actors: List[Dict[str, Any]]
    operations_breakdown: List[Dict[str, Any]]

# ═══════════════════════════════════════════════════════════════════
# API Endpoints
# ═══════════════════════════════════════════════════════════════════

@router.get("/health", summary="Timeline API health check")
async def health_check():
    """
    Check if timeline API and database are accessible.

    Returns:
        dict: Health status
    """
    try:
        with TimelineLogger() as timeline:
            # Try a simple query
            events = timeline.get_recent_events(limit=1)
            return {
                "status": "healthy",
                "service": "timeline_api",
                "database": "connected",
                "version": "1.0.0",
                "timestamp": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        raise HTTPException(status_code=503, detail=f"Service unavailable: {str(e)}")

@router.get("/recent", summary="Get recent timeline events")
async def get_recent_events(
    limit: int = Query(20, ge=1, le=100, description="Number of events to return"),
    collection: Optional[str] = Query(None, description="Filter by collection name"),
    actor: Optional[str] = Query(None, description="Filter by actor (system, user, agentic)"),
    operation: Optional[str] = Query(None, description="Filter by operation (upsert, update, delete)"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by")
):
    """
    Get recent timeline events with optional filters.

    Args:
        limit: Number of events to return (1-100)
        collection: Filter by Qdrant collection name
        actor: Filter by actor (system, user, agentic)
        operation: Filter by operation type
        tags: Comma-separated tags (e.g., "phase89,ts_fix,svelte5")

    Returns:
        List[TimelineEvent]: Recent events matching filters
    """
    try:
        tags_list = tags.split(",") if tags else None

        with TimelineLogger() as timeline:
            events = timeline.get_recent_events(
                limit=limit,
                collection=collection,
                actor=actor,
                operation=operation,
                tags=tags_list
            )

            return {
                "events": events,
                "count": len(events),
                "filters": {
                    "collection": collection,
                    "actor": actor,
                    "operation": operation,
                    "tags": tags_list
                }
            }
    except Exception as e:
        logger.error(f"❌ Failed to get recent events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve events: {str(e)}")

@router.get("/search", summary="Semantic timeline search")
async def search_timeline(
    query: str = Query(..., description="Natural language search query"),
    limit: int = Query(10, ge=1, le=50, description="Number of results to return"),
    min_similarity: float = Query(0.7, ge=0.0, le=1.0, description="Minimum similarity threshold (0-1)")
):
    """
    Semantic search of timeline events using vector embeddings.

    Embeds the query text and finds the most similar timeline events
    based on cosine similarity of note_text embeddings.

    Args:
        query: Natural language search query (e.g., "TypeScript errors related to Svelte 5")
        limit: Number of results to return (1-50)
        min_similarity: Minimum cosine similarity threshold (0.0-1.0)

    Returns:
        List[TimelineEvent]: Events matching the semantic query, ordered by similarity

    Examples:
        - "what changed in the auth service?"
        - "TypeScript errors in the last week"
        - "fixes related to Svelte 5 migration"
    """
    try:
        with TimelineLogger() as timeline:
            results = timeline.search_timeline(
                query_text=query,
                limit=limit,
                min_similarity=min_similarity
            )

            return {
                "query": query,
                "results": results,
                "count": len(results),
                "min_similarity": min_similarity
            }
    except Exception as e:
        logger.error(f"❌ Timeline search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

@router.get("/file/{file_path:path}", summary="Get file-specific timeline")
async def get_file_timeline(
    file_path: str = Path(..., description="File path (e.g., src/lib/auth/session.ts)"),
    limit: int = Query(20, ge=1, le=100, description="Number of events to return")
):
    """
    Get timeline of all events related to a specific file.

    Args:
        file_path: File path (e.g., "src/lib/auth/session.ts")
        limit: Number of events to return

    Returns:
        List[TimelineEvent]: Events related to the file, ordered by timestamp
    """
    try:
        with TimelineLogger() as timeline:
            events = timeline.get_file_timeline(
                file_path=file_path,
                limit=limit
            )

            return {
                "file_path": file_path,
                "events": events,
                "count": len(events)
            }
    except Exception as e:
        logger.error(f"❌ Failed to get file timeline: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve file timeline: {str(e)}")

@router.get("/stats", summary="Timeline statistics")
async def get_timeline_stats():
    """
    Get comprehensive timeline statistics.

    Returns:
        TimelineStats: Statistics about timeline events
    """
    try:
        with TimelineLogger() as timeline:
            conn = timeline.conn
            cursor = conn.cursor()

            # Total events
            cursor.execute("SELECT COUNT(*) FROM phase89_vector_events")
            total_events = cursor.fetchone()[0]

            # Events last 24h
            cursor.execute("""
                SELECT COUNT(*)
                FROM phase89_vector_events
                WHERE timestamp >= NOW() - INTERVAL '24 hours'
            """)
            events_last_24h = cursor.fetchone()[0]

            # Events last 7 days
            cursor.execute("""
                SELECT COUNT(*)
                FROM phase89_vector_events
                WHERE timestamp >= NOW() - INTERVAL '7 days'
            """)
            events_last_7d = cursor.fetchone()[0]

            # Top collections
            cursor.execute("""
                SELECT collection, COUNT(*) as count
                FROM phase89_vector_events
                GROUP BY collection
                ORDER BY count DESC
                LIMIT 10
            """)
            top_collections = [
                {"collection": row[0], "count": row[1]}
                for row in cursor.fetchall()
            ]

            # Top actors
            cursor.execute("""
                SELECT actor, COUNT(*) as count
                FROM phase89_vector_events
                GROUP BY actor
                ORDER BY count DESC
                LIMIT 10
            """)
            top_actors = [
                {"actor": row[0], "count": row[1]}
                for row in cursor.fetchall()
            ]

            # Operations breakdown
            cursor.execute("""
                SELECT operation, COUNT(*) as count
                FROM phase89_vector_events
                GROUP BY operation
                ORDER BY count DESC
            """)
            operations_breakdown = [
                {"operation": row[0], "count": row[1]}
                for row in cursor.fetchall()
            ]

            cursor.close()

            return {
                "total_events": total_events,
                "events_last_24h": events_last_24h,
                "events_last_7d": events_last_7d,
                "top_collections": top_collections,
                "top_actors": top_actors,
                "operations_breakdown": operations_breakdown,
                "generated_at": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"❌ Failed to get timeline stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve statistics: {str(e)}")

@router.get("/collections", summary="List all collections with event counts")
async def get_collections():
    """
    Get list of all Qdrant collections tracked in the timeline.

    Returns:
        List[Dict]: Collections with event counts and latest activity
    """
    try:
        with TimelineLogger() as timeline:
            conn = timeline.conn
            cursor = conn.cursor()

            cursor.execute("""
                SELECT
                    collection,
                    COUNT(*) as event_count,
                    MAX(timestamp) as latest_activity,
                    array_agg(DISTINCT operation) as operations
                FROM phase89_vector_events
                GROUP BY collection
                ORDER BY event_count DESC
            """)

            collections = [
                {
                    "collection": row[0],
                    "event_count": row[1],
                    "latest_activity": row[2].isoformat() if row[2] else None,
                    "operations": row[3] if row[3] else []
                }
                for row in cursor.fetchall()
            ]

            cursor.close()

            return {
                "collections": collections,
                "count": len(collections)
            }
    except Exception as e:
        logger.error(f"❌ Failed to get collections: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve collections: {str(e)}")

# ═══════════════════════════════════════════════════════════════════
# VLM-Specific Endpoints (1024d Multimodal)
# ═══════════════════════════════════════════════════════════════════

@router.get("/vlm/seals", summary="Get seal detection events")
async def get_seal_detections(
    min_confidence: float = Query(0.8, ge=0.0, le=1.0, description="Minimum seal confidence"),
    limit: int = Query(20, ge=1, le=100, description="Number of results"),
    document_ref: Optional[str] = Query(None, description="Filter by document reference")
):
    """
    Get high-confidence seal detection events from VLM table.

    Args:
        min_confidence: Minimum seal detection confidence (0.0-1.0)
        limit: Number of events to return
        document_ref: Optional document reference filter

    Returns:
        List of seal detection events with confidence scores and layout boxes
    """
    try:
        with TimelineLogger() as timeline:
            conn = timeline.conn
            cursor = conn.cursor()

            query = """
                SELECT
                    event_id,
                    timestamp,
                    collection,
                    point_id,
                    note_text,
                    seal_confidence,
                    layout_boxes,
                    ref,
                    payload,
                    tags
                FROM phase89_vector_events_vlm
                WHERE modality IN ('image', 'multimodal')
                  AND seal_confidence >= %s
            """
            params = [min_confidence]

            if document_ref:
                query += " AND ref = %s"
                params.append(document_ref)

            query += " ORDER BY seal_confidence DESC, timestamp DESC LIMIT %s"
            params.append(limit)

            cursor.execute(query, params)

            columns = [desc[0] for desc in cursor.description]
            events = []
            for row in cursor.fetchall():
                event = dict(zip(columns, row))
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                events.append(event)

            cursor.close()

            return {
                "events": events,
                "count": len(events),
                "filters": {
                    "min_confidence": min_confidence,
                    "document_ref": document_ref
                }
            }
    except Exception as e:
        logger.error(f"❌ Failed to get seal detections: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve seal detections: {str(e)}")

@router.get("/vlm/multimodal", summary="Get multimodal events")
async def get_multimodal_events(
    limit: int = Query(20, ge=1, le=100, description="Number of events"),
    modality: str = Query("multimodal", description="Filter by modality (text, image, multimodal)")
):
    """
    Get events from VLM table filtered by modality.

    Args:
        limit: Number of events to return
        modality: Event modality (text, image, multimodal)

    Returns:
        List of VLM events with embedding type and modality info
    """
    try:
        with TimelineLogger() as timeline:
            conn = timeline.conn
            cursor = conn.cursor()

            cursor.execute("""
                SELECT
                    event_id,
                    timestamp,
                    operation,
                    collection,
                    note_text,
                    modality,
                    seal_confidence,
                    layout_boxes,
                    tags,
                    ref,
                    payload
                FROM phase89_vector_events_vlm
                WHERE modality = %s
                ORDER BY timestamp DESC
                LIMIT %s
            """, (modality, limit))

            columns = [desc[0] for desc in cursor.description]
            events = []
            for row in cursor.fetchall():
                event = dict(zip(columns, row))
                if event.get('timestamp'):
                    event['timestamp'] = event['timestamp'].isoformat()
                events.append(event)

            cursor.close()

            return {
                "events": events,
                "count": len(events),
                "modality": modality,
                "embedding_dimension": 1024
            }
    except Exception as e:
        logger.error(f"❌ Failed to get multimodal events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve multimodal events: {str(e)}")

@router.get("/vlm/stats", summary="VLM timeline statistics")
async def get_vlm_stats():
    """
    Get statistics specific to VLM timeline (1024d embeddings).

    Returns:
        VLM-specific statistics including modality breakdown and seal confidence metrics
    """
    try:
        with TimelineLogger() as timeline:
            conn = timeline.conn
            cursor = conn.cursor()

            # Total VLM events
            cursor.execute("SELECT COUNT(*) FROM phase89_vector_events_vlm")
            total_vlm_events = cursor.fetchone()[0]

            # Modality breakdown
            cursor.execute("""
                SELECT modality, COUNT(*) as count
                FROM phase89_vector_events_vlm
                GROUP BY modality
                ORDER BY count DESC
            """)
            modality_breakdown = [
                {"modality": row[0], "count": row[1]}
                for row in cursor.fetchall()
            ]

            # Average seal confidence
            cursor.execute("""
                SELECT AVG(seal_confidence), MAX(seal_confidence), MIN(seal_confidence)
                FROM phase89_vector_events_vlm
                WHERE modality IN ('image', 'multimodal')
            """)
            seal_stats = cursor.fetchone()

            # High confidence seals
            cursor.execute("""
                SELECT COUNT(*)
                FROM phase89_vector_events_vlm
                WHERE seal_confidence >= 0.8
            """)
            high_confidence_seals = cursor.fetchone()[0]

            # Documents with seals
            cursor.execute("""
                SELECT COUNT(DISTINCT ref)
                FROM phase89_vector_events_vlm
                WHERE modality IN ('image', 'multimodal')
                  AND ref IS NOT NULL
            """)
            documents_with_seals = cursor.fetchone()[0]

            cursor.close()

            return {
                "total_vlm_events": total_vlm_events,
                "embedding_dimension": 1024,
                "modality_breakdown": modality_breakdown,
                "seal_statistics": {
                    "avg_confidence": float(seal_stats[0]) if seal_stats[0] else 0.0,
                    "max_confidence": float(seal_stats[1]) if seal_stats[1] else 0.0,
                    "min_confidence": float(seal_stats[2]) if seal_stats[2] else 0.0,
                    "high_confidence_count": high_confidence_seals
                },
                "documents_with_seals": documents_with_seals,
                "generated_at": datetime.utcnow().isoformat()
            }
    except Exception as e:
        logger.error(f"❌ Failed to get VLM stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve VLM statistics: {str(e)}")

# ═══════════════════════════════════════════════════════════════════
# Export
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  Phase 89: Timeline API Endpoints (VLM-Enhanced)               ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print()
    print("Standard Endpoints (768d + 1024d):")
    print("  GET  /api/timeline/health             - Health check")
    print("  GET  /api/timeline/recent             - Recent events")
    print("  GET  /api/timeline/search             - Semantic search")
    print("  GET  /api/timeline/file/{file_path}   - File timeline")
    print("  GET  /api/timeline/stats              - Statistics")
    print("  GET  /api/timeline/collections        - Collection list")
    print()
    print("VLM-Specific Endpoints (1024d multimodal):")
    print("  GET  /api/timeline/vlm/seals          - Seal detection events")
    print("  GET  /api/timeline/vlm/multimodal     - Multimodal events")
    print("  GET  /api/timeline/vlm/stats          - VLM statistics")
    print()
    print("✅ Timeline API ready for integration!")
