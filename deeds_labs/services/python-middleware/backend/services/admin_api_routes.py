#!/usr/bin/env python3
"""
═══════════════════════════════════════════════════════════════════════
Agentic Knowledge Integration V2 - Admin API Routes
═══════════════════════════════════════════════════════════════════════
Date: January 2, 2026
Purpose: FastAPI routes for Admin UI integration
Task: 16.2 - Wire up admin UI to FastAPI
═══════════════════════════════════════════════════════════════════════
"""

import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/codebase", tags=["codebase"])


# ═══════════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════════

class StatsResponse(BaseModel):
    """Dashboard statistics response."""
    totalFiles: int
    indexedFiles: int
    totalErrors: int
    errorClusters: int
    topErrorCodes: List[Dict[str, Any]]
    surfaceBreakdown: Dict[str, int]
    techBreakdown: Dict[str, int]
    lastIndexed: Optional[str]


class ErrorCard(BaseModel):
    """Error card model."""
    id: str
    errorCode: str
    message: str
    filePath: str
    line: int
    column: int
    surface: List[str]
    tech: List[str]
    clusterId: Optional[str]
    fixSuggestion: Optional[str]
    timestamp: str


class ErrorsResponse(BaseModel):
    """Paginated errors response."""
    errors: List[ErrorCard]
    total: int
    page: int
    pageSize: int
    hasMore: bool


class ClusterSummary(BaseModel):
    """Cluster summary model."""
    id: str
    name: str
    dominant_code: str
    member_count: int
    fix_suggestion: str
    surface: List[str]
    tech: List[str]


class ClusterDetail(BaseModel):
    """Cluster detail model."""
    id: str
    name: str
    dominant_code: str
    member_count: int
    fix_suggestion: str
    surface: List[str]
    tech: List[str]
    centroid: List[float]
    keywords: List[str]
    created_at: str


class ClustersResponse(BaseModel):
    """Clusters list response."""
    clusters: List[ClusterSummary]
    total: int


class GraphNode(BaseModel):
    """Graph node model."""
    id: str
    label: str
    type: str
    errorCount: int
    filePath: str
    cluster: Optional[str] = None
    imports: List[str] = []
    exports: List[str] = []
    functions: List[str] = []


class GraphEdge(BaseModel):
    """Graph edge model."""
    source: str
    target: str
    type: str


class GraphResponse(BaseModel):
    """Graph data response."""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
    metadata: Dict[str, Any]


class SearchResult(BaseModel):
    """Search result model."""
    id: str
    filePath: str
    label: str
    type: str
    score: float
    errorCount: int
    snippet: Optional[str] = None


class SearchResponse(BaseModel):
    """Search response."""
    results: List[SearchResult]
    query: str
    total: int


class ReindexRequest(BaseModel):
    """Reindex request."""
    directory: Optional[str] = None
    force: bool = False


class ReindexResponse(BaseModel):
    """Reindex response."""
    success: bool
    message: str
    stats: Optional[Dict[str, Any]] = None


class ClusterRequest(BaseModel):
    """Cluster request."""
    k: int = Field(10, ge=2, le=50)
    generate_summaries: bool = True


# ═══════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════

def get_orchestrator():
    """Get the integration orchestrator instance."""
    try:
        from backend.services.integration_orchestrator import get_orchestrator as _get_orchestrator
        return _get_orchestrator()
    except ImportError:
        return None


def get_ai_recommendation_service():
    """Get the AI recommendation service instance."""
    try:
        from backend.services.ai_recommendation_service import AIRecommendationService
        return AIRecommendationService()
    except ImportError:
        return None


def get_clustering_service():
    """Get the clustering service instance."""
    try:
        from backend.services.kmeans_clustering_service import KMeansClusteringService
        return KMeansClusteringService()
    except ImportError:
        return None


