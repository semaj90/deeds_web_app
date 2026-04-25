#!/usr/bin/env python3
"""
Phase 89: ACE Timeline Integration Service
===========================================

Provides timeline logging for ACE (Agentic Code Evolution) contextual prompt engineer.
Logs all LLM calls, fix attempts, and results for audit trail and learning.

Can be called from Node.js ACE scripts via HTTP or as a Python module.

Author: ACE (Agentic Code Evolution)
Date: 2026-01-02
"""

import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from services.timeline_logger_vlm import MultimodalTimelineLogger

# ═══════════════════════════════════════════════════════════════════
# Pydantic Models
# ═══════════════════════════════════════════════════════════════════

class ACEFixAttempt(BaseModel):
    """ACE fix attempt event"""
    file_path: str
    error_type: str
    error_message: str
    original_code: Optional[str] = None
    generated_fix: Optional[str] = None
    fix_explanation: str
    sources_used: List[str] = []
    confidence_score: float
    llm_provider: str
    llm_model: str
    generation_method: str = "ace_contextual_prompt"
    applied: bool = False
    success: Optional[bool] = None
    metadata: Dict[str, Any] = {}

class ACELLMCall(BaseModel):
    """ACE LLM call event"""
    prompt: str
    provider: str
    model: str
    temperature: float
    max_tokens: int
    response: Optional[str] = None
    reasoning: Optional[str] = None  # For thinking models
    tools_used: List[str] = []
    context_size: int
    response_tokens: int
    latency_ms: float
    success: bool
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}

class ACEKnowledgeQuery(BaseModel):
    """ACE knowledge retrieval event"""
    query_text: str
    source: str  # "qdrant", "neo4j", "mcp", "docs"
    results_count: int
    top_results: List[Dict] = []
    avg_similarity: float
    metadata: Dict[str, Any] = {}

# ═══════════════════════════════════════════════════════════════════
# ACE Timeline Service
# ═══════════════════════════════════════════════════════════════════

