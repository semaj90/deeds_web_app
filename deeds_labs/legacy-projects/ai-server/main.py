# FastAPI Evidence AI Assistant Server
# WebSocket streaming + File upload + Vector search + Workflow orchestration

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import asyncio
import os
import tempfile
from datetime import datetime
from typing import Optional, List
import uuid

# Import our modules
from types import EvidenceFile, SearchQuery, SearchResult, AISuggestion, StreamingUpdate
from storage import upload_file as minio_upload, get_file_url, list_files
from cache import (
    cache_embedding, get_cached_embedding,
    cache_analysis, get_cached_analysis,
    redis_health
)
from db import (
    store_embedding_dual, search_similar_pg, search_similar_qdrant,
    init_pgvector
)
from ai_inference import (
    ai_stream_with_fallback, generate_embedding,
    chat_completion, ai_health
)
from workflow import (
    workflow_orchestrator, process_evidence_workflow
)

# Initialize FastAPI app
app = FastAPI(
    title="Evidence AI Assistant",
    description="AI-powered legal evidence processing with streaming, vector search, and workflow orchestration",
    version="1.0.0"
)

# CORS middleware for SvelteKit frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup event
@app.on_event("startup")
async def startup():
    """Initialize services on startup"""
    print("🚀 Starting Evidence AI Assistant Server...")

    # Initialize PostgreSQL + PGVector
    await init_pgvector()

    print("✅ Server ready on http://localhost:8000")


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    redis_status = redis_health()
    ai_status = await ai_health()

    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "redis": redis_status,
            "ai": ai_status
        }
    }


# File upload endpoint
@app.post("/api/upload")
async def upload_evidence(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    case_id: Optional[str] = Form(None)
):
    """
    Upload evidence file and start processing workflow

    Returns:
        dict: Upload status and file_id for tracking
    """
    try:
        # Generate file ID
        file_id = f"evidence_{uuid.uuid4().hex[:12]}"

        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Start async processing workflow
        asyncio.create_task(
            process_evidence_workflow(file_id, user_id, file.filename, tmp_path)
        )

        return {
            "success": True,
            "file_id": file_id,
            "filename": file.filename,
            "message": "Processing started",
            "timestamp": datetime.utcnow().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Search endpoint
@app.post("/api/search")
async def search_evidence(query: SearchQuery):
    """
    Multi-modal search: fuzzy + vector search + AI suggestions

    Args:
        query: SearchQuery with text, user_id, filters

    Returns:
        dict: Search results and AI suggestions
    """
    try:
        results = []

        # Generate embedding for vector search
        if query.use_vector:
            embedding = query.embedding
            if not embedding:
                embedding = await generate_embedding(query.query)

            # Search in PGVector
            pg_results = await search_similar_pg(embedding, query.user_id, query.limit)

            # Search in Qdrant
            qdrant_results = search_similar_qdrant(embedding, query.user_id, query.limit)

            # Combine results
            for result in pg_results:
                results.append(SearchResult(
                    id=result["file_id"],
                    filename=result["metadata"].get("filename", "Unknown"),
                    snippet=result["metadata"].get("summary", ""),
                    tags=result["metadata"].get("tags", []),
                    vector_score=result["similarity"]
                ))

        # Generate AI suggestions for top results
        suggestions = []
        if results[:5]:
            prompt = f"Given these documents: {', '.join([r.filename for r in results[:5]])}\n\nProvide insights for: {query.query}"

            ai_response = await chat_completion([
                {"role": "user", "content": prompt}
            ])

            for result in results[:5]:
                suggestions.append(AISuggestion(
                    file_id=result.id,
                    snippet=result.snippet[:200],
                    suggested_tags=result.tags,
                    insight=ai_response.get("text", "")[:200],
                    score=result.vector_score or 0.0,
                    relevance=result.vector_score or 0.0
                ))

        return {
            "success": True,
            "results": [r.dict() for r in results],
            "suggestions": [s.dict() for s in suggestions],
            "total": len(results)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Workflow status endpoint
@app.get("/api/workflow/{file_id}")
async def get_workflow_status(file_id: str):
    """Get workflow processing status"""
    status = workflow_orchestrator.get_workflow_status(file_id)

    if not status:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return status


# List workflows endpoint
@app.get("/api/workflows")
async def list_workflows():
    """List all active workflows"""
    workflows = workflow_orchestrator.list_active_workflows()
    return {"workflows": workflows, "total": len(workflows)}


# WebSocket endpoint for real-time streaming
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket for real-time AI streaming and workflow updates

    Client sends: {"type": "QUERY", "query": str, "context": []}
    Server sends: {"type": "TOKEN", "token": str} | {"type": "COMPLETE"}
    """
    await websocket.accept()
    print(f"[WebSocket] 🔌 Client connected")

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            message_type = data.get("type")

            if message_type == "QUERY":
                query = data.get("query", "")
                context = data.get("context", [])
                file_id = data.get("file_id")

                # Stream AI response
                async for chunk in ai_stream_with_fallback(
                    prompt=query,
                    system_prompt="You are a legal AI assistant analyzing evidence.",
                    temperature=0.7
                ):
                    await websocket.send_json({
                        "type": "TOKEN",
                        "token": chunk["token"],
                        "source": chunk["source"],
                        "file_id": file_id
                    })

                # Send completion
                await websocket.send_json({"type": "COMPLETE", "file_id": file_id})

            elif message_type == "SUBSCRIBE_WORKFLOW":
                file_id = data.get("file_id")
                await websocket.send_json({
                    "type": "SUBSCRIBED",
                    "file_id": file_id
                })

            elif message_type == "PING":
                await websocket.send_json({"type": "PONG", "timestamp": datetime.utcnow().timestamp()})

    except WebSocketDisconnect:
        print(f"[WebSocket] 🔌 Client disconnected")
    except Exception as e:
        print(f"[WebSocket] ❌ Error: {e}")
        await websocket.close()


# Analysis endpoint (cached)
@app.get("/api/analysis/{file_id}")
async def get_analysis(file_id: str):
    """Get cached analysis result"""
    # Check cache first
    cached = get_cached_analysis(file_id)
    if cached:
        return {"success": True, "analysis": cached, "cached": True}

    # Check workflow status
    workflow = workflow_orchestrator.get_workflow_status(file_id)
    if workflow and workflow.get("result"):
        return {"success": True, "analysis": workflow["result"], "cached": False}

    raise HTTPException(status_code=404, detail="Analysis not found")


# Embedding endpoint
@app.post("/api/embed")
async def embed_text(text: str):
    """Generate embedding for text"""
    try:
        embedding = await generate_embedding(text)
        return {
            "success": True,
            "embedding": embedding,
            "dimensions": len(embedding)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    # Run server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
