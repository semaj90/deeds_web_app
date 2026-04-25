"""
Retrieval Service - Embedding and vector search
Handles Qdrant + pgvector hybrid retrieval with Redis caching
"""
import hashlib
import json
import httpx
import redis.asyncio as redis
from qdrant_client import AsyncQdrantClient
import psycopg

import sys
sys.path.append('..')
from config import (
    QDRANT_URL, QDRANT_COLLECTION,
    REDIS_URL, OLLAMA_URL, OLLAMA_EMBED_MODEL,
    PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
)

# Initialize clients
rds = redis.from_url(REDIS_URL, decode_responses=False)
qdrant = AsyncQdrantClient(url=QDRANT_URL)


def _cache_key(prefix: str, s: str) -> str:
    """Generate cache key from prefix and input string"""
    return f"{prefix}:{hashlib.sha256(s.encode('utf-8')).hexdigest()[:32]}"


async def embed_text(text: str) -> list[float]:
    """Generate embedding with Redis caching (24h TTL)"""
    cache_key = _cache_key("emb", text)

    # Check cache
    cached = await rds.get(cache_key)
    if cached:
        return json.loads(cached)

    # Generate embedding via Ollama
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text}
        )
        resp.raise_for_status()
        vec = resp.json()["embedding"]

    # Cache for 24 hours
    await rds.set(cache_key, json.dumps(vec).encode("utf-8"), ex=86400)
    return vec


async def qdrant_search(query: str, top_k: int, filters: dict | None) -> list[dict]:
    """Search Qdrant knowledge base"""
    vec = await embed_text(query)

    try:
        results = await qdrant.search(
            collection_name=QDRANT_COLLECTION,
            query_vector=vec,
            limit=top_k,
            with_payload=True
        )
    except Exception as e:
        return [{"error": str(e)}]

    hits = []
    for point in results:
        payload = point.payload or {}
        hits.append({
            "id": str(point.id),
            "score": float(point.score),
            "kind": payload.get("kind"),
            "tags": payload.get("tags"),
            "source": payload.get("source"),
            "chunk": payload.get("text", "")[:500],  # Truncate for response size
            "meta": payload
        })

    return hits


async def pgvector_similar_errors(query: str, top_k: int) -> list[dict]:
    """Search pgvector for similar error patterns"""
    vec = await embed_text(query)

    # Build connection string
    conn_str = f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"

    sql = """
        SELECT e.error_id, t.file_path, t.error_code, t.error_message,
               (e.embedding <=> $1::vector) AS distance
        FROM error_embeddings e
        JOIN ts_errors t ON t.id = e.error_id
        ORDER BY e.embedding <=> $1::vector
        LIMIT $2
    """

    try:
        async with await psycopg.AsyncConnection.connect(conn_str) as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (vec, top_k))
                rows = await cur.fetchall()
    except Exception as e:
        return [{"error": str(e)}]

    hits = []
    for row in rows:
        distance = float(row[4])
        score = 1.0 / (1.0 + distance)  # Convert distance to similarity score
        hits.append({
            "id": str(row[0]),
            "score": score,
            "kind": "ts_error",
            "source": row[1],
            "meta": {
                "error_code": row[2],
                "message": row[3][:200] if row[3] else None,
                "distance": distance
            }
        })

    return hits


async def hybrid_search(query: str, top_k: int, filters: dict | None) -> list[dict]:
    """
    Hybrid search: merge Qdrant + pgvector results using RRF
    Reciprocal Rank Fusion: score = sum(1/(k + rank))
    """
    # Run both searches in parallel
    q_hits = await qdrant_search(query, top_k, filters)
    p_hits = await pgvector_similar_errors(query, top_k)

    # RRF fusion
    K = 60  # RRF constant
    scores = {}

    for rank, hit in enumerate(q_hits):
        hit_id = hit.get("id", f"q_{rank}")
        scores[hit_id] = scores.get(hit_id, 0) + 1.0 / (K + rank + 1)
        if hit_id not in scores:
            scores[hit_id] = {"hit": hit, "rrf_score": 0}
        scores[hit_id] = {"hit": hit, "rrf_score": scores.get(hit_id, {}).get("rrf_score", 0) + 1.0 / (K + rank + 1)}

    for rank, hit in enumerate(p_hits):
        hit_id = hit.get("id", f"p_{rank}")
        if hit_id in scores:
            scores[hit_id]["rrf_score"] += 1.0 / (K + rank + 1)
        else:
            scores[hit_id] = {"hit": hit, "rrf_score": 1.0 / (K + rank + 1)}

    # Sort by RRF score
    merged = sorted(scores.values(), key=lambda x: x["rrf_score"], reverse=True)

    # Return top results with RRF score added
    results = []
    for item in merged[:top_k * 2]:
        hit = item["hit"]
        hit["rrf_score"] = item["rrf_score"]
        results.append(hit)

    return results
