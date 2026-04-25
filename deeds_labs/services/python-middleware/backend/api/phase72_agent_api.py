#!/usr/bin/env python3
"""
Phase 72 Agent API - FastAPI endpoints for AST error reduction agent.

Endpoints:
  POST /api/phase72/next_step - Get next action for error reduction
  POST /api/phase72/record_event - Record timeline event
  GET /api/phase72/timeline/{session_id} - Get timeline
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

from backend.services.phase72_agent_context import Phase72AgentContext
from backend.services.agent_context import AgentContextAnchor
from backend.services.agent_planner import AgentPlanner
from backend.services.alignment_router import AlignmentRouter
from backend.services.ace_orchestrator import AceOrchestrator
from backend.services.redis_cache import RedisCache
from backend.services.granite_client import GraniteClient
from backend.services.legal_complaint_ingestion import CFG

logger = logging.getLogger(__name__)

# Initialize services with proper dependencies
try:
    redis_cache = RedisCache(CFG.redis_url)
    granite_client = GraniteClient({
        "ollama_url": CFG.ollama_url,
        "ollama_model": "gemma3:latest"
    })

    # Initialize both general and Phase72 ACA
    _aca = AgentContextAnchor(redis_cache=redis_cache, granite_client=granite_client)
    _phase72_ctx = Phase72AgentContext(redis_cache=redis_cache, granite_client=granite_client)

    # Initialize planner and alignment router
    _planner = AgentPlanner(
        redis_url=CFG.redis_url,
        granite_config={"ollama_url": CFG.ollama_url, "ollama_model": "gemma3:latest"},
        neo4j_config={
            "uri": CFG.neo4j_uri,
            "user": CFG.neo4j_user,
            "password": CFG.neo4j_password,
        },
    )
    _alignment = AlignmentRouter(
        redis_cache=redis_cache,
        neo4j_uri=CFG.neo4j_uri,
        neo4j_user=CFG.neo4j_user,
        neo4j_password=CFG.neo4j_password,
    )

    # Initialize ACE orchestrator
    _ace = AceOrchestrator(
        aca=_aca,
        phase72_ctx=_phase72_ctx,
        planner=_planner,
        alignment=_alignment,
        llm_client=granite_client,
    )

    logger.info("✅ Phase72 Agent API services initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Phase72 Agent API services: {e}")
    _aca = None
    _phase72_ctx = None
    _planner = None
    _alignment = None
    _ace = None

router = APIRouter(prefix="/api/phase72", tags=["phase72-agent"])


# ============ Request/Response Models ============


class Phase72NextStepRequest(BaseModel):
    session_id: str  # e.g. "phase72:deeds-web-app:main"
    message: str  # e.g. "what should I fix next?"
    role: str = "warden"  # prosecutor / warden / admin
    default_goal: Optional[str] = None


class Phase72NextStepResponse(BaseModel):
    session_id: str
    role: str
    tool: str
    args: Dict[str, Any]
    reason: str
    raw_llm_output: str
    aca_marker: Optional[str] = None


class Phase72RecordEventRequest(BaseModel):
    session_id: str
    kind: str  # e.g. "svelte-check", "cluster-formed", "patch-applied"
    payload: Dict[str, Any] = {}
    description: str = ""


# ============ Endpoints ============


@router.post("/next_step", response_model=Phase72NextStepResponse)
def next_step(req: Phase72NextStepRequest) -> Phase72NextStepResponse:
    """
    Get next recommended action for Phase 72 error reduction.

    This is the core "what should I fix next?" endpoint for the CLI.
    Uses ACE (Agentic Control Engine) to orchestrate ACA + tools + knowledge store.
    """
    if not _ace:
        raise HTTPException(
            status_code=500,
            detail="Phase72 services not initialized. Check logs for details."
        )

    try:
        plan = _ace.plan_phase72_next_action(
            session_id=req.session_id,
            user_message=req.message,
            role=req.role or "warden",
            default_goal=(
                req.default_goal
                or "Reduce TypeScript errors and stabilize the codebase."
            ),
        )

        # Get ACA context for marker
        aca_ctx = _phase72_ctx.ensure_summaries(req.session_id, req.default_goal or "")

        return Phase72NextStepResponse(
            session_id=req.session_id,
            role=req.role or "warden",
            tool=plan["tool"],
            args=plan["args"],
            reason=plan["reason"],
            raw_llm_output=plan["raw_llm_output"],
            aca_marker=aca_ctx.get("latent_marker"),
        )
    except Exception as e:
        logger.error(f"Phase72 ACE error in next_step: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Phase72 ACE error: {str(e)}")


@router.post("/record_event")
def record_event(req: Phase72RecordEventRequest):
    """Record a Phase 72 timeline event."""
    if not _phase72_ctx:
        raise HTTPException(
            status_code=500,
            detail="Phase72 services not initialized"
        )

    try:
        _phase72_ctx.append_timeline(
            req.session_id,
            req.kind,
            req.payload,
            req.description
        )
        return {"status": "recorded", "session_id": req.session_id}
    except Exception as e:
        logger.error(f"Error recording Phase72 event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/{session_id}")
def get_timeline(session_id: str):
    """Get Phase 72 timeline for a session."""
    if not _phase72_ctx:
        raise HTTPException(
            status_code=500,
            detail="Phase72 services not initialized"
        )

    try:
        timeline = _phase72_ctx.get_timeline(session_id)
        summary = _phase72_ctx.ensure_summaries(session_id, "")["summary_text"]
        return {
            "session_id": session_id,
            "events": timeline,
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Error getting Phase72 timeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
