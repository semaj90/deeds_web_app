from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import httpx
import redis.asyncio as redis
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
import asyncpg
import os
import json
import hashlib
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Legal AI RAG Orchestrator",
    description="Unified RAG pipeline with vector search, LLM generation, and web scraping",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration from environment
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/2")
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
POSTGRES_URL = os.getenv("POSTGRES_URL", "postgresql://legal_admin:123456@postgres:5432/legal_ai_db")
LLM_URL = os.getenv("LLM_URL", "http://localhost:11434")
EMBEDDING_URL = os.getenv("EMBEDDING_URL", "http://fastapi-embed:8000")
LANGEXTRACT_URL = os.getenv("LANGEXTRACT_URL", "http://langextract:8090")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "legal_documents")
TOP_K = int(os.getenv("TOP_K", "10"))
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.7"))
ENABLE_RERANKING = os.getenv("ENABLE_RERANKING", "true").lower() == "true"
ENABLE_WEB_SEARCH = os.getenv("ENABLE_WEB_SEARCH", "true").lower() == "true"

# Global clients
redis_client: Optional[redis.Redis] = None
qdrant_client: Optional[QdrantClient] = None
db_pool: Optional[asyncpg.Pool] = None

# Pydantic models
class EmbedRequest(BaseModel):
    text: str
    model: Optional[str] = "embeddinggemma:latest"

class RAGQuery(BaseModel):
    query: str
    top_k: Optional[int] = TOP_K
    filters: Optional[Dict[str, Any]] = None
    enable_web_search: Optional[bool] = ENABLE_WEB_SEARCH
    context_window: Optional[int] = 4096
    model: Optional[str] = "gemma3:legal:latest"

class RAGResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    metadata: Dict[str, Any]

class Document(BaseModel):
    id: str
    text: str
    metadata: Dict[str, Any]

@app.on_event("startup")
async def startup_event():
    """Initialize connections to all services."""
    global redis_client, qdrant_client, db_pool
    
    try:
        # Connect to Redis
        redis_client = await redis.from_url(REDIS_URL, decode_responses=True)
        logger.info("✓ Connected to Redis")
        
        # Connect to Qdrant
        qdrant_client = QdrantClient(url=QDRANT_URL)
        
        # Ensure collection exists
        try:
            qdrant_client.get_collection(COLLECTION_NAME)
            logger.info(f"✓ Collection {COLLECTION_NAME} exists")
        except:
            logger.info(f"Creating collection {COLLECTION_NAME}...")
            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=768, distance=Distance.COSINE)
            )
            logger.info(f"✓ Collection {COLLECTION_NAME} created")
        
        # Connect to PostgreSQL
        db_pool = await asyncpg.create_pool(POSTGRES_URL, min_size=2, max_size=10)
        logger.info("✓ Connected to PostgreSQL")
        
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up connections."""
    if redis_client:
        await redis_client.close()
    if db_pool:
        await db_pool.close()
    logger.info("✓ Connections closed")

async def get_embedding(text: str, model: str = "embeddinggemma:latest") -> List[float]:
    """Get embedding from FastAPI embedding service."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{EMBEDDING_URL}/embed",
                json={"text": text, "model": model}
            )
            response.raise_for_status()
            result = response.json()
            return result.get("embedding", [])
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        # Fallback to zeros if embedding fails
        return [0.0] * 768

async def search_vectors(query_embedding: List[float], top_k: int, filters: Optional[Dict] = None):
    """Search Qdrant for similar vectors."""
    try:
        search_params = {
            "collection_name": COLLECTION_NAME,
            "query_vector": query_embedding,
            "limit": top_k,
            "score_threshold": SIMILARITY_THRESHOLD
        }
        
        if filters:
            # Convert filters to Qdrant format
            search_params["query_filter"] = Filter(
                must=[
                    FieldCondition(
                        key=k,
                        match=MatchValue(value=v)
                    ) for k, v in filters.items()
                ]
            )
        
        results = qdrant_client.search(**search_params)
        return results
    except Exception as e:
        logger.error(f"Vector search error: {e}")
        return []

async def web_search(query: str, num_results: int = 3) -> List[Dict[str, Any]]:
    """Perform web search using LangExtract."""
    if not ENABLE_WEB_SEARCH:
        return []
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{LANGEXTRACT_URL}/search",
                json={"query": query, "num_results": num_results}
            )
            response.raise_for_status()
            return response.json().get("results", [])
    except Exception as e:
        logger.warning(f"Web search error: {e}")
        return []

async def generate_answer(query: str, context: str, model: str = "gemma3:legal:latest") -> str:
    """Generate answer using Ollama LLM."""
    prompt = f"""You are a legal AI assistant. Based on the following context, answer the question with detailed legal analysis.

Context:
{context}

Question: {query}

Answer (provide thorough legal analysis):"""
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{LLM_URL}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "top_p": 0.9,
                        "num_predict": 2048
                    }
                }
            )
            response.raise_for_status()
            result = response.json()
            return result.get("response", "Unable to generate answer")
    except Exception as e:
        logger.error(f"LLM generation error: {e}")
        return f"Error generating answer: {str(e)}"

