"""
ACE Agent API - Autonomous Coding Engine endpoints
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List

from backend.services.ace_orchestrator import ace_orchestrator
from backend.services.tool_router import tool_router

router = APIRouter(prefix="/api/ace", tags=["ace"])

# Request/Response models
class PlanRequest(BaseModel):
    session_id: str
    message: str
    role: str = "warden"
    context: Optional[Dict[str, Any]] = None

class PlanResponse(BaseModel):
    session_id: str
    tool: str
    args: Dict[str, Any]
    reasoning: str
    aca_marker: str
    raw_llm_output: str

class ExecuteRequest(BaseModel):
    session_id: str
    tool: str
    args: Dict[str, Any]

class ExecuteResponse(BaseModel):
    success: bool
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    tool: str
    args: Dict[str, Any]

class PlanAndExecuteRequest(BaseModel):
    session_id: str
    message: str
    role: str = "warden"
    context: Optional[Dict[str, Any]] = None

class PlanAndExecuteResponse(BaseModel):
    session_id: str
    tool: str
    args: Dict[str, Any]
    reasoning: str
    aca_marker: str
    raw_llm_output: str
    executed: bool
    execution_result: Dict[str, Any]

class ToolListResponse(BaseModel):
    tools: Dict[str, str]
    count: int

class SessionSummaryResponse(BaseModel):
    session_id: str
    goal: str
    progress: float
    actions_taken: int
    last_action: Optional[Dict[str, Any]]
    created_at: str

# Endpoints

@router.get("/tools", response_model=ToolListResponse)
async def list_tools():
    """List all available ACE tools"""
    tools = tool_router.list_tools()
    return ToolListResponse(tools=tools, count=len(tools))

@router.post("/plan", response_model=PlanResponse)
async def plan_action(req: PlanRequest):
    """Plan the next action without executing"""
    try:
        plan = await ace_orchestrator.plan_next_action(
            session_id=req.session_id,
            user_message=req.message,
            role=req.role,
            context=req.context
        )
        return PlanResponse(**plan)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/execute", response_model=ExecuteResponse)
async def execute_action(req: ExecuteRequest):
    """Execute a planned action"""
    try:
        result = await ace_orchestrator.execute_action(
            session_id=req.session_id,
            tool=req.tool,
            args=req.args
        )
        return ExecuteResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/plan-and-execute", response_model=PlanAndExecuteResponse)
async def plan_and_execute(req: PlanAndExecuteRequest):
    """Plan and execute in one call"""
    try:
        result = await ace_orchestrator.plan_and_execute(
            session_id=req.session_id,
            user_message=req.message,
            role=req.role,
            context=req.context
        )
        return PlanAndExecuteResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/session/{session_id}", response_model=SessionSummaryResponse)
async def get_session(session_id: str):
    """Get session summary"""
    try:
        summary = ace_orchestrator.get_session_summary(session_id)
        return SessionSummaryResponse(**summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/session/{session_id}/reset")
async def reset_session(session_id: str):
    """Reset session state"""
    if session_id in ace_orchestrator.sessions:
        del ace_orchestrator.sessions[session_id]
    return {"success": True, "session_id": session_id}
