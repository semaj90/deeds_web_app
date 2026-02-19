#!/usr/bin/env python3
"""
General Agent API - FastAPI endpoints for agentic sessions.

Endpoints:
  POST /api/agent/next_step - Get next action for general sessions
  POST /api/agent/record_event - Record timeline event
  GET /api/agent/timeline/{session_id} - Get timeline
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import logging

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

    _aca = AgentContextAnchor(redis_cache=redis_cache, granite_client=granite_client)
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
    _ace = AceOrchestrator(
        aca=_aca,
        phase72_ctx=None,  # not used for generic sessions
        planner=_planner,
        alignment=_alignment,
        llm_client=granite_client,
    )
    logger.info("✅ Agent API services initialized successfully")
except Exception as e:
    logger.error(f"❌ Failed to initialize Agent API services: {e}")
    _aca = None
    _planner = None
    _alignment = None
    _ace = None

router = APIRouter(prefix="/api/agent", tags=["agent"])


# ============ Request/Response Models ============


class NextStepRequest(BaseModel):
    session_id: str
    message: str
    role: str = "user"  # prosecutor / warden / admin / user
    user_id: Optional[str] = None
    default_goal: Optional[str] = None


class NextStepResponse(BaseModel):
    session_id: str
    role: str
    tool: str
    args: Dict[str, Any]
    reason: str
    raw_llm_output: str


class RecordEventRequest(BaseModel):
    session_id: str
    kind: str
    payload: Dict[str, Any] = {}
    description: str = ""


# ============ Endpoints ============


@router.post("/next_step", response_model=NextStepResponse)
def next_step(req: NextStepRequest) -> NextStepResponse:
    """Get next recommended action for general agent session."""
    if not _ace:
        raise HTTPException(
            status_code=500,
            detail="Agent services not initialized. Check logs for details."
        )

    try:
        plan = _ace.plan_general_next_action(
            session_id=req.session_id,
            user_message=req.message,
            role=req.role or "user",
            default_goal=req.default_goal or "Assist with legal search and analysis.",
            user_id=req.user_id,
        )
    except Exception as e:
        logger.error(f"ACE error in next_step: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"ACE error: {str(e)}")

    return NextStepResponse(
        session_id=req.session_id,
        role=req.role or "user",
        tool=plan["tool"],
        args=plan["args"],
        reason=plan["reason"],
        raw_llm_output=plan["raw_llm_output"],
    )


@router.post("/record_event")
def record_event(req: RecordEventRequest):
    """Record a general agent timeline event."""
    if not _aca:
        raise HTTPException(
            status_code=500,
            detail="Agent services not initialized"
        )

    try:
        _aca.append_timeline(
            session_id=req.session_id,
            kind=req.kind,
            payload=req.payload,
            description=req.description
        )
        return {"status": "recorded", "session_id": req.session_id}
    except Exception as e:
        logger.error(f"Error recording event: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/timeline/{session_id}")
def get_timeline(session_id: str):
    """Get agent timeline for a session."""
    if not _aca:
        raise HTTPException(
            status_code=500,
            detail="Agent services not initialized"
        )

    try:
        timeline = _aca.get_timeline(session_id)
        return {"session_id": session_id, "events": timeline}
    except Exception as e:
        logger.error(f"Error getting timeline: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
