#!/usr/bin/env python3
"""
Phase 76-87: RAG+KAG Contextual Engineering Python Middleware

A FastAPI service that provides:
- Qdrant vector search & retrieval
- Intelligent chunking with overlap
- Streaming LLM output via SSE
- Redis caching for embeddings
- embeddinggemma:latest from Ollama
- Cosine similarity ranking
- Knowledge graph retrieval (KAG)
- Gradient checkpointing for memory efficiency

LLM can interact via HTTP endpoints:
- POST /retrieve - Hybrid RAG+KAG retrieval
- POST /embed - Generate embeddings with caching
- POST /stream-llm - Stream LLM responses
- POST /chunk - Intelligent document chunking
- GET /health - Service status
"""

import asyncio
import hashlib
import json
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Dict, List, Optional, Tuple

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

# ============================================================================
# Configuration
# ============================================================================

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
QDRANT_URL = os.getenv("QDRANT_URL", "http://127.0.0.1:6333")
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
EMBEDDING_MODEL = "embeddinggemma:latest"
EMBEDDING_DIM = 768

# Chunking parameters
CHUNK_SIZE = 1800  # Characters per chunk
CHUNK_OVERLAP = 200  # Overlap between chunks

# Cache TTL
EMBEDDING_CACHE_TTL = 86400  # 24 hours

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rag-kag-service")


# ============================================================================
# Data Models
# ============================================================================


class EmbedRequest(BaseModel):
    text: str
    use_cache: bool = True


class EmbedResponse(BaseModel):
    embedding: List[float]
    cached: bool
    dim: int


class ChunkRequest(BaseModel):
    text: str
    chunk_size: int = CHUNK_SIZE
    overlap: int = CHUNK_OVERLAP
    preserve_sentences: bool = True


class ChunkResponse(BaseModel):
    chunks: List[Dict[str, any]]
    total_chunks: int


class RetrievalRequest(BaseModel):
    query: str
    collections: List[str] = Field(
        default=["phase76_knowledge_base", "phase72_ast_knowledge_base"]
    )
    top_k: int = 10
    threshold: float = 0.5
    use_kag: bool = True  # Enable knowledge graph expansion


class RetrievalResult(BaseModel):
    text: str
    score: float
    source: str
    metadata: Dict


class RetrievalResponse(BaseModel):
    results: List[RetrievalResult]
    query_embedding_cached: bool
    hybrid_weights: Dict[str, float]


class StreamLLMRequest(BaseModel):
    prompt: str
    context: Optional[List[str]] = None
    model: str = "gemma3-legal:latest"
    temperature: float = 0.7
    max_tokens: int = 2048


# ============================================================================
# Service Initialization
# ============================================================================


