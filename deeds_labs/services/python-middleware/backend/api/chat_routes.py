"""
Chat API Routes: FastAPI endpoints for chat functionality

Endpoints:
- POST /api/chat/message - Send message and get streaming response
- GET /api/chat/history/{case_id} - Get conversation history
- GET /api/chat/stream/{message_id} - Stream response events
- GET /api/chat/evidence/{case_id} - Get evidence memory
- DELETE /api/chat/history/{case_id} - Delete conversation
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette import EventSourceResponse

from backend.chat_service import ChatService, get_chat_service
from backend.gemma_service import GemmaService, get_gemma_service
from backend.legal_guardrails import LegalGuardrails, get_guardrails
from backend.evidence_context import ContextInjector, get_context_injector
from backend.evidence_memory import EvidenceMemory, get_evidence_memory

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatMessageRequest(BaseModel):
    """Chat message request"""
    case_id: str
    user_id: str
    message: str
    role: str = "user"  # "user", "prosecutor", "detective"


class ChatMessageResponse(BaseModel):
    """Chat message response"""
    message_id: str
    status: str
    stream_url: str


@router.post("/message")
async def send_message(request: ChatMessageRequest) -> ChatMessageResponse:
    """Send chat message and get streaming response"""
    try:
        # Validate input
        if not request.message or len(request.message.strip()) == 0:
            raise HTTPException(status_code=400, detail="Message cannot be empty")

        if len(request.message) > 5000:
            raise HTTPException(status_code=400, detail="Message too long (max 5000 chars)")

        # Get services
        chat_service = await get_chat_service()
        gemma_service = await get_gemma_service()
        guardrails = await get_guardrails()
        context_injector = await get_context_injector()
        evidence_memory = await get_evidence_memory()

        # Store user message
        logger.info(f"Storing user message for case {request.case_id}")
        user_msg = await chat_service.store_message(
            case_id=request.case_id,
            user_id=request.user_id,
            role=request.role,
            content=request.message,
        )

        # Get context window
        context_window = await chat_service.get_context_window(request.case_id)

        # Get evidence context
        evidence_context, evidence_results = await context_injector.get_evidence_context_for_query(
            query=request.message,
            context_window=context_window,
            top_k=3,
        )

        # Track evidence references
        for result in evidence_results:
            await evidence_memory.add_evidence(
                case_id=request.case_id,
                chunk_id=result.get("chunk_id", ""),
                doc_id=result.get("doc_id", ""),
                relevance_score=result.get("relevance_score", 0),
            )

        # Format prompt
        prompt = await gemma_service.format_prompt(
            query=request.message,
            context_window=context_window,
            evidence_context=evidence_context,
        )

        logger.info(f"✅ Prepared prompt for streaming ({len(prompt)} chars)")

        return ChatMessageResponse(
            message_id=user_msg.id,
            status="streaming",
            stream_url=f"/api/chat/stream/{user_msg.id}",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream/{message_id}")
async def stream_response(message_id: str):
    """Stream chat response via SSE"""
    try:
        gemma_service = await get_gemma_service()
        chat_service = await get_chat_service()
        guardrails = await get_guardrails()

        # Get the user message
        # (In production, would retrieve from database)

        async def event_generator():
            try:
                # Generate streaming response
                full_response = ""

                async for token in gemma_service.stream_response(""):
                    full_response += token

                    # Emit token event
                    yield f"event: token\n"
                    yield f"data: {json.dumps({'token': token})}\n\n"

                # Apply guardrails
                response_with_guardrails, guardrail_info = await guardrails.apply_guardrails(
                    full_response
                )

                # Store assistant message
                # (In production, would store in database)

                # Emit done event
                yield f"event: done\n"
                yield f"data: {json.dumps({
                    'message_id': message_id,
                    'full_response': response_with_guardrails,
                    'guardrails': guardrail_info,
                })}\n\n"

            except Exception as e:
                logger.error(f"Error in stream: {e}")
                yield f"event: error\n"
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return EventSourceResponse(event_generator())

    except Exception as e:
        logger.error(f"Stream error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{case_id}")
async def get_history(case_id: str, limit: int = Query(10, ge=1, le=100)) -> Dict:
    """Get conversation history"""
    try:
        chat_service = await get_chat_service()

        messages = await chat_service.get_conversation_history(case_id, limit)

        return {
            "case_id": case_id,
            "message_count": len(messages),
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "timestamp": msg.timestamp.isoformat(),
                    "evidence_references": msg.evidence_references,
                    "citations": msg.citations,
                }
                for msg in messages
            ],
        }

    except Exception as e:
        logger.error(f"Error getting history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/evidence/{case_id}")
async def get_evidence(case_id: str, limit: int = Query(10, ge=1, le=100)) -> Dict:
    """Get evidence memory for case"""
    try:
        evidence_memory = await get_evidence_memory()

        evidence_list = await evidence_memory.get_evidence(case_id, limit)
        scores = await evidence_memory.score_evidence(case_id)
        clusters = await evidence_memory.cluster_evidence(case_id)
        timeline = await evidence_memory.get_timeline(case_id)

        return {
            "case_id": case_id,
            "evidence_count": len(evidence_list),
            "evidence": [
                {
                    "chunk_id": e.chunk_id,
                    "doc_id": e.doc_id,
                    "relevance_score": e.relevance_score,
                    "reference_count": e.reference_count,
                    "last_referenced": e.last_referenced.isoformat(),
                }
                for e in evidence_list
            ],
            "scores": scores,
            "clusters": clusters,
            "timeline": timeline,
        }

    except Exception as e:
        logger.error(f"Error getting evidence: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/history/{case_id}")
async def delete_history(case_id: str) -> Dict:
    """Delete conversation history"""
    try:
        chat_service = await get_chat_service()
        evidence_memory = await get_evidence_memory()

        # Delete conversation
        await chat_service.delete_conversation(case_id)

        # Clear evidence memory
        await evidence_memory.clear_evidence(case_id)

        return {
            "status": "success",
            "case_id": case_id,
            "message": "Conversation deleted",
        }

    except Exception as e:
        logger.error(f"Error deleting history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check() -> Dict:
    """Health check endpoint"""
    try:
        chat_service = await get_chat_service()
        gemma_service = await get_gemma_service()

        return {
            "status": "healthy",
            "chat_service": "ready",
            "gemma_service": "ready" if gemma_service.model else "loading",
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        raise HTTPException(status_code=503, detail="Service unavailable")
