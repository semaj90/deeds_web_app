"""
RAG+KAG Gateway - Unified Knowledge Plane API

This service provides:
- RAG retrieval (Qdrant + pgvector hybrid search)
- KAG expansion (knowledge graph traversal)
- LLM streaming with context
- Redis caching for embeddings and results
- Run logging for autonomous fixing feedback loop
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import orjson

from routes import rag, kag, kb, chat
from config import API_HOST, API_PORT

app = FastAPI(
    title="RAG+KAG Gateway",
    description="Unified Knowledge Plane for ACE autonomous error fixing",
    version="0.1.0"
)

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(rag.router, prefix="/rag", tags=["RAG"])
app.include_router(kag.router, prefix="/kag", tags=["KAG"])
app.include_router(kb.router, prefix="/kb", tags=["Knowledge Base"])
app.include_router(chat.router, prefix="/chat", tags=["Chat"])


@app.get("/health")
async def health():
    """Health check with service status"""
    return {
        "status": "ok",
        "service": "RAG+KAG Gateway",
        "version": "0.1.0"
    }


@app.get("/")
async def root():
    """API documentation redirect"""
    return {
        "message": "RAG+KAG Gateway API",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "rag": ["/rag/embed", "/rag/retrieve", "/rag/retrieve/hybrid"],
            "kag": ["/kag/expand", "/kag/context"],
            "kb": ["/kb/ingest", "/kb/ingest/run"],
            "chat": ["/chat", "/chat/stream"]
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
