#!/usr/bin/env python3
"""
Similarity API for SvelteKit Frontend
- Query Qdrant for similar cases
- Fetch metadata from PostgreSQL
- Generate CHR-ROM patterns
- Cache in Redis
- Return JSON for frontend
"""

import os
import json
import logging
from typing import Dict, List, Any

import redis
import qdrant_client
from qdrant_client.models import Distance
import psycopg2

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.services.embedding_service import get_embedding_service

logger = logging.getLogger(__name__)

# Configuration
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", "6333"))

PG_HOST = os.getenv("PG_HOST", "localhost")
PG_DB = os.getenv("PG_DB", "legal_ai_db")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASSWORD = os.getenv("PG_PASSWORD", "password")

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))

REDIS_TTL = int(os.getenv("REDIS_TTL", "3600"))  # 1 hour

# Initialize
app = FastAPI(title="Legal Similarity API")
embedding_service = get_embedding_service()
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
qdrant_client_instance = qdrant_client.QdrantClient(QDRANT_HOST, port=QDRANT_PORT)


# ---------- Models ----------

class SimilarCaseRequest(BaseModel):
    case_id: str
    limit: int = 10


class CaseResult(BaseModel):
    case_id: str
    score: float
    summary: str
    metadata: Dict[str, Any]
    patterns: Dict[str, str]  # CHR-ROM patterns


class SimilarCasesResponse(BaseModel):
    query_case_id: str
    results: List[CaseResult]
    cached: bool


# ---------- CHR-ROM Pattern Generation ----------

def generate_chr_rom_patterns(case_id: str, score: float) -> Dict[str, str]:
    """
    Generate CHR-ROM visual patterns for a case.
    Returns HTML/SVG snippets for SvelteKit to render.
    """
    patterns = {}

    # Summary icon (based on score)
    if score > 0.8:
        icon = "🔴"  # High relevance
    elif score > 0.6:
        icon = "🟡"  # Medium relevance
    else:
        icon = "🟢"  # Low relevance

    patterns["summary_icon"] = f'<span class="icon">{icon}</span>'

    # Risk gauge (SVG)
    gauge_value = int(score * 100)
    patterns["risk_gauge"] = f"""
    <svg width="40" height="20" viewBox="0 0 40 20">
        <rect x="0" y="0" width="{gauge_value * 0.4}" height="20" fill="#ff6b6b"/>
        <rect x="{gauge_value * 0.4}" y="0" width="{40 - gauge_value * 0.4}" height="20" fill="#e9ecef"/>
    </svg>
    """

    # Confidence badge
    patterns["confidence_badge"] = f"""
    <span class="badge" style="background-color: rgba(255, 107, 107, {score})">
        {gauge_value}%
    </span>
    """

    # Case type indicator
    patterns["case_type"] = '<span class="type">Legal</span>'

    return patterns


# ---------- Endpoints ----------

@app.get("/health")
async def health():
    """Health check."""
    return {"status": "ok"}


