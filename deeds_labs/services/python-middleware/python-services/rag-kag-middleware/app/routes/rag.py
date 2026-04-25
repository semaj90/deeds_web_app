from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional, Dict, Any
from app.services.retrieval import embed_text, qdrant_search, hybrid_search

router = APIRouter()

class EmbedReq(BaseModel):
    text: str

class RetrieveReq(BaseModel):
    query: str
    top_k: int = 8
    filters: Optional[Dict[str, Any]] = None

@router.post("/embed")
async def embed(req: EmbedReq):
    vec = await embed_text(req.text)
    return {"dim": len(vec), "vector": vec}

@router.post("/retrieve")
async def retrieve(req: RetrieveReq):
    hits = await qdrant_search(req.query, req.top_k, req.filters)
    return {"hits": hits}

@router.post("/retrieve/hybrid")
async def retrieve_hybrid(req: RetrieveReq):
    hits = await hybrid_search(req.query, req.top_k, req.filters)
    return {"hits": hits}
