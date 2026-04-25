"""
KAG Routes - Knowledge-Augmented Generation endpoints
Graph expansion and context retrieval
"""
from fastapi import APIRouter
from pydantic import BaseModel
import sys
sys.path.append('..')

from services.graph import expand_graph, get_context

router = APIRouter()


class ExpandRequest(BaseModel):
    seed_ids: list[str]
    depth: int = 1
    edge_types: list[str] | None = None
    limit: int = 50


class ContextRequest(BaseModel):
    error_id: str
    file_path: str | None = None
    error_code: str | None = None


@router.post("/expand")
async def expand(req: ExpandRequest):
    """Expand graph from seed nodes"""
    result = await expand_graph(
        seed_ids=req.seed_ids,
        depth=req.depth,
        edge_types=req.edge_types,
        limit=req.limit
    )
    return result


@router.post("/context")
async def context(req: ContextRequest):
    """Get graph-derived context for an error"""
    result = await get_context(
        error_id=req.error_id,
        file_path=req.file_path,
        error_code=req.error_code
    )
    return result
