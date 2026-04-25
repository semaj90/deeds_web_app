"""
CouchDB Analytics API
=====================

REST endpoints for querying LLM summaries, dependency analytics,
error propagation, and GPU clusters.

Week 2 Task 4: Analytics API Endpoints

Endpoints:
    GET /api/analytics/summaries - List all LLM summaries
    GET /api/analytics/summaries/{file_path} - Get summary for specific file
    GET /api/analytics/dependencies - Dependency graph analytics
    GET /api/analytics/error-propagation - Error propagation chains
    GET /api/analytics/clusters - GPU error clusters
    GET /api/analytics/file-complexity - File complexity metrics
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.couchdb_client import get_couchdb_client

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ============================================================================
# Pydantic Models
# ============================================================================

class SummaryMetadata(BaseModel):
    """LLM summary metadata"""
    error_count: int = 0
    classes: List[str] = []
    functions: List[str] = []
    language: str = "unknown"
    lines_of_code: int = 0
    generated_at: str


class SummaryResponse(BaseModel):
    """LLM summary response"""
    file_path: str
    summary: str
    key_entities: List[str] = []
    llm_provider: str
    generated_at: str
    metadata: Optional[SummaryMetadata] = None


class DependencyNode(BaseModel):
    """Dependency graph node"""
    import_path: str
    import_count: int
    imported_by: List[str] = []


class DependencyAnalytics(BaseModel):
    """Dependency graph analytics"""
    most_imported_files: List[DependencyNode]
    total_imports: int
    total_unique_modules: int


class FileComplexity(BaseModel):
    """File complexity metrics"""
    path: str
    lines_of_code: int
    function_count: int
    class_count: int
    import_count: int
    error_count: int
    estimated_cyclomatic: int


class ErrorPropagationNode(BaseModel):
    """Error propagation graph node"""
    file_path: str
    error_count: int
    imports: List[str] = []
    imported_by: List[str] = []


class ErrorPropagation(BaseModel):
    """Error propagation analysis"""
    error_files: List[ErrorPropagationNode]
    propagation_chains: List[List[str]] = []


class ClusterResponse(BaseModel):
    """GPU error cluster response"""
    cluster_id: str
    cluster_label: str
    affected_files: List[str]
    severity: str
    first_seen: str
    last_seen: str
    occurrence_count: int
    source: str


class AnalyticsStats(BaseModel):
    """Overall analytics statistics"""
    total_files: int
    total_summaries: int
    total_clusters: int
    files_with_errors: int
    avg_complexity: float


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/summaries", response_model=List[SummaryResponse])
async def list_summaries(
    provider: Optional[str] = Query(None, description="Filter by LLM provider"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results")
):
    """
    List all LLM summaries with optional filtering

    Query Parameters:
        provider: Filter by LLM provider (e.g., 'gemma3-legal:latest')
        limit: Maximum number of results (1-500)
    """
    try:
        client = get_couchdb_client()
        summaries = []

        # Query summaries view
        if provider:
            results = client.llm_summaries.view(
                '_design/summaries/by_provider',
                key=provider,
                include_docs=True,
                limit=limit
            )
        else:
            results = client.llm_summaries.view(
                '_design/summaries/by_file',
                include_docs=True,
                limit=limit
            )

        for row in results:
            doc = row.doc if hasattr(row, 'doc') else row.value
            if doc and doc.get('type') == 'llm_summary':
                summary = SummaryResponse(
                    file_path=doc.get('file_path', ''),
                    summary=doc.get('summary', ''),
                    key_entities=doc.get('key_entities', []),
                    llm_provider=doc.get('llm_provider', ''),
                    generated_at=doc.get('generated_at', ''),
                    metadata=SummaryMetadata(**doc.get('metadata', {})) if doc.get('metadata') else None
                )
                summaries.append(summary)

        return summaries

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch summaries: {str(e)}")


@router.get("/summaries/{file_path:path}", response_model=SummaryResponse)
async def get_summary(file_path: str):
    """
    Get LLM summary for a specific file

    Path Parameters:
        file_path: Path to the file (e.g., 'backend/api/source_validation_api.py')
    """
    try:
        client = get_couchdb_client()
        summary_doc = client.get_llm_summary(file_path)

        if not summary_doc:
            raise HTTPException(status_code=404, detail=f"Summary not found for {file_path}")

        return SummaryResponse(
            file_path=summary_doc.get('file_path', file_path),
            summary=summary_doc.get('summary', ''),
            key_entities=summary_doc.get('key_entities', []),
            llm_provider=summary_doc.get('llm_provider', ''),
            generated_at=summary_doc.get('generated_at', ''),
            metadata=SummaryMetadata(**summary_doc.get('metadata', {})) if summary_doc.get('metadata') else None
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch summary: {str(e)}")


@router.get("/dependencies", response_model=DependencyAnalytics)
async def get_dependencies(
    limit: int = Query(20, ge=1, le=100, description="Top N most imported files")
):
    """
    Get dependency graph analytics

    Query Parameters:
        limit: Number of top imported files to return (1-100)
    """
    try:
        client = get_couchdb_client()

        # Query most_imported_files view with grouping
        results = client.codebase_graph.view(
            '_design/topology/most_imported_files',
            group=True,
            descending=True,
            limit=limit
        )

        nodes = []
        total_imports = 0

        for row in results:
            import_path = row.key
            import_count = row.value

            nodes.append(DependencyNode(
                import_path=import_path,
                import_count=import_count,
                imported_by=[]  # Could be populated with additional query
            ))

            total_imports += import_count

        return DependencyAnalytics(
            most_imported_files=nodes,
            total_imports=total_imports,
            total_unique_modules=len(nodes)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch dependencies: {str(e)}")


@router.get("/file-complexity", response_model=List[FileComplexity])
async def get_file_complexity(
    min_complexity: int = Query(0, description="Minimum cyclomatic complexity"),
    limit: int = Query(50, ge=1, le=500, description="Maximum results")
):
    """
    Get file complexity metrics

    Query Parameters:
        min_complexity: Filter files with complexity >= this value
        limit: Maximum number of results (1-500)
    """
    try:
        client = get_couchdb_client()

        results = client.codebase_graph.view(
            '_design/analytics/file_complexity',
            limit=limit
        )

        complexities = []

        for row in results:
            value = row.value
            cyclomatic = value.get('estimated_cyclomatic', 0)

            if cyclomatic >= min_complexity:
                complexities.append(FileComplexity(
                    path=value.get('path', ''),
                    lines_of_code=value.get('lines_of_code', 0),
                    function_count=value.get('function_count', 0),
                    class_count=value.get('class_count', 0),
                    import_count=value.get('import_count', 0),
                    error_count=value.get('error_count', 0),
                    estimated_cyclomatic=cyclomatic
                ))

        # Sort by complexity descending
        complexities.sort(key=lambda x: x.estimated_cyclomatic, reverse=True)

        return complexities

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch complexity metrics: {str(e)}")


@router.get("/error-propagation", response_model=ErrorPropagation)
async def get_error_propagation(
    limit: int = Query(20, ge=1, le=100, description="Top N error files")
):
    """
    Get error propagation analysis

    Query Parameters:
        limit: Number of top error files to analyze (1-100)
    """
    try:
        client = get_couchdb_client()

        # Query error_propagation view
        results = client.codebase_graph.view(
            '_design/analytics/error_propagation',
            limit=limit
        )

        error_files = []

        for row in results:
            value = row.value
            file_path = value.get('file', '')

            # Get file document to get imports
            doc_id = f"file:{file_path}"
            imports = []

            if doc_id in client.codebase_graph:
                file_doc = client.codebase_graph[doc_id]
                imports = file_doc.get('imports', [])

            error_files.append(ErrorPropagationNode(
                file_path=file_path,
                error_count=value.get('errors', 0),
                imports=imports,
                imported_by=[]  # Could be populated with reverse lookup
            ))

        return ErrorPropagation(
            error_files=error_files,
            propagation_chains=[]  # Could build chains from imports
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch error propagation: {str(e)}")


@router.get("/clusters", response_model=List[ClusterResponse])
async def get_clusters(
    severity: Optional[str] = Query(None, description="Filter by severity (error, warning, info)"),
    limit: int = Query(50, ge=1, le=200, description="Maximum results")
):
    """
    Get GPU error clusters with affected files

    Query Parameters:
        severity: Filter by severity level (error, warning, info)
        limit: Maximum number of results (1-200)
    """
    try:
        client = get_couchdb_client()

        # Query clusters by severity
        if severity:
            results = client.error_clusters.view(
                '_design/clusters/by_severity',
                key=severity,
                include_docs=True,
                limit=limit
            )
        else:
            results = client.error_clusters.view(
                '_design/clusters/by_size',
                descending=True,
                include_docs=True,
                limit=limit
            )

        clusters = []

        for row in results:
            doc = row.doc if hasattr(row, 'doc') else None
            if doc and doc.get('type') == 'error_cluster':
                clusters.append(ClusterResponse(
                    cluster_id=doc.get('cluster_id', ''),
                    cluster_label=doc.get('cluster_label', ''),
                    affected_files=doc.get('affected_files', []),
                    severity=doc.get('severity', 'unknown'),
                    first_seen=doc.get('first_seen', ''),
                    last_seen=doc.get('last_seen', ''),
                    occurrence_count=doc.get('occurrence_count', 0),
                    source=doc.get('source', '')
                ))

        return clusters

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch clusters: {str(e)}")


@router.get("/stats", response_model=AnalyticsStats)
async def get_analytics_stats():
    """
    Get overall analytics statistics

    Returns:
        Summary statistics for the entire codebase
    """
    try:
        client = get_couchdb_client()

        # Count total files
        total_files = 0
        files_with_errors = 0
        complexity_sum = 0
        complexity_count = 0

        for doc_id in client.codebase_graph:
            if doc_id.startswith('_design'):
                continue

            doc = client.codebase_graph[doc_id]
            if doc.get('type') == 'file':
                total_files += 1

                if doc.get('error_count', 0) > 0:
                    files_with_errors += 1

                # Estimate complexity
                metadata = doc.get('metadata', {})
                complexity = (
                    len(doc.get('functions', [])) +
                    len(doc.get('classes', [])) * 2 +
                    len(doc.get('imports', [])) // 5
                )
                complexity_sum += complexity
                complexity_count += 1

        # Count summaries
        total_summaries = sum(1 for doc_id in client.llm_summaries if not doc_id.startswith('_design'))

        # Count clusters
        total_clusters = sum(1 for doc_id in client.error_clusters if not doc_id.startswith('_design'))

        avg_complexity = complexity_sum / complexity_count if complexity_count > 0 else 0

        return AnalyticsStats(
            total_files=total_files,
            total_summaries=total_summaries,
            total_clusters=total_clusters,
            files_with_errors=files_with_errors,
            avg_complexity=round(avg_complexity, 2)
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch stats: {str(e)}")
