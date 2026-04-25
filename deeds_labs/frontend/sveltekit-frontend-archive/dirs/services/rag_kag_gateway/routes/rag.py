"""
RAG Routes - Retrieval-Augmented Generation endpoints
"""
from fastapi import APIRouter
from pydantic import BaseModel
import sys
sys.path.append('..')

from services.retrieval import embed_text, qdrant_search, hybrid_search

router = APIRouter()


class EmbedRequest(BaseModel):
    text: str


class RetrieveRequest(BaseModel):
    query: str
    top_k: int = 8
    filters: dict | None = None


@router.post("/embed")
async def embed(req: EmbedRequest):
    """Generate embedding for text (cached in Redis)"""
    vec = await embed_text(req.text)
    return {"dim": len(vec), "vector": vec[:10], "full_length": len(vec)}  # Truncated for readability


@router.post("/retrieve")
async def retrieve(req: RetrieveRequest):
    """Search Qdrant knowledge base"""
    hits = await qdrant_search(req.query, req.top_k, req.filters)
    return {"hits": hits, "count": len(hits)}


@router.post("/retrieve/hybrid")
async def retrieve_hybrid(req: RetrieveRequest):
    """Hybrid search: Qdrant + pgvector merged results"""
    hits = await hybrid_search(req.query, req.top_k, req.filters)
    return {"hits": hits, "count": len(hits), "mode": "hybrid"}
