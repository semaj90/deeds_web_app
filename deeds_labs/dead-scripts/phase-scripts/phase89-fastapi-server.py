#!/usr/bin/env python3
"""
Phase 89: FastAPI + FastMCP Streaming RAG Server
CUDA-accelerated error analysis with real-time retrieval

Features:
- FastAPI REST endpoints
- FastMCP tool integration
- Redis tensor cache
- Streaming SSE responses
- CUDA tensor operations (when available)
"""

import os
import json
import hashlib
import numpy as np
from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis.asyncio as redis
import httpx
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

# Try to import CUDA libraries
try:
    import cupy as cp
    CUDA_AVAILABLE = True
    print("✅ CUDA acceleration enabled")
except ImportError:
    CUDA_AVAILABLE = False
    print("⚠️  CUDA not available, using CPU")

# ============================================
# Configuration
# ============================================

CONFIG = {
    "redis_url": "redis://127.0.0.1:6379",
    "qdrant_url": "http://127.0.0.1:6333",
    "ollama_url": "http://127.0.0.1:11434",
    "embed_model": "embeddinggemma:latest",
    "collection": "phase89_error_chunks",
    "redis_prefix": "phase89:chunk:"
}

# Global clients
redis_client = None
qdrant_client = None
http_client = None

# ============================================
# Models
# ============================================

class QueryRequest(BaseModel):
    query: str
    top_k: int = 10
    stream: bool = False
    use_cuda: bool = True

class ChunkResult(BaseModel):
    score: float
    file: str
    start_line: int
    end_line: int
    text: str
    chunk_id: str

class QueryResponse(BaseModel):
    query: str
    results: List[ChunkResult]
    total_time_ms: float
    cuda_used: bool

# ============================================
# Startup/Shutdown (Lifespan)
# ============================================

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis_client, qdrant_client, http_client

    # Startup
    redis_client = await redis.from_url(CONFIG["redis_url"])
    qdrant_client = QdrantClient(url=CONFIG["qdrant_url"])
    http_client = httpx.AsyncClient(timeout=30.0)

    # Ensure collection exists
    try:
        qdrant_client.get_collection(CONFIG["collection"])
    except Exception:
        qdrant_client.create_collection(
            collection_name=CONFIG["collection"],
            vectors_config=VectorParams(size=768, distance=Distance.COSINE)
        )

    print("🚀 Phase 89 RAG Server started")

    yield

    # Shutdown
    await redis_client.aclose()
    await http_client.aclose()
    print("🛑 Phase 89 RAG Server stopped")

# Create FastAPI app with lifespan
app = FastAPI(title="Phase 89 RAG Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# Embedding Functions
# ============================================

async def get_embedding(text: str, cache_key: str) -> np.ndarray:
    """Get embedding with Redis caching"""

    # Check cache
    cache_full_key = f"{CONFIG['redis_prefix']}{cache_key}"
    cached = await redis_client.get(cache_full_key)

    if cached:
        # Deserialize Float32 tensor from base64
        buffer = np.frombuffer(cached, dtype=np.float32)
        return buffer

    # Generate embedding via Ollama
    response = await http_client.post(
        f"{CONFIG['ollama_url']}/api/embeddings",
        json={"model": CONFIG["embed_model"], "prompt": text}
    )
    response.raise_for_status()

    embedding = np.array(response.json()["embedding"], dtype=np.float32)

    # Cache for 7 days
    await redis_client.setex(cache_full_key, 86400 * 7, embedding.tobytes())

    return embedding

def cosine_similarity_cuda(query_vec: np.ndarray, doc_vecs: np.ndarray) -> np.ndarray:
    """CUDA-accelerated cosine similarity"""
    if CUDA_AVAILABLE:
        query_gpu = cp.asarray(query_vec)
        docs_gpu = cp.asarray(doc_vecs)

        # Normalize
        query_norm = query_gpu / cp.linalg.norm(query_gpu)
        docs_norm = docs_gpu / cp.linalg.norm(docs_gpu, axis=1, keepdims=True)

        # Dot product
        similarities = cp.dot(docs_norm, query_norm)

        return cp.asnumpy(similarities)
    else:
        # CPU fallback
        query_norm = query_vec / np.linalg.norm(query_vec)
        docs_norm = doc_vecs / np.linalg.norm(doc_vecs, axis=1, keepdims=True)
        return np.dot(docs_norm, query_norm)

# ============================================
# API Endpoints
# ============================================

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "cuda_available": CUDA_AVAILABLE,
        "services": {
            "redis": await redis_client.ping(),
            "qdrant": qdrant_client.get_collections() is not None
        }
    }

@app.post("/query", response_model=QueryResponse)
async def query_endpoint(request: QueryRequest):
    """Query error chunks with semantic search"""
    import time
    start_time = time.time()

    # Generate query embedding
    query_hash = hashlib.md5(request.query.encode()).hexdigest()
    query_embedding = await get_embedding(request.query, f"query:{query_hash}")

    # Search Qdrant
    search_results = qdrant_client.search(
        collection_name=CONFIG["collection"],
        query_vector=query_embedding.tolist(),
        limit=request.top_k,
        with_payload=True
    )

    # Format results
    results = []
    for result in search_results:
        results.append(ChunkResult(
            score=result.score,
            file=result.payload["file"],
            start_line=result.payload["start_line"],
            end_line=result.payload["end_line"],
            text=result.payload["text"],
            chunk_id=result.payload["chunk_id"]
        ))

    total_time = (time.time() - start_time) * 1000

    return QueryResponse(
        query=request.query,
        results=results,
        total_time_ms=total_time,
        cuda_used=CUDA_AVAILABLE and request.use_cuda
    )

