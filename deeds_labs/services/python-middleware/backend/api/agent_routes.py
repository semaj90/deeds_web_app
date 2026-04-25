"""
FastAPI Routes for AutoGen + CrewAI Agents
===========================================
Exposes agentic workflows to SvelteKit frontend.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import asyncio

from backend.agents.autogen_legal_team import LegalAgentTeam, ErrorFixerAgent

router = APIRouter(prefix="/api/agents", tags=["Agentic AI"])

# Initialize agents (singleton pattern)
autogen_team = LegalAgentTeam()
error_fixer = ErrorFixerAgent()


# === Request/Response Models ===

class CaseAnalysisRequest(BaseModel):
    case_id: str
    query: str
    max_rounds: int = 20


class ErrorFixRequest(BaseModel):
    error_code: str
    file_path: str
    error_message: str
    context: str


class BatchErrorFixRequest(BaseModel):
    errors: List[Dict[str, str]]  # [{error_code, file_path, error_message, context}]
    max_concurrent: int = 5


# === AutoGen Endpoints ===

@router.post("/autogen/analyze-case")
async def autogen_analyze_case(request: CaseAnalysisRequest):
    """
    Run AutoGen multi-agent case analysis

    Agents:
    - legal_researcher: Searches case law and precedents
    - evidence_analyst: Evaluates admissibility
    - case_strategist: Synthesizes strategy

    Example:
        POST /api/agents/autogen/analyze-case
        {
            "case_id": "case-001",
            "query": "Analyze admissibility of digital forensic evidence",
            "max_rounds": 20
        }
    """
    try:
        result = await autogen_team.analyze_case(
            case_id=request.case_id,
            query=request.query,
            max_rounds=request.max_rounds,
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/autogen/fix-error")
async def autogen_fix_error(request: ErrorFixRequest):
    """
    Autonomous error fixing with AutoGen

    Workflow:
    1. Search Redis KAG for high-confidence patterns
    2. Query PostgreSQL knowledge base for similar errors
    3. Generate fix using proven pattern
    4. Return FIXED CODE + EXPLANATION + CONFIDENCE

    Example:
        POST /api/agents/autogen/fix-error
        {
            "error_code": "TS2322",
            "file_path": "src/lib/Button.svelte",
            "error_message": "Type 'number' is not assignable to type 'string'",
            "context": "let count: string = 42;"
        }
    """
    try:
        result = await error_fixer.fix_error(
            error_code=request.error_code,
            file_path=request.file_path,
            error_message=request.error_message,
            context=request.context,
        )
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/autogen/batch-fix-errors")
async def autogen_batch_fix_errors(
    request: BatchErrorFixRequest, background_tasks: BackgroundTasks
):
    """
    Batch error fixing with concurrent AutoGen agents

    Uses asyncio.gather to fix multiple errors concurrently.
    Returns immediately with task ID, polls /status for completion.

    Example:
        POST /api/agents/autogen/batch-fix-errors
        {
            "errors": [
                {"error_code": "TS2322", "file_path": "src/lib/A.svelte", ...},
                {"error_code": "TS2345", "file_path": "src/lib/B.svelte", ...}
            ],
            "max_concurrent": 5
        }
    """
    task_id = f"batch-fix-{len(request.errors)}-{asyncio.get_event_loop().time()}"

    async def batch_fix_task():
        """Background task for batch fixing"""
        results = []
        semaphore = asyncio.Semaphore(request.max_concurrent)

        async def fix_one(error):
            async with semaphore:
                return await error_fixer.fix_error(
                    error_code=error["error_code"],
                    file_path=error["file_path"],
                    error_message=error["error_message"],
                    context=error["context"],
                )

        results = await asyncio.gather(*[fix_one(e) for e in request.errors])

        # Store results (in production, use Redis/database)
        print(f"✅ Batch fix complete: {task_id}, {len(results)} fixes")
        return results

    background_tasks.add_task(batch_fix_task)

    return {
        "success": True,
        "task_id": task_id,
        "total_errors": len(request.errors),
        "message": "Batch fix started in background",
    }


# === Health Check ===

@router.get("/health")
async def health_check():
    """
    Check agent system health

    Tests:
    - AutoGen agents initialized
    - Go Knowledge Plane reachable (port 8765)
    - FastMCP server reachable (port 3003)
    """
    import httpx

    health = {
        "autogen_initialized": autogen_team is not None,
        "error_fixer_initialized": error_fixer is not None,
        "knowledge_plane_status": "unknown",
        "fastmcp_status": "unknown",
    }

    # Test Knowledge Plane
    try:
        response = httpx.get("http://localhost:8765/health", timeout=5.0)
        health["knowledge_plane_status"] = (
            "healthy" if response.status_code == 200 else "unhealthy"
        )
    except Exception:
        health["knowledge_plane_status"] = "unreachable"

    # Test FastMCP
    try:
        response = httpx.get("http://localhost:3003/health", timeout=5.0)
        health["fastmcp_status"] = (
            "healthy" if response.status_code == 200 else "unhealthy"
        )
    except Exception:
        health["fastmcp_status"] = "unreachable"

    all_healthy = all(
        [
            health["autogen_initialized"],
            health["error_fixer_initialized"],
            health["knowledge_plane_status"] == "healthy",
        ]
    )

    return {
        "success": all_healthy,
        "health": health,
        "message": "All systems operational" if all_healthy else "Some services unavailable",
    }