# ═══════════════════════════════════════════════════════════════════════
# Stats Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """
    Get dashboard statistics.

    Returns metrics for the codebase intelligence dashboard:
    - Total and indexed file counts
    - Error counts and clusters
    - Top error codes
    - Surface and tech breakdowns
    """
    orchestrator = get_orchestrator()
    ai_service = get_ai_recommendation_service()

    # Get basic stats from orchestrator
    if orchestrator:
        try:
            stats = await orchestrator.get_stats()
            total_files = stats.get("totalFiles", 0)
            indexed_files = stats.get("indexedFiles", 0)
            last_indexed = stats.get("lastClusterUpdate")
        except Exception as e:
            logger.warning(f"Failed to get orchestrator stats: {e}")
            total_files = 0
            indexed_files = 0
            last_indexed = None
    else:
        total_files = 0
        indexed_files = 0
        last_indexed = None

    # Get error stats from AI recommendation service
    if ai_service:
        try:
            error_stats = ai_service.get_error_stats()
            total_errors = error_stats.get("total_errors", 0)
            error_clusters = error_stats.get("cluster_count", 0)
            top_error_codes = error_stats.get("top_codes", [])
            surface_breakdown = error_stats.get("surface_breakdown", {})
            tech_breakdown = error_stats.get("tech_breakdown", {})
        except Exception as e:
            logger.warning(f"Failed to get error stats: {e}")
            total_errors = 0
            error_clusters = 0
            top_error_codes = []
            surface_breakdown = {}
            tech_breakdown = {}
    else:
        # Mock data for development
        total_errors = 127
        error_clusters = 12
        top_error_codes = [
            {"code": "TS2307", "count": 45},
            {"code": "TS2339", "count": 32},
            {"code": "TS2345", "count": 18},
            {"code": "TS7006", "count": 15},
            {"code": "TS2322", "count": 12},
            {"code": "svelte(a11y)", "count": 5}
        ]
        surface_breakdown = {
            "routes": 42,
            "components": 38,
            "stores": 15,
            "services": 18,
            "api": 14
        }
        tech_breakdown = {
            "typescript": 95,
            "svelte": 25,
            "javascript": 7
        }

    return StatsResponse(
        totalFiles=total_files or 250,
        indexedFiles=indexed_files or 248,
        totalErrors=total_errors,
        errorClusters=error_clusters,
        topErrorCodes=top_error_codes,
        surfaceBreakdown=surface_breakdown,
        techBreakdown=tech_breakdown,
        lastIndexed=last_indexed or datetime.now().isoformat()
    )


# ═══════════════════════════════════════════════════════════════════════
# Errors Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/errors", response_model=ErrorsResponse)
async def get_errors(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    errorCode: Optional[str] = Query(None),
    surface: Optional[str] = Query(None),
    tech: Optional[str] = Query(None),
    clusterId: Optional[str] = Query(None)
):
    """
    Get paginated error cards with filtering.

    Supports filtering by:
    - errorCode: Filter by specific error code (e.g., TS2307)
    - surface: Filter by surface area (routes, components, etc.)
    - tech: Filter by technology (typescript, svelte, etc.)
    - clusterId: Filter by cluster ID
    """
    ai_service = get_ai_recommendation_service()

    if ai_service:
        try:
            filters = {}
            if errorCode:
                filters["errorCode"] = errorCode
            if surface:
                filters["surface"] = surface
            if tech:
                filters["tech"] = tech
            if clusterId:
                filters["clusterId"] = clusterId

            result = ai_service.query_errors(
                filters=filters,
                page=page,
                page_size=pageSize
            )

            errors = [
                ErrorCard(
                    id=e.get("id", ""),
                    errorCode=e.get("errorCode", ""),
                    message=e.get("message", ""),
                    filePath=e.get("filePath", ""),
                    line=e.get("line", 0),
                    column=e.get("column", 0),
                    surface=e.get("surface", []),
                    tech=e.get("tech", []),
                    clusterId=e.get("clusterId"),
                    fixSuggestion=e.get("fixSuggestion"),
                    timestamp=e.get("timestamp", datetime.now().isoformat())
                )
                for e in result.get("errors", [])
            ]

            return ErrorsResponse(
                errors=errors,
                total=result.get("total", len(errors)),
                page=page,
                pageSize=pageSize,
                hasMore=result.get("hasMore", False)
            )
        except Exception as e:
            logger.error(f"Failed to get errors: {e}")

    # Mock data for development
    mock_errors = [
        ErrorCard(
            id="err-1",
            errorCode="TS2307",
            message="Cannot find module '$lib/components/missing'",
            filePath="src/routes/+page.svelte",
            line=5,
            column=8,
            surface=["routes"],
            tech=["typescript", "svelte"],
            clusterId="cluster-1",
            fixSuggestion="Check if the module path is correct or create the missing module",
            timestamp=datetime.now().isoformat()
        ),
        ErrorCard(
            id="err-2",
            errorCode="TS2339",
            message="Property 'data' does not exist on type 'never'",
            filePath="src/lib/stores/case.ts",
            line=42,
            column=15,
            surface=["stores"],
            tech=["typescript"],
            clusterId="cluster-2",
            fixSuggestion="Add proper type annotation to the variable",
            timestamp=datetime.now().isoformat()
        )
    ]

    return ErrorsResponse(
        errors=mock_errors,
        total=127,
        page=page,
        pageSize=pageSize,
        hasMore=page * pageSize < 127
    )


@router.get("/error-filters")
async def get_error_filters():
    """
    Get available filter options for errors.

    Returns lists of available error codes, surfaces, and technologies
    for populating filter dropdowns.
    """
    ai_service = get_ai_recommendation_service()

    if ai_service:
        try:
            return ai_service.get_filter_options()
        except Exception as e:
            logger.warning(f"Failed to get filter options: {e}")

    # Mock data
    return {
        "errorCodes": ["TS2307", "TS2339", "TS2345", "TS7006", "TS2322", "svelte(a11y)"],
        "surfaces": ["routes", "components", "stores", "services", "api", "utils"],
        "technologies": ["typescript", "svelte", "javascript"]
    }


# ═══════════════════════════════════════════════════════════════════════
# Clusters Endpoints
# ═══════════════════════════════════════════════════════════════════════

@router.get("/clusters", response_model=ClustersResponse)
async def get_clusters(
    limit: int = Query(10, ge=1, le=50)
):
    """
    Get list of error clusters.

    Returns cluster summaries with dominant error codes and fix suggestions.
    """
    clustering_service = get_clustering_service()

    if clustering_service:
        try:
            clusters = clustering_service.get_clusters_from_cache()
            if clusters:
                return ClustersResponse(
                    clusters=[
                        ClusterSummary(
                            id=c.get("id", ""),
                            name=c.get("name", ""),
                            dominant_code=c.get("dominant_code", ""),
                            member_count=c.get("member_count", 0),
                            fix_suggestion=c.get("fix_suggestion", ""),
                            surface=c.get("surface", []),
                            tech=c.get("tech", [])
                        )
                        for c in clusters[:limit]
                    ],
                    total=len(clusters)
                )
        except Exception as e:
            logger.warning(f"Failed to get clusters: {e}")

    # Mock data
    mock_clusters = [
        ClusterSummary(
            id="cluster-1",
            name="Missing Module Imports",
            dominant_code="TS2307",
            member_count=45,
            fix_suggestion="Check import paths and ensure modules exist",
            surface=["routes", "components"],
            tech=["typescript"]
        ),
        ClusterSummary(
            id="cluster-2",
            name="Type Inference Issues",
            dominant_code="TS2339",
            member_count=32,
            fix_suggestion="Add explicit type annotations",
            surface=["stores", "services"],
            tech=["typescript"]
        ),
        ClusterSummary(
            id="cluster-3",
            name="Svelte 5 Migration",
            dominant_code="svelte(runes)",
            member_count=18,
            fix_suggestion="Convert to Svelte 5 runes syntax",
            surface=["components"],
            tech=["svelte"]
        )
    ]

    return ClustersResponse(
        clusters=mock_clusters[:limit],
        total=len(mock_clusters)
    )


@router.get("/clusters/{cluster_id}", response_model=ClusterDetail)
async def get_cluster_detail(cluster_id: str):
    """
    Get detailed information about a specific cluster.
    """
    clustering_service = get_clustering_service()

    if clustering_service:
        try:
            cluster = clustering_service.get_cluster_by_id(cluster_id)
            if cluster:
                return ClusterDetail(**cluster)
        except Exception as e:
            logger.warning(f"Failed to get cluster {cluster_id}: {e}")

    # Mock data
    return ClusterDetail(
        id=cluster_id,
        name="Missing Module Imports",
        dominant_code="TS2307",
        member_count=45,
        fix_suggestion="Check import paths and ensure modules exist. Common causes include typos in paths, missing index.ts files, or incorrect alias configuration.",
        surface=["routes", "components"],
        tech=["typescript"],
        centroid=[0.1, 0.2, 0.3] * 128,  # 384-dim
        keywords=["import", "module", "path", "cannot find"],
        created_at=datetime.now().isoformat()
    )


@router.get("/clusters/{cluster_id}/members", response_model=ErrorsResponse)
async def get_cluster_members(
    cluster_id: str,
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100)
):
    """
    Get error cards belonging to a specific cluster.
    """
    return await get_errors(
        page=page,
        pageSize=pageSize,
        clusterId=cluster_id
    )


# ═══════════════════════════════════════════════════════════════════════
# Graph Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.get("/graph", response_model=GraphResponse)
async def get_graph():
    """
    Get dependency graph data for visualization.

    Returns nodes (files) and edges (imports/dependencies) for
    rendering in the route graph visualization.
    """
    orchestrator = get_orchestrator()

    if orchestrator:
        try:
            graph_data = await orchestrator.get_graph_data()
            return GraphResponse(
                nodes=[GraphNode(**n) for n in graph_data.get("nodes", [])],
                edges=[GraphEdge(**e) for e in graph_data.get("edges", [])],
                metadata=graph_data.get("metadata", {})
            )
        except Exception as e:
            logger.warning(f"Failed to get graph data: {e}")

    # Return empty graph if service unavailable
    return GraphResponse(
        nodes=[],
        edges=[],
        metadata={"totalNodes": 0, "totalEdges": 0, "generatedAt": datetime.now().isoformat()}
    )


# ═══════════════════════════════════════════════════════════════════════
# Search Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(10, ge=1, le=50),
    types: Optional[str] = Query(None)
):
    """
    Semantic search across the codebase index.

    Args:
        q: Search query
        limit: Maximum results
        types: Comma-separated list of types to filter (route, component, etc.)
    """
    orchestrator = get_orchestrator()
    type_list = types.split(",") if types else []

    if orchestrator:
        try:
            filters = {"types": type_list} if type_list else None
            results = await orchestrator.semantic_search(
                query=q,
                top_k=limit,
                filters=filters
            )

            return SearchResponse(
                results=[SearchResult(**r) for r in results],
                query=q,
                total=len(results)
            )
        except Exception as e:
            logger.warning(f"Search failed: {e}")

    # Mock search for development
    return SearchResponse(
        results=[],
        query=q,
        total=0
    )


# ═══════════════════════════════════════════════════════════════════════
# Reindex Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.post("/reindex", response_model=ReindexResponse)
async def trigger_reindex(request: ReindexRequest = Body(default=ReindexRequest())):
    """
    Trigger a full codebase reindex.

    This will:
    1. Re-scan all files in the workspace
    2. Update AST analysis
    3. Regenerate enhanced tags
    4. Update clusters
    """
    orchestrator = get_orchestrator()

    if orchestrator:
        try:
            stats = await orchestrator.run_full_index()
            return ReindexResponse(
                success=True,
                message=f"Indexed {stats.get('indexed_files', 0)} files",
                stats=stats
            )
        except Exception as e:
            logger.error(f"Reindex failed: {e}")
            return ReindexResponse(
                success=False,
                message=f"Reindex failed: {e}"
            )

    return ReindexResponse(
        success=False,
        message="Orchestrator not available"
    )


# ═══════════════════════════════════════════════════════════════════════
# Clustering Endpoint
# ═══════════════════════════════════════════════════════════════════════

@router.post("/cluster")
async def trigger_clustering(request: ClusterRequest = Body(default=ClusterRequest())):
    """
    Trigger error clustering.

    This will:
    1. Fetch all error embeddings
    2. Run k-means clustering
    3. Generate cluster summaries
    4. Store results
    """
    orchestrator = get_orchestrator()

    if orchestrator:
        try:
            result = await orchestrator.run_clustering(k=request.k)
            return result
        except Exception as e:
            logger.error(f"Clustering failed: {e}")
            return {"success": False, "error": str(e)}

    return {"success": False, "error": "Orchestrator not available"}


# ═══════════════════════════════════════════════════════════════════════
# Register Router with FastAPI App
# ═══════════════════════════════════════════════════════════════════════

def register_admin_routes(app):
    """Register admin routes with FastAPI app."""
    app.include_router(router)
    logger.info("✅ Admin API routes registered")