@app.post("/query/stream")
async def query_stream(request: QueryRequest):
    """Streaming query with SSE"""

    async def generate():
        # Generate query embedding
        query_hash = hashlib.md5(request.query.encode()).hexdigest()
        query_embedding = await get_embedding(request.query, f"query:{query_hash}")

        yield f"data: {json.dumps({'status': 'searching', 'query': request.query})}\n\n"

        # Search Qdrant
        search_results = qdrant_client.search(
            collection_name=CONFIG["collection"],
            query_vector=query_embedding.tolist(),
            limit=request.top_k,
            with_payload=True
        )

        # Stream results
        for idx, result in enumerate(search_results):
            chunk_data = {
                "index": idx,
                "score": result.score,
                "file": result.payload["file"],
                "start_line": result.payload["start_line"],
                "end_line": result.payload["end_line"],
                "text": result.payload["text"]
            }
            yield f"data: {json.dumps(chunk_data)}\n\n"

        yield f"data: {json.dumps({'status': 'complete', 'total': len(search_results)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/stats")
async def stats():
    """Get pipeline statistics"""

    # Redis stats
    redis_keys = await redis_client.keys(f"{CONFIG['redis_prefix']}*")

    # Qdrant stats
    try:
        collection_info = qdrant_client.get_collection(CONFIG["collection"])
        qdrant_points = collection_info.points_count
    except Exception:
        qdrant_points = 0

    return {
        "redis_keys": len(redis_keys),
        "cached_embeddings": len([k for k in redis_keys if b'meta' not in k and b'hash' not in k]),
        "qdrant_points": qdrant_points,
        "cuda_available": CUDA_AVAILABLE
    }

@app.post("/rerank")
async def rerank(query: str, chunk_ids: List[str], use_cuda: bool = True):
    """Re-rank chunks using CUDA-accelerated cosine similarity"""

    # Get query embedding
    query_hash = hashlib.md5(query.encode()).hexdigest()
    query_embedding = await get_embedding(query, f"query:{query_hash}")

    # Get chunk embeddings from cache
    chunk_embeddings = []
    valid_chunk_ids = []

    for chunk_id in chunk_ids:
        cached = await redis_client.get(f"{CONFIG['redis_prefix']}{chunk_id}")
        if cached:
            chunk_embeddings.append(np.frombuffer(cached, dtype=np.float32))
            valid_chunk_ids.append(chunk_id)

    if not chunk_embeddings:
        raise HTTPException(status_code=404, detail="No cached embeddings found")

    # Calculate similarities
    doc_vecs = np.array(chunk_embeddings)

    if use_cuda and CUDA_AVAILABLE:
        similarities = cosine_similarity_cuda(query_embedding, doc_vecs)
    else:
        query_norm = query_embedding / np.linalg.norm(query_embedding)
        docs_norm = doc_vecs / np.linalg.norm(doc_vecs, axis=1, keepdims=True)
        similarities = np.dot(docs_norm, query_norm)

    # Sort by similarity
    ranked_indices = np.argsort(similarities)[::-1]

    return {
        "query": query,
        "ranked_chunks": [
            {
                "chunk_id": valid_chunk_ids[idx],
                "score": float(similarities[idx])
            }
            for idx in ranked_indices
        ],
        "cuda_used": use_cuda and CUDA_AVAILABLE
    }

# ============================================
# FastMCP Tool Definitions
# ============================================

@app.get("/mcp/tools")
async def mcp_tools():
    """FastMCP tool discovery"""
    return {
        "tools": [
            {
                "name": "phase89_search",
                "description": "Semantic search across error code chunks",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query"},
                        "top_k": {"type": "integer", "default": 10}
                    },
                    "required": ["query"]
                }
            },
            {
                "name": "phase89_rerank",
                "description": "Re-rank chunks with CUDA acceleration",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string"},
                        "chunk_ids": {"type": "array", "items": {"type": "string"}},
                        "use_cuda": {"type": "boolean", "default": True}
                    },
                    "required": ["query", "chunk_ids"]
                }
            }
        ]
    }

@app.post("/mcp/execute")
async def mcp_execute(tool_name: str, parameters: dict):
    """Execute FastMCP tool"""

    if tool_name == "phase89_search":
        request = QueryRequest(
            query=parameters["query"],
            top_k=parameters.get("top_k", 10)
        )
        response = await query_endpoint(request)
        return {"result": response.dict()}

    elif tool_name == "phase89_rerank":
        result = await rerank(
            parameters["query"],
            parameters["chunk_ids"],
            parameters.get("use_cuda", True)
        )
        return {"result": result}

    else:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_name}' not found")

# ============================================
# Main
# ============================================

if __name__ == "__main__":
    import sys
    import uvicorn

    # Parse args
    host = "127.0.0.1"
    port = 8090

    if "--host" in sys.argv:
        host = sys.argv[sys.argv.index("--host") + 1]
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])

    uvicorn.run(app, host=host, port=port, log_level="info")
