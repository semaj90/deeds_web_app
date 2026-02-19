"""
Agentic Legal Search API with Alignment Routing.

Provides /api/search endpoint that:
- Embeds queries via Ollama + embeddinggemma (GPU, Redis-cached)
- Searches Qdrant for semantic matches (RAG)
- Enriches with KAG context from Neo4j
- Runs AlignmentRouter for intelligent routing
- Optionally generates Granite reasoning summaries
- Updates manifold usage heat for topology
- Returns alignment signals for frontend transparency
"""

from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from qdrant_client import QdrantClient
from qdrant_client.models import ScoredPoint

from ..services.legal_complaint_ingestion import (
    CFG,
)
from ..services.redis_cache import RedisCache
from ..services.granite_client import GraniteClient
from ..services.alignment_router import AlignmentRouter

router = APIRouter(prefix="/api")


# ---------- Pydantic models ----------


class SearchRequest(BaseModel):
    """Request model for /api/search endpoint."""

    query: str
    user_id: Optional[str] = None
    case_id: Optional[str] = None
    limit: int = 10
    include_kag: bool = True
    include_reasoning: bool = True
    mode: Optional[str] = None  # "fast", "deep", etc.


class SearchResultChunk(BaseModel):
    """Individual search result chunk."""

    id: str
    case_id: str
    chunk_index: int
    score: float
    text_snippet: str
    langextract_tags: Dict[str, Any] = {}
    kag_context: Optional[Dict[str, Any]] = None


class AlignmentSignals(BaseModel):
    """Alignment signals returned to frontend."""

    user_id: Optional[str]
    latency_ms: float
    query_length: int
    negativity_score: float
    on_task_score: float
    intent: str
    route_decision: str
    web_search_suggested: bool


class SearchResponse(BaseModel):
    """Response model for /api/search endpoint."""

    query: str
    user_id: Optional[str]
    intent: str
    route_decision: str
    chunks: List[SearchResultChunk]
    reasoning_summary: Optional[str] = None
    alignment: AlignmentSignals
    query_emb16: Optional[List[float]] = None  # 16-dim embedding for GPU


# ---------- instantiate shared clients ----------

redis_cache = RedisCache(CFG.redis_url)
# embedding_client = EmbeddingClient(CFG, redis_cache)
qdrant_client = QdrantClient(CFG.qdrant_host, port=CFG.qdrant_port)
granite_client = GraniteClient(CFG.__dict__)

alignment_router = AlignmentRouter(
    redis_cache=redis_cache,
    neo4j_uri=CFG.neo4j_uri,
    neo4j_user=CFG.neo4j_user,
    neo4j_password=CFG.neo4j_password,
    granite_client=granite_client,
)


# ---------- helpers ----------


