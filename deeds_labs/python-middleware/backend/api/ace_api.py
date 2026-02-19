"""
ACE System API Endpoints.

FastAPI routes for the Agentic Context Engineering pipeline:
- Web Crawl
- VLM Processing
- Graph Building
- Vector Indexing
- LLM Analysis
- Error Auto-Fixing
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import logging

from services.ace.agentic_error_fixer import get_error_fixer, ErrorSeverity, ErrorType

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ace", tags=["ACE System"])


class PipelineRequest(BaseModel):
    """Request model for pipeline execution."""
    routes: List[str] = []
    stages: Optional[List[str]] = None  # Run specific stages only


class ErrorFixRequest(BaseModel):
    """Request model for error fixing."""
    error_id: str


class PipelineResponse(BaseModel):
    """Response model for pipeline results."""
    success: bool
    routes_processed: int = 0
    errors_detected: int = 0
    auto_fixable: int = 0
    stages: Dict[str, Any] = {}
    error: Optional[str] = None


class StatusResponse(BaseModel):
    """Response model for pipeline status."""
    is_running: bool
    stages: Dict[str, Any]
    errors: Dict[str, int]


@router.post("/run-pipeline", response_model=PipelineResponse)
async def run_pipeline(request: PipelineRequest, background_tasks: BackgroundTasks):
    """
    Run the complete ACE pipeline.

    Stages:
    1. Web Crawl - Collect route data and screenshots
    2. VLM Process - Vision Language Model analysis
    3. Graph Build - Knowledge graph construction
    4. Vector Index - Qdrant embedding storage
    5. LLM Analyze - AI-powered error detection
    """
    fixer = get_error_fixer()

    if not request.routes:
        # Default to sample routes if none provided
        request.routes = [
            "/", "/cases", "/evidence", "/demo/ai-assistant",
            "/api/ai/analyze", "/demo/vector-search"
        ]

    try:
        result = await fixer.run_pipeline(request.routes)
        return PipelineResponse(**result)
    except Exception as e:
        logger.error(f"Pipeline execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status", response_model=StatusResponse)
async def get_status():
    """Get current pipeline status and error summary."""
    fixer = get_error_fixer()
    return StatusResponse(**fixer.get_status())


@router.get("/errors")
async def get_errors(
    severity: Optional[str] = None,
    error_type: Optional[str] = None,
    fixed: Optional[bool] = None,
    auto_fixable: Optional[bool] = None,
):
    """
    Get detected errors with optional filtering.

    Query params:
    - severity: critical, high, medium, low
    - error_type: syntax, runtime, ui, accessibility, performance
    - fixed: true/false
    - auto_fixable: true/false
    """
    fixer = get_error_fixer()
    errors = fixer.detected_errors

    # Apply filters
    if severity:
        try:
            sev = ErrorSeverity(severity)
            errors = [e for e in errors if e.severity == sev]
        except ValueError:
            pass

    if error_type:
        try:
            et = ErrorType(error_type)
            errors = [e for e in errors if e.error_type == et]
        except ValueError:
            pass

    if fixed is not None:
        errors = [e for e in errors if e.fixed == fixed]

    if auto_fixable is not None:
        errors = [e for e in errors if e.auto_fixable == auto_fixable]

    return {
        "total": len(errors),
        "errors": [
            {
                "id": e.id,
                "route": e.route,
                "type": e.error_type.value,
                "severity": e.severity.value,
                "message": e.message,
                "suggestion": e.suggestion,
                "auto_fixable": e.auto_fixable,
                "fixed": e.fixed,
                "confidence": e.confidence,
                "detected_at": e.detected_at.isoformat(),
            }
            for e in errors
        ],
    }


@router.post("/fix-error")
async def fix_error(request: ErrorFixRequest):
    """Attempt to auto-fix a specific error."""
    fixer = get_error_fixer()

    success = await fixer.auto_fix_error(request.error_id)

    if not success:
        raise HTTPException(
            status_code=400,
            detail="Error not found or not auto-fixable"
        )

    return {"success": True, "error_id": request.error_id, "message": "Error fixed successfully"}


@router.post("/fix-all")
async def fix_all_errors():
    """Fix all auto-fixable errors."""
    fixer = get_error_fixer()

    fixed_count = await fixer.fix_all_auto_fixable()

    return {
        "success": True,
        "fixed_count": fixed_count,
        "remaining": sum(1 for e in fixer.detected_errors if not e.fixed),
    }


@router.post("/web-crawl")
async def run_web_crawl(request: PipelineRequest):
    """Run only the web crawl stage."""
    fixer = get_error_fixer()
    fixer.routes = request.routes or ["/"]

    await fixer._run_web_crawl()

    return {
        "success": True,
        "stage": "web_crawl",
        "results": fixer.stages["web_crawl"].results,
    }


@router.post("/vlm-process")
async def run_vlm_process(request: PipelineRequest):
    """Run only the VLM processing stage."""
    fixer = get_error_fixer()
    fixer.routes = request.routes or ["/"]

    await fixer._run_vlm_process()

    return {
        "success": True,
        "stage": "vlm_process",
        "results": fixer.stages["vlm_process"].results,
    }


@router.post("/graph-build")
async def run_graph_build(request: PipelineRequest):
    """Run only the graph building stage."""
    fixer = get_error_fixer()
    fixer.routes = request.routes or ["/"]

    await fixer._run_graph_build()

    return {
        "success": True,
        "stage": "graph_build",
        "results": fixer.stages["graph_build"].results,
    }


@router.post("/vector-index")
async def run_vector_index(request: PipelineRequest):
    """Run only the vector indexing stage."""
    fixer = get_error_fixer()
    fixer.routes = request.routes or ["/"]

    await fixer._run_vector_index()

    return {
        "success": True,
        "stage": "vector_index",
        "results": fixer.stages["vector_index"].results,
    }


@router.post("/llm-analyze")
async def run_llm_analyze(request: PipelineRequest):
    """Run only the LLM analysis stage."""
    fixer = get_error_fixer()
    fixer.routes = request.routes or ["/"]

    await fixer._run_llm_analyze()

    return {
        "success": True,
        "stage": "llm_analyze",
        "results": fixer.stages["llm_analyze"].results,
        "errors_detected": len(fixer.detected_errors),
    }