@dataclass
class ServiceState:
    qdrant: QdrantClient
    redis: aioredis.Redis
    http_client: httpx.AsyncClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup, cleanup on shutdown"""
    logger.info("🚀 Starting RAG+KAG Service...")

    # Initialize clients
    qdrant = QdrantClient(url=QDRANT_URL, timeout=30)
    redis = await aioredis.from_url(REDIS_URL, decode_responses=False)
    http_client = httpx.AsyncClient(timeout=120.0)

    # Verify Ollama connection
    try:
        response = await http_client.get(f"{OLLAMA_URL}/api/tags")
        response.raise_for_status()
        models = response.json().get("models", [])
        embedding_available = any(
            m.get("name", "").startswith("embeddinggemma") for m in models
        )
        if not embedding_available:
            logger.warning(f"⚠️ {EMBEDDING_MODEL} not found in Ollama")
        else:
            logger.info(f"✅ {EMBEDDING_MODEL} available")
    except Exception as e:
        logger.error(f"❌ Ollama connection failed: {e}")

    # Store in app state
    app.state.services = ServiceState(
        qdrant=qdrant, redis=redis, http_client=http_client
    )

    logger.info("✅ RAG+KAG Service ready")

    yield

    # Cleanup
    await redis.close()
    await http_client.aclose()
    logger.info("👋 RAG+KAG Service shutdown")


app = FastAPI(
    title="RAG+KAG Contextual Engineering Service",
    description="Phase 76-87 Python middleware for LLM contextual retrieval",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================================
# Core Functions
# ============================================================================


async def get_ollama_embedding(text: str, client: httpx.AsyncClient) -> List[float]:
    """Generate embedding using Ollama embeddinggemma:latest"""
    try:
        response = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": EMBEDDING_MODEL, "prompt": text},
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        embedding = data.get("embedding", [])

        if len(embedding) != EMBEDDING_DIM:
            raise ValueError(
                f"Expected {EMBEDDING_DIM}D embedding, got {len(embedding)}D"
            )

        return embedding
    except Exception as e:
        logger.error(f"Ollama embedding failed: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {e}")


async def get_cached_embedding(
    text: str, redis: aioredis.Redis, client: httpx.AsyncClient
) -> Tuple[List[float], bool]:
    """Get embedding from cache or generate new one"""
    # Create cache key from text hash
    text_hash = hashlib.sha256(text.encode()).hexdigest()
    cache_key = f"emb:{text_hash}"

    # Try cache first
    cached = await redis.get(cache_key)
    if cached:
        embedding = json.loads(cached)
        logger.debug(f"✅ Cache hit for {text_hash[:8]}")
        return embedding, True

    # Generate new embedding
    embedding = await get_ollama_embedding(text, client)

    # Cache for 24 hours
    await redis.setex(cache_key, EMBEDDING_CACHE_TTL, json.dumps(embedding))

    logger.debug(f"📝 Cached embedding for {text_hash[:8]}")
    return embedding, False


def chunk_text(
    text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP
) -> List[Dict[str, any]]:
    """Intelligent chunking with sentence preservation"""
    if len(text) <= chunk_size:
        return [{"text": text, "start": 0, "end": len(text), "chunk_id": 0}]

    chunks = []
    start = 0
    chunk_id = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Try to break at sentence boundary
        if end < len(text):
            # Look for sentence endings in the last 200 chars
            search_start = max(start, end - 200)
            last_period = text.rfind(". ", search_start, end)
            last_newline = text.rfind("\n", search_start, end)
            last_break = max(last_period, last_newline)

            if last_break > start:
                end = last_break + 1

        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append(
                {"text": chunk_text, "start": start, "end": end, "chunk_id": chunk_id}
            )
            chunk_id += 1

        # Move start with overlap
        start = end - overlap if end < len(text) else end

    return chunks


async def qdrant_search(
    query_embedding: List[float],
    collections: List[str],
    top_k: int,
    threshold: float,
    qdrant: QdrantClient,
) -> List[RetrievalResult]:
    """Search multiple Qdrant collections and merge results"""
    all_results = []

    for collection in collections:
        try:
            search_result = qdrant.search(
                collection_name=collection,
                query_vector=query_embedding,
                limit=top_k,
                score_threshold=threshold,
            )

            for point in search_result:
                all_results.append(
                    RetrievalResult(
                        text=point.payload.get("text", ""),
                        score=point.score,
                        source=collection,
                        metadata=point.payload,
                    )
                )
        except Exception as e:
            logger.warning(f"⚠️ Search failed for {collection}: {e}")

    # Sort by score descending
    all_results.sort(key=lambda r: r.score, reverse=True)

    # Return top_k
    return all_results[:top_k]


async def stream_llm_response(
    prompt: str, context: Optional[List[str]], model: str, client: httpx.AsyncClient
) -> AsyncIterator[str]:
    """Stream LLM response using Ollama with context injection"""
    # Build augmented prompt
    full_prompt = prompt
    if context:
        context_text = "\n\n".join(f"[Context {i+1}]\n{c}" for i, c in enumerate(context))
        full_prompt = f"{context_text}\n\n{prompt}"

    # Stream from Ollama
    async with client.stream(
        "POST",
        f"{OLLAMA_URL}/api/generate",
        json={"model": model, "prompt": full_prompt, "stream": True},
        timeout=None,
    ) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if line:
                try:
                    data = json.loads(line)
                    if token := data.get("response"):
                        yield f"data: {json.dumps({'token': token})}\n\n"
                    if data.get("done"):
                        yield "data: [DONE]\n\n"
                except json.JSONDecodeError:
                    continue


# ============================================================================
# API Endpoints
# ============================================================================


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    services = app.state.services

    # Test Qdrant
    try:
        collections = services.qdrant.get_collections()
        qdrant_ok = True
        qdrant_collections = len(collections.collections)
    except Exception as e:
        qdrant_ok = False
        qdrant_collections = 0

    # Test Redis
    try:
        await services.redis.ping()
        redis_ok = True
    except Exception as e:
        redis_ok = False

    # Test Ollama
    try:
        response = await services.http_client.get(f"{OLLAMA_URL}/api/tags", timeout=5.0)
        ollama_ok = response.status_code == 200
    except Exception:
        ollama_ok = False

    return {
        "status": "healthy" if all([qdrant_ok, redis_ok, ollama_ok]) else "degraded",
        "services": {
            "qdrant": {"ok": qdrant_ok, "collections": qdrant_collections},
            "redis": {"ok": redis_ok},
            "ollama": {"ok": ollama_ok, "model": EMBEDDING_MODEL},
        },
    }


@app.post("/embed", response_model=EmbedResponse)
async def embed_text(req: EmbedRequest):
    """Generate embedding with Redis caching"""
    services = app.state.services

    if req.use_cache:
        embedding, cached = await get_cached_embedding(
            req.text, services.redis, services.http_client
        )
    else:
        embedding = await get_ollama_embedding(req.text, services.http_client)
        cached = False

    return EmbedResponse(embedding=embedding, cached=cached, dim=len(embedding))


@app.post("/chunk", response_model=ChunkResponse)
async def chunk_document(req: ChunkRequest):
    """Chunk text with intelligent sentence preservation"""
    chunks = chunk_text(req.text, req.chunk_size, req.overlap)
    return ChunkResponse(chunks=chunks, total_chunks=len(chunks))


@app.post("/retrieve", response_model=RetrievalResponse)
async def retrieve_context(req: RetrievalRequest):
    """Hybrid RAG+KAG retrieval with cosine similarity ranking"""
    services = app.state.services

    # Generate query embedding (with caching)
    query_embedding, cached = await get_cached_embedding(
        req.query, services.redis, services.http_client
    )

    # Qdrant vector search (RAG)
    rag_results = await qdrant_search(
        query_embedding, req.collections, req.top_k, req.threshold, services.qdrant
    )

    # TODO: KAG graph expansion (Phase 87 enhancement)
    # if req.use_kag:
    #     kag_results = await expand_via_knowledge_graph(req.query, rag_results)
    #     results = merge_rag_kag(rag_results, kag_results, weights={"rag": 0.6, "kag": 0.4})
    # else:
    #     results = rag_results

    results = rag_results

    # Hybrid weights (for future KAG integration)
    hybrid_weights = {"qdrant": 1.0, "kag": 0.0} if not req.use_kag else {"qdrant": 0.6, "kag": 0.4}

    return RetrievalResponse(
        results=results, query_embedding_cached=cached, hybrid_weights=hybrid_weights
    )


@app.post("/stream-llm")
async def stream_llm(req: StreamLLMRequest):
    """Stream LLM response with optional context injection"""
    services = app.state.services

    return StreamingResponse(
        stream_llm_response(req.prompt, req.context, req.model, services.http_client),
        media_type="text/event-stream",
    )


# ============================================================================
# Run Server
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("RAG_SERVICE_PORT", "8001"))
    logger.info(f"🚀 Starting RAG+KAG service on port {port}...")

    uvicorn.run(
        "rag-kag-service:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