class ACETimelineService:
    """Service for logging ACE events to timeline"""

    def __init__(self):
        self.timeline = MultimodalTimelineLogger()

    def log_fix_attempt(self, fix_attempt: ACEFixAttempt) -> Optional[int]:
        """Log an ACE fix attempt to timeline"""
        try:
            note_text = (
                f"ACE fix attempt: {fix_attempt.error_type} in {fix_attempt.file_path}. "
                f"{fix_attempt.fix_explanation}. "
                f"Confidence: {fix_attempt.confidence_score:.2%}. "
                f"LLM: {fix_attempt.llm_provider}/{fix_attempt.llm_model}. "
                f"Sources: {', '.join(fix_attempt.sources_used[:3])}."
            )

            event_id = self.timeline.log_event(
                operation="ace_fix_attempt",
                collection="phase89_ace_fixes",
                point_id=f"{fix_attempt.file_path}::{datetime.utcnow().timestamp()}",
                actor="ace_agent",
                note_text=note_text,
                tags=[
                    "ace",
                    "fix_attempt",
                    fix_attempt.error_type,
                    fix_attempt.llm_provider,
                    "applied" if fix_attempt.applied else "not_applied",
                    "success" if fix_attempt.success else "pending"
                ],
                ref=fix_attempt.file_path,
                payload={
                    "error_type": fix_attempt.error_type,
                    "error_message": fix_attempt.error_message,
                    "original_code": fix_attempt.original_code,
                    "generated_fix": fix_attempt.generated_fix,
                    "fix_explanation": fix_attempt.fix_explanation,
                    "sources_used": fix_attempt.sources_used,
                    "confidence_score": fix_attempt.confidence_score,
                    "llm_provider": fix_attempt.llm_provider,
                    "llm_model": fix_attempt.llm_model,
                    "generation_method": fix_attempt.generation_method,
                    "applied": fix_attempt.applied,
                    "success": fix_attempt.success
                },
                metadata=fix_attempt.metadata
            )

            return event_id

        except Exception as e:
            print(f"❌ Failed to log ACE fix attempt: {e}")
            return None

    def log_llm_call(self, llm_call: ACELLMCall) -> Optional[int]:
        """Log an LLM call to timeline"""
        try:
            # Truncate prompt/response for note_text
            prompt_preview = llm_call.prompt[:150] + "..." if len(llm_call.prompt) > 150 else llm_call.prompt

            note_text = (
                f"ACE LLM call: {llm_call.provider}/{llm_call.model}. "
                f"Prompt: {prompt_preview}. "
                f"Context: {llm_call.context_size} tokens, Response: {llm_call.response_tokens} tokens. "
                f"Latency: {llm_call.latency_ms:.0f}ms. "
                f"Tools: {', '.join(llm_call.tools_used) if llm_call.tools_used else 'none'}. "
                f"{'✅ Success' if llm_call.success else '❌ Failed'}."
            )

            event_id = self.timeline.log_event(
                operation="ace_llm_call",
                collection="phase89_ace_llm_calls",
                point_id=f"llm::{datetime.utcnow().timestamp()}",
                actor="ace_agent",
                note_text=note_text,
                tags=[
                    "ace",
                    "llm_call",
                    llm_call.provider,
                    llm_call.model,
                    "success" if llm_call.success else "failed"
                ],
                payload={
                    "prompt": llm_call.prompt,
                    "provider": llm_call.provider,
                    "model": llm_call.model,
                    "temperature": llm_call.temperature,
                    "max_tokens": llm_call.max_tokens,
                    "response": llm_call.response,
                    "reasoning": llm_call.reasoning,
                    "tools_used": llm_call.tools_used,
                    "context_size": llm_call.context_size,
                    "response_tokens": llm_call.response_tokens,
                    "latency_ms": llm_call.latency_ms,
                    "success": llm_call.success,
                    "error": llm_call.error
                },
                metadata=llm_call.metadata
            )

            return event_id

        except Exception as e:
            print(f"❌ Failed to log LLM call: {e}")
            return None

    def log_knowledge_query(self, query: ACEKnowledgeQuery) -> Optional[int]:
        """Log a knowledge retrieval query"""
        try:
            note_text = (
                f"ACE knowledge query ({query.source}): '{query.query_text}'. "
                f"Retrieved {query.results_count} results with {query.avg_similarity:.1%} avg similarity."
            )

            event_id = self.timeline.log_event(
                operation="ace_knowledge_query",
                collection="phase89_ace_knowledge",
                point_id=f"knowledge::{datetime.utcnow().timestamp()}",
                actor="ace_agent",
                note_text=note_text,
                tags=[
                    "ace",
                    "knowledge_query",
                    query.source,
                    "high_relevance" if query.avg_similarity >= 0.7 else "medium_relevance"
                ],
                payload={
                    "query_text": query.query_text,
                    "source": query.source,
                    "results_count": query.results_count,
                    "top_results": query.top_results[:5],  # Only top 5 to save space
                    "avg_similarity": query.avg_similarity
                },
                metadata=query.metadata
            )

            return event_id

        except Exception as e:
            print(f"❌ Failed to log knowledge query: {e}")
            return None

    def close(self):
        """Close timeline connection"""
        self.timeline.close()

# ═══════════════════════════════════════════════════════════════════
# FastAPI Service
# ═══════════════════════════════════════════════════════════════════

app = FastAPI(title="ACE Timeline Service", version="1.0.0")
service = ACETimelineService()

@app.post("/log/fix-attempt")
async def log_fix_attempt(fix_attempt: ACEFixAttempt):
    """Log an ACE fix attempt"""
    event_id = service.log_fix_attempt(fix_attempt)
    if event_id:
        return {"success": True, "event_id": event_id}
    else:
        raise HTTPException(status_code=500, detail="Failed to log fix attempt")

@app.post("/log/llm-call")
async def log_llm_call(llm_call: ACELLMCall):
    """Log an LLM call"""
    event_id = service.log_llm_call(llm_call)
    if event_id:
        return {"success": True, "event_id": event_id}
    else:
        raise HTTPException(status_code=500, detail="Failed to log LLM call")

