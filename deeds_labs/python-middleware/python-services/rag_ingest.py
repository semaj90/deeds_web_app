# Phase 70: RAG Ingest Service
# Processes documents and creates embeddings for vector search
# Python 3.12 + sentence-transformers + small dependencies

import os
import asyncio
import json
import logging
import re
from typing import Dict, List, Optional, Any, Tuple
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Embeddings and vector processing
try:
    import numpy as np
    from sentence_transformers import SentenceTransformer
    import redis
    import psycopg2
    from psycopg2.extras import execute_values
    import chromadb
    VECTOR_PROCESSING_AVAILABLE = True
except ImportError:
    VECTOR_PROCESSING_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Phase 70 RAG Ingest Service", version="1.0.0")

class IngestRequest(BaseModel):
    text: str
    metadata: Dict[str, Any] = {}
    chunk_size: int = 512
    chunk_overlap: int = 50
    source: str = ""

class IngestResponse(BaseModel):
    chunks_created: int
    embeddings_created: int
    stored_in: List[str] = []  # ["pgvector", "chroma", "redis"]
    backend: str = "sentence-transformers"

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    threshold: float = 0.7

class SearchResponse(BaseModel):
    results: List[Dict[str, Any]] = []
    total_found: int = 0
    backend: str = "sentence-transformers"

# Global components
embedding_model: Optional[SentenceTransformer] = None
redis_client: Optional[redis.Redis] = None
chroma_client: Optional[chromadb.Client] = None

def initialize_components():
    """Initialize embedding model and storage clients"""
    global embedding_model, redis_client, chroma_client

    if not VECTOR_PROCESSING_AVAILABLE:
        logger.warning("Vector processing libraries not available")
        return

    try:
        # Initialize embedding model
        model_name = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
        embedding_model = SentenceTransformer(model_name)
        logger.info(f"✅ Loaded embedding model: {model_name}")

        # Initialize Redis
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        redis_client = redis.from_url(redis_url)
        logger.info("✅ Connected to Redis")

        # Initialize ChromaDB
        chroma_client = chromadb.PersistentClient(path="/app/chroma_db")
        logger.info("✅ Connected to ChromaDB")

    except Exception as e:
        logger.error(f"Failed to initialize components: {e}")

def chunk_text(text: str, chunk_size: int = 512, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks"""
    words = text.split()
    chunks = []

    for i in range(0, len(words), chunk_size - overlap):
        chunk = words[i:i + chunk_size]
        if chunk:  # Only add non-empty chunks
            chunks.append(' '.join(chunk))

    return chunks

def generate_embeddings(texts: List[str]) -> np.ndarray:
    """Generate embeddings for text chunks"""
    if not embedding_model:
        raise RuntimeError("Embedding model not initialized")

    embeddings = embedding_model.encode(texts, convert_to_numpy=True)
    return embeddings

@app.on_event("startup")
async def startup_event():
    """Initialize components on startup"""
    initialize_components()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy" if VECTOR_PROCESSING_AVAILABLE else "limited",
        "backend": "sentence-transformers",
        "embedding_model_loaded": embedding_model is not None,
        "redis_connected": redis_client is not None if redis_client else False,
        "chromadb_connected": chroma_client is not None
    }

@app.post("/ingest", response_model=IngestResponse)
async def ingest_document(request: IngestRequest):
    """Ingest document and create embeddings"""
    if not embedding_model:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    try:
        # Chunk the text
        chunks = chunk_text(request.text, request.chunk_size, request.chunk_overlap)

        if not chunks:
            return IngestResponse(chunks_created=0, embeddings_created=0)

        # Generate embeddings
        embeddings = generate_embeddings(chunks)

        stored_in = []

        # Store in ChromaDB
        if chroma_client:
            try:
                collection = chroma_client.get_or_create_collection("legal_docs")

                # Prepare data for ChromaDB
                ids = [f"{request.source}_{i}" for i in range(len(chunks))]
                metadatas = [{
                    **request.metadata,
                    "source": request.source,
                    "chunk_index": i,
                    "chunk_size": len(chunk.split())
                } for i, chunk in enumerate(chunks)]

                collection.add(
                    embeddings=embeddings.tolist(),
                    documents=chunks,
                    metadatas=metadatas,
                    ids=ids
                )
                stored_in.append("chromadb")
                logger.info(f"✅ Stored {len(chunks)} chunks in ChromaDB")

            except Exception as e:
                logger.error(f"ChromaDB storage failed: {e}")

        # Store in Redis cache
        if redis_client:
            try:
                cache_key = f"embeddings:{request.source}"
                redis_client.setex(
                    cache_key,
                    3600,  # 1 hour TTL
                    json.dumps({
                        "chunks": chunks,
                        "embeddings": embeddings.tolist(),
                        "metadata": request.metadata
                    })
                )
                stored_in.append("redis")
                logger.info(f"✅ Cached embeddings in Redis")

            except Exception as e:
                logger.error(f"Redis storage failed: {e}")

        return IngestResponse(
            chunks_created=len(chunks),
            embeddings_created=len(embeddings),
            stored_in=stored_in,
            backend="sentence-transformers"
        )

    except Exception as e:
        logger.error(f"Ingest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search", response_model=SearchResponse)
async def search_documents(request: SearchRequest):
    """Search documents using vector similarity"""
    if not embedding_model or not chroma_client:
        raise HTTPException(status_code=503, detail="Search components not available")

    try:
        # Generate query embedding
        query_embedding = generate_embeddings([request.query])[0]

        # Search in ChromaDB
        collection = chroma_client.get_collection("legal_docs")

        results = collection.query(
            query_embeddings=[query_embedding.tolist()],
            n_results=request.limit,
            include=["documents", "metadatas", "distances"]
        )

        # Format results
        search_results = []
        if results["documents"] and len(results["documents"]) > 0:
            for i, doc in enumerate(results["documents"][0]):
                metadata = results["metadatas"][0][i] if results["metadatas"] else {}
                distance = results["distances"][0][i] if results["distances"] else 1.0

                # Convert distance to similarity score
                similarity = 1.0 - distance

                if similarity >= request.threshold:
                    search_results.append({
                        "document": doc,
                        "metadata": metadata,
                        "similarity": similarity,
                        "rank": i + 1
                    })

        return SearchResponse(
            results=search_results,
            total_found=len(search_results),
            backend="sentence-transformers"
        )

    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "rag_ingest:app",
        host="0.0.0.0",
        port=8103,
        reload=False,
        log_level="info"
    )