def _fetch_kag_context_for_case(case_id: str, limit: int = 10) -> Dict[str, Any]:
    """
    Fetch local neighborhood from Neo4j around a case.

    Returns small KAG snapshot used for prompts and UI.
    """
    driver = alignment_router.neo_driver

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (c:Case {id: $case_id})-[r]-(e)
                RETURN c, type(r) AS rel_type, e
                LIMIT $limit
                """,
                case_id=case_id,
                limit=limit,
            )

            edges = []
            nodes = set()

            for rec in result:
                c = dict(rec["c"])
                e = dict(rec["e"])
                rel_type = rec["rel_type"]
                edges.append({"from": c, "to": e, "type": rel_type})
                nodes.add(json.dumps(c))
                nodes.add(json.dumps(e))

        return {
            "case_id": case_id,
            "nodes": [json.loads(n) for n in nodes],
            "edges": edges,
        }
    except Exception:
        # fail-soft: return empty context
        return {"case_id": case_id, "nodes": [], "edges": []}


def _update_manifold_usage(
    redis_cache: RedisCache,
    case_id: str,
    chunk_index: int,
    alignment: AlignmentSignals,
) -> None:
    """
    Write usage heat to Redis for CH-ROM97 / manifold visualization.

    Key: manifold-usage:{case_id}:{chunk_index}
    Value: {"hits": int, "heat": float}

    Heat = 0.5 * on_task_score + 0.5 * calm (1 - negativity_score)
    """
    key = f"manifold-usage:{case_id}:{chunk_index}"

    try:
        existing = redis_cache.get_json(key) or {"hits": 0, "heat": 0.0}

        hits = existing["hits"] + 1
        on_task = alignment.on_task_score
        calm = 1.0 - alignment.negativity_score
        delta = 0.5 * on_task + 0.5 * calm

        redis_cache.set_json(
            key,
            {"hits": hits, "heat": existing["heat"] + float(delta)},
            ttl=30 * 24 * 3600,
        )
    except Exception:
        # fail-soft: continue without heat update
        pass


# ---------- /api/search endpoint ----------


@router.post("/search", response_model=SearchResponse)
def search(req: SearchRequest) -> SearchResponse:
    """
    Unified agentic search endpoint.

    Flow:
    1. Embed query (GPU, Ollama, Redis-cached)
    2. Vector search in Qdrant (RAG)
    3. Map hits to chunks + optional KAG context
    4. Run AlignmentRouter for routing decision
    5. Update manifold usage heat
    6. Optional Granite reasoning
    7. Return SearchResponse with alignment signals
    """
    t0 = time.perf_counter()

    # 1) Embed query (GPU, Ollama, Redis cached)
    try:
        query_vec = embedding_client.embed_batch([req.query])[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")

    # 2) Vector search in Qdrant (RAG)
    try:
        hits: List[ScoredPoint] = qdrant_client.search(
            collection_name="legal_complaints",
            query_vector=query_vec.tolist(),
            limit=req.limit,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Qdrant search error: {e}")

    # 3) Map hits → chunks (+ optional KAG context)
    chunks: List[SearchResultChunk] = []
    kag_cache: Dict[str, Dict[str, Any]] = {}

    for h in hits:
        payload = h.payload or {}
        text = payload.get("text", "")
        case_id = payload.get("case_id", "")
        chunk_index = payload.get("chunk_index", -1)
        tags = payload.get("langextract_tags", {}) or {}

        kag_ctx = None
        if req.include_kag and case_id:
            if case_id not in kag_cache:
                kag_cache[case_id] = _fetch_kag_context_for_case(case_id)
            kag_ctx = kag_cache[case_id]

        chunks.append(
            SearchResultChunk(
                id=str(h.id),
                case_id=case_id,
                chunk_index=chunk_index,
                score=float(h.score),
                text_snippet=text[:300],
                langextract_tags=tags,
                kag_context=kag_ctx,
            )
        )

    t1 = time.perf_counter()
    latency_ms = (t1 - t0) * 1000.0

    # 4) Alignment + routing (ACE)
    signals_dict = alignment_router.plan(
        user_id=req.user_id,
        query=req.query,
        latency_ms=latency_ms,
    )
    alignment = AlignmentSignals(**signals_dict)

    # 5) Update manifold usage heat for CH-ROM97
    for c in chunks:
        if c.case_id:
            _update_manifold_usage(redis_cache, c.case_id, c.chunk_index, alignment)

    # 6) Optional Granite reasoning over top-k chunks
    reasoning_summary: Optional[str] = None
    if req.include_reasoning and alignment.route_decision.startswith("legal_rag"):
        try:
            top_texts = [c.text_snippet for c in chunks[: min(5, len(chunks))]]
            reasoning_summary = granite_client.summarize_case(
                case_id=req.case_id or (chunks[0].case_id if chunks else "unknown"),
                chunks=top_texts,
            )
        except Exception:
            # fail-soft: continue without reasoning
            reasoning_summary = None

    # 7) Return response with query embedding for GPU
    # Quantize embedding to 16-dim for GPU transfer
    query_emb16 = None
    if query_vec is not None and len(query_vec) >= 16:
        # Simple quantization: take first 16 dims
        query_emb16 = query_vec[:16].tolist()

    return SearchResponse(
        query=req.query,
        user_id=req.user_id,
        intent=alignment.intent,
        route_decision=alignment.route_decision,
        chunks=chunks,
        reasoning_summary=reasoning_summary,
        alignment=alignment,
        query_emb16=query_emb16,
    )



@router.get("/user/timeline")
def get_user_timeline(user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get user's search timeline from Redis.

    Returns last 10 searches with timestamps, queries, intents, routes.
    """
    if not user_id:
        return []

    try:
        key = f"timeline:{user_id}"
        timeline = redis_cache.get_json(key) or []
        return timeline[:10]
    except Exception:
        return []


@router.post("/user/timeline/add")
def add_to_timeline(
    user_id: str,
    query: str,
    intent: str,
    route: str,
    result_count: int,
) -> Dict[str, Any]:
    """
    Add a search to user's timeline.
    """
    try:
        key = f"timeline:{user_id}"
        existing = redis_cache.get_json(key) or []

        entry = {
            "timestamp": time.time(),
            "query": query,
            "intent": intent,
            "route": route,
            "result_count": result_count,
        }

        existing.insert(0, entry)
        redis_cache.set_json(key, existing[:20], ttl=30 * 24 * 3600)  # Keep 20 entries

        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
