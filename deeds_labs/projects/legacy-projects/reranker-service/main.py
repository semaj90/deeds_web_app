"""
MiniLM CUDA Reranker Microservice
Cross-encoder legal document reranking with GPU acceleration
Integrates with Ollama for Gemma legal summarization
"""

import os
import logging
from typing import List
from contextlib import asynccontextmanager
import httpx

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer
import redis.asyncio as redis
from prometheus_client import Counter, Histogram, generate_latest
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Prometheus metrics
rerank_requests = Counter('rerank_requests_total', 'Total rerank requests')
rerank_latency = Histogram('rerank_latency_seconds', 'Rerank latency')
cache_hits = Counter('cache_hits_total', 'Cache hits')
cache_misses = Counter('cache_misses_total', 'Cache misses')

# Global state
model = None
tokenizer = None
redis_client = None
device = None
ollama_client = None


def get_ollama_endpoint() -> str:
    """Get Ollama endpoint from environment"""
    return os.getenv("OLLAMA_URL", "http://localhost:11434")


def get_ollama_model() -> str:
    """Get Ollama model name from environment"""
    return os.getenv("OLLAMA_MODEL", "gemma:7b")


class RerankRequest(BaseModel):
    query: str = Field(..., max_length=512)
    documents: List[str] = Field(..., max_items=50)
    top_k: int = Field(default=7, ge=1, le=50)


class RerankResult(BaseModel):
    document: str
    score: float
    rank: int


class RerankResponse(BaseModel):
    results: List[RerankResult]
    latency_ms: float
    cached: bool


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    global model, tokenizer, redis_client, device, ollama_client

    # Startup
    logger.info("Loading MiniLM model...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using device: {device}")

    model_name = "cross-encoder/ms-marco-MiniLM-L-12-v2"
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)
    model = model.to(device)
    model.eval()

    # Initialize Redis
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    redis_client = await redis.from_url(redis_url, decode_responses=True)
    logger.info("Redis connected")

    # Initialize Ollama client
    ollama_url = get_ollama_endpoint()
    ollama_client = httpx.AsyncClient(base_url=ollama_url, timeout=30.0)
    logger.info(f"Ollama client initialized: {ollama_url}")

    yield

    # Shutdown
    if redis_client:
        await redis_client.close()
    if ollama_client:
        await ollama_client.aclose()
    logger.info("Reranker service shutdown")


app = FastAPI(title="MiniLM Reranker", lifespan=lifespan)


def _get_cache_key(query: str, doc: str) -> str:
    """Generate cache key for query-document pair"""
    return f"rerank:{hash((query, doc)) % (10 ** 8)}"


async def _get_cached_score(query: str, doc: str) -> float | None:
    """Get cached score if available"""
    if not redis_client:
        return None

    key = _get_cache_key(query, doc)
    cached = await redis_client.get(key)

    if cached:
        cache_hits.inc()
        return float(cached)

    cache_misses.inc()
    return None


async def _cache_score(query: str, doc: str, score: float, ttl: int = 86400):
    """Cache score with TTL"""
    if not redis_client:
        return

    key = _get_cache_key(query, doc)
    await redis_client.setex(key, ttl, str(score))


@app.post("/rerank", response_model=RerankResponse)
async def rerank(request: RerankRequest) -> RerankResponse:
    """Rerank documents using MiniLM cross-encoder"""
    rerank_requests.inc()
    start_time = time.time()

    if not model or not tokenizer:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        scores = []

        # Check cache and compute scores
        for doc in request.documents:
            cached_score = await _get_cached_score(request.query, doc)

            if cached_score is not None:
                scores.append(cached_score)
            else:
                # Compute score
                with torch.no_grad():
                    inputs = tokenizer(
                        request.query,
                        doc,
                        padding=True,
                        truncation=True,
                        max_length=512,
                        return_tensors="pt"
                    ).to(device)

                    outputs = model(**inputs)
                    score = torch.sigmoid(outputs.logits[0][1]).item()
                    scores.append(score)

                    # Cache the score
                    await _cache_score(request.query, doc, score)

        # Rank and get top-k
        ranked = sorted(
            zip(request.documents, scores),
            key=lambda x: x[1],
            reverse=True
        )[:request.top_k]

        results = [
            RerankResult(
                document=doc,
                score=score,
                rank=i + 1
            )
            for i, (doc, score) in enumerate(ranked)
        ]

        latency_ms = (time.time() - start_time) * 1000

        return RerankResponse(
            results=results,
            latency_ms=latency_ms,
            cached=False
        )

    except Exception as e:
        logger.error(f"Rerank error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/rerank/batch")
async def rerank_batch(requests: List[RerankRequest]):
    """Batch rerank multiple queries"""
    results = []
    for req in requests:
        result = await rerank(req)
        results.append(result)
    return results


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device),
        "redis_connected": redis_client is not None
    }


@app.get("/metrics")
async def metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