@app.post("/api/cases/similar", response_model=SimilarCasesResponse)
async def find_similar_cases(request: SimilarCaseRequest):
    """
    Find similar cases to a given case_id.
    Steps:
    1. Check Redis cache
    2. If miss: query Qdrant for similar vectors
    3. Fetch metadata from PostgreSQL
    4. Generate CHR-ROM patterns
    5. Store in Redis
    6. Return JSON
    """
    logger.info(f"🔍 Finding similar cases for {request.case_id}...")

    # 1. Check Redis cache
    cache_key = f"cases:similar:{request.case_id}"
    cached_result = redis_client.get(cache_key)
    if cached_result:
        logger.info(f"   ✓ Cache hit for {request.case_id}")
        return JSONResponse(
            json.loads(cached_result),
            headers={"X-Cache": "HIT"},
        )

    logger.info(f"   ✗ Cache miss for {request.case_id}")

    # 2. Query Qdrant for similar vectors
    try:
        # Get embeddings for the query case
        conn = psycopg2.connect(
            host=PG_HOST,
            database=PG_DB,
            user=PG_USER,
            password=PG_PASSWORD,
        )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT embedding FROM legal_embeddings
                WHERE case_id = %s
                LIMIT 1
                """,
                (request.case_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(
                    status_code=404, detail=f"Case {request.case_id} not found"
                )
            query_embedding = row[0]

        # Search Qdrant
        search_results = qdrant_client_instance.search(
            collection_name="legal_complaints",
            query_vector=query_embedding,
            limit=request.limit,
        )

        # 3. Fetch metadata from PostgreSQL
        results = []
        for scored_point in search_results:
            case_id = scored_point.payload.get("case_id")
            score = scored_point.score

            # Fetch full metadata
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT summary, metadata FROM legal_embeddings
                    WHERE case_id = %s
                    LIMIT 1
                    """,
                    (case_id,),
                )
                row = cur.fetchone()
                summary = row[0] if row else "No summary available"
                metadata = json.loads(row[1]) if row and row[1] else {}

            # 4. Generate CHR-ROM patterns
            patterns = generate_chr_rom_patterns(case_id, score)

            # Store pattern in Redis for later retrieval
            for pattern_type, pattern_html in patterns.items():
                pattern_key = f"chr:pattern:{case_id}:{pattern_type}"
                redis_client.setex(pattern_key, REDIS_TTL, pattern_html)

            results.append(
                CaseResult(
                    case_id=case_id,
                    score=score,
                    summary=summary,
                    metadata=metadata,
                    patterns=patterns,
                )
            )

        conn.close()

        # 5. Build response
        response = SimilarCasesResponse(
            query_case_id=request.case_id,
            results=results,
            cached=False,
        )

        # 6. Store in Redis
        redis_client.setex(
            cache_key,
            REDIS_TTL,
            response.model_dump_json(),
        )

        logger.info(f"   ✓ Found {len(results)} similar cases")
        return response

    except Exception as e:
        logger.error(f"❌ Error finding similar cases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chr-rom/pattern/{doc_id}/{pattern_type}")
async def get_chr_rom_pattern(doc_id: str, pattern_type: str):
    """
    Get a specific CHR-ROM pattern for a document.
    Checks Redis first, then generates if missing.
    """
    logger.info(f"📦 Fetching CHR-ROM pattern: {doc_id}/{pattern_type}")

    # Check Redis
    pattern_key = f"chr:pattern:{doc_id}:{pattern_type}"
    cached_pattern = redis_client.get(pattern_key)
    if cached_pattern:
        logger.info(f"   ✓ Pattern cache hit")
        return {"pattern": cached_pattern.decode("utf-8"), "cached": True}

    logger.info(f"   ✗ Pattern cache miss")

    # Generate pattern (placeholder)
    patterns = generate_chr_rom_patterns(doc_id, 0.75)
    pattern_html = patterns.get(pattern_type, "<span>N/A</span>")

    # Store in Redis
    redis_client.setex(pattern_key, REDIS_TTL, pattern_html)

    return {"pattern": pattern_html, "cached": False}


@app.get("/api/cases/{case_id}")
async def get_case_details(case_id: str):
    """
    Get full details for a case.
    """
    logger.info(f"📋 Fetching case details: {case_id}")

    try:
        conn = psycopg2.connect(
            host=PG_HOST,
            database=PG_DB,
            user=PG_USER,
            password=PG_PASSWORD,
        )
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT case_id, summary, metadata, created_at
                FROM legal_embeddings
                WHERE case_id = %s
                LIMIT 1
                """,
                (case_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

            return {
                "case_id": row[0],
                "summary": row[1],
                "metadata": json.loads(row[2]) if row[2] else {},
                "created_at": row[3].isoformat() if row[3] else None,
            }
    except Exception as e:
        logger.error(f"❌ Error fetching case details: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search")
async def search_cases(query: str = Query(..., min_length=1)):
    """
    Search for cases by query text.
    Embeds query, searches Qdrant, returns results.
    """
    logger.info(f"🔎 Searching for: {query}")

    try:
        # Embed query
        query_embedding = embedding_service.embed_one(query)

        # Search Qdrant
        search_results = qdrant_client_instance.search(
            collection_name="legal_complaints",
            query_vector=query_embedding.tolist(),
            limit=10,
        )

        # Build response
        results = []
        for scored_point in search_results:
            results.append(
                {
                    "case_id": scored_point.payload.get("case_id"),
                    "score": scored_point.score,
                    "text": scored_point.payload.get("text", "")[:200],
                }
            )

        return {"query": query, "results": results}
    except Exception as e:
        logger.error(f"❌ Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)