def get_cache_key(query: str, filters: Optional[Dict] = None) -> str:
    """Generate cache key for RAG query."""
    content = f"{query}:{json.dumps(filters or {}, sort_keys=True)}"
    return f"rag:{hashlib.sha256(content.encode()).hexdigest()}"

@app.post("/query", response_model=RAGResponse)
async def rag_query(request: RAGQuery):
    """Process RAG query with vector search and LLM generation."""
    
    # Check cache
    cache_key = get_cache_key(request.query, request.filters)
    if redis_client:
        try:
            cached_result = await redis_client.get(cache_key)
            if cached_result:
                logger.info(f"Cache hit for query: {request.query[:50]}...")
                return RAGResponse(**json.loads(cached_result))
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
    
    # Get query embedding
    query_embedding = await get_embedding(request.query)
    
    # Search vectors
    vector_results = await search_vectors(
        query_embedding,
        request.top_k or TOP_K,
        request.filters
    )
    
    # Web search if enabled
    web_results = await web_search(request.query, num_results=3) if request.enable_web_search else []
    
    # Combine sources
    sources = []
    context_parts = []
    
    for hit in vector_results:
        source = {
            "id": str(hit.id),
            "score": hit.score,
            "text": hit.payload.get("text", ""),
            "metadata": hit.payload.get("metadata", {})
        }
        sources.append(source)
        context_parts.append(source["text"])
    
    for web_result in web_results:
        sources.append({
            "type": "web",
            "title": web_result.get("title", ""),
            "url": web_result.get("url", ""),
            "snippet": web_result.get("snippet", "")
        })
        context_parts.append(web_result.get("snippet", ""))
    
    # Generate answer
    context = "\n\n".join(context_parts[:5])  # Limit context to top 5 sources
    answer = await generate_answer(request.query, context, request.model or "gemma3:legal:latest")
    
    # Prepare response
    response = RAGResponse(
        answer=answer,
        sources=sources,
        metadata={
            "query": request.query,
            "num_sources": len(sources),
            "vector_hits": len(vector_results),
            "web_hits": len(web_results),
            "timestamp": datetime.utcnow().isoformat(),
            "cached": False
        }
    )
    
    # Cache result
    if redis_client:
        try:
            await redis_client.setex(
                cache_key,
                3600,  # 1 hour TTL
                response.json()
            )
        except Exception as e:
            logger.warning(f"Cache write error: {e}")
    
    return response

@app.post("/index")
async def index_document(document: Document):
    """Index document into Qdrant vector database."""
    
    # Get embedding
    embedding = await get_embedding(document.text)
    
    # Store in Qdrant
    try:
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=document.id,
                    vector=embedding,
                    payload={
                        "text": document.text,
                        "metadata": document.metadata,
                        "indexed_at": datetime.utcnow().isoformat()
                    }
                )
            ]
        )
        
        # Store metadata in PostgreSQL if pool is available
        if db_pool:
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO documents (id, content, metadata, created_at)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO UPDATE
                    SET content = $2, metadata = $3, updated_at = $4
                    """,
                    document.id,
                    document.text,
                    json.dumps(document.metadata),
                    datetime.utcnow()
                )
        
        return {"status": "indexed", "id": document.id}
    except Exception as e:
        logger.error(f"Indexing error: {e}")
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    health = {
        "status": "healthy",
        "services": {
            "redis": redis_client is not None,
            "qdrant": qdrant_client is not None,
            "postgres": db_pool is not None
        },
        "config": {
            "collection": COLLECTION_NAME,
            "top_k": TOP_K,
            "similarity_threshold": SIMILARITY_THRESHOLD,
            "reranking": ENABLE_RERANKING,
            "web_search": ENABLE_WEB_SEARCH
        }
    }
    
    # Check service connectivity
    all_healthy = all(health["services"].values())
    health["status"] = "healthy" if all_healthy else "degraded"
    
    return health

@app.get("/stats")
async def get_stats():
    """Get RAG orchestrator statistics."""
    stats = {
        "collection": COLLECTION_NAME,
        "top_k": TOP_K,
        "similarity_threshold": SIMILARITY_THRESHOLD
    }
    
    # Qdrant stats
    try:
        collection_info = qdrant_client.get_collection(COLLECTION_NAME)
        stats["vector_count"] = collection_info.points_count
        stats["vector_dimension"] = collection_info.config.params.vectors.size
    except Exception as e:
        logger.error(f"Qdrant stats error: {e}")
        stats["vector_count"] = 0
    
    # Redis cache stats
    if redis_client:
        try:
            info = await redis_client.info()
            stats["cache_keys"] = info.get("db2", {}).get("keys", 0)
        except Exception as e:
            logger.error(f"Redis stats error: {e}")
    
    return stats

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