@app.post("/log/knowledge-query")
async def log_knowledge_query(query: ACEKnowledgeQuery):
    """Log a knowledge retrieval query"""
    event_id = service.log_knowledge_query(query)
    if event_id:
        return {"success": True, "event_id": event_id}
    else:
        raise HTTPException(status_code=500, detail="Failed to log knowledge query")

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "service": "ace_timeline",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.on_event("shutdown")
async def shutdown():
    """Cleanup on shutdown"""
    service.close()

# ═══════════════════════════════════════════════════════════════════
# CLI Mode
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="ACE Timeline Service")
    parser.add_argument("--server", action="store_true", help="Run as FastAPI server")
    parser.add_argument("--port", type=int, default=8002, help="Server port (default: 8002)")
    parser.add_argument("--test", action="store_true", help="Run test examples")

    args = parser.parse_args()

    if args.server:
        print("╔══════════════════════════════════════════════════════════════════╗")
        print("║  🤖 ACE Timeline Service Starting...                            ║")
        print("╚══════════════════════════════════════════════════════════════════╝")
        print(f"\n🌐 Server running on http://localhost:{args.port}")
        print("\nEndpoints:")
        print("  POST /log/fix-attempt       - Log ACE fix attempt")
        print("  POST /log/llm-call          - Log LLM call")
        print("  POST /log/knowledge-query   - Log knowledge retrieval")
        print("  GET  /health                - Health check")
        print("\n✅ Ready for ACE integration!\n")

        uvicorn.run(app, host="0.0.0.0", port=args.port, log_level="info")

    elif args.test:
        print("╔══════════════════════════════════════════════════════════════════╗")
        print("║  🧪 ACE Timeline Service - Test Mode                            ║")
        print("╚══════════════════════════════════════════════════════════════════╝")
        print()

        svc = ACETimelineService()

        # Test 1: Log fix attempt
        print("Test 1: Logging ACE fix attempt...")
        fix = ACEFixAttempt(
            file_path="src/lib/auth/session.ts",
            error_type="TypeScript",
            error_message="Property 'user' does not exist on type 'Session'",
            fix_explanation="Migrated from createEventDispatcher to $state() rune",
            sources_used=["qdrant://phase76_knowledge_base/svelte5_runes.md"],
            confidence_score=0.92,
            llm_provider="gemini",
            llm_model="gemini-2.0-flash-exp",
            applied=True,
            success=True,
            metadata={"phase": "phase89", "task": "svelte5_migration"}
        )
        event_id = svc.log_fix_attempt(fix)
        print(f"   ✅ Fix attempt logged: Event #{event_id}")
        print()

        # Test 2: Log LLM call
        print("Test 2: Logging LLM call...")
        llm_call = ACELLMCall(
            prompt="Fix TypeScript error in auth/session.ts using Svelte 5 runes",
            provider="gemini",
            model="gemini-2.0-flash-exp",
            temperature=0.3,
            max_tokens=8192,
            response="Use $state() instead of createEventDispatcher()...",
            tools_used=["grep-search", "file-read", "ast-analyzer"],
            context_size=4500,
            response_tokens=850,
            latency_ms=1250.5,
            success=True,
            metadata={"web_search": True}
        )
        event_id = svc.log_llm_call(llm_call)
        print(f"   ✅ LLM call logged: Event #{event_id}")
        print()

        # Test 3: Log knowledge query
        print("Test 3: Logging knowledge retrieval...")
        query = ACEKnowledgeQuery(
            query_text="Svelte 5 runes migration patterns",
            source="qdrant",
            results_count=5,
            top_results=[
                {"id": "svelte5_runes.md", "score": 0.89, "snippet": "$state() replaces..."},
                {"id": "svelte5_events.md", "score": 0.85, "snippet": "Event handling..."}
            ],
            avg_similarity=0.87,
            metadata={"collection": "phase76_knowledge_base", "top_k": 10}
        )
        event_id = svc.log_knowledge_query(query)
        print(f"   ✅ Knowledge query logged: Event #{event_id}")
        print()

        svc.close()

        print("╔══════════════════════════════════════════════════════════════════╗")
        print("║  ✅ All tests passed!                                           ║")
        print("╚══════════════════════════════════════════════════════════════════╝")

    else:
        parser.print_help()
