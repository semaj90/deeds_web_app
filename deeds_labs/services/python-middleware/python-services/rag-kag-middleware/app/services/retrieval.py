import hashlib
import httpx
import json
import redis.asyncio as redis
from qdrant_client import AsyncQdrantClient
import psycopg
from typing import List, Dict, Any, Optional

from app.config import (
    QDRANT_URL, QDRANT_COLLECTION,
    REDIS_URL, OLLAMA_URL, OLLAMA_EMBED_MODEL,
    DATABASE_URL
)

rds = redis.from_url(REDIS_URL, decode_responses=False)
qdrant = AsyncQdrantClient(url=QDRANT_URL)

def _key(prefix: str, s: str) -> str:
    return prefix + ":" + hashlib.sha256(s.encode("utf-8")).hexdigest()

async def embed_text(text: str) -> List[float]:
    k = _key("emb", text)
    cached = await rds.get(k)
    if cached:
        return json.loads(cached)

    async with httpx.AsyncClient(timeout=60) as client:
        # Ollama embeddings endpoint
        resp = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text},
        )
        resp.raise_for_status()
        vec = resp.json()["embedding"]

    await rds.set(k, json.dumps(vec).encode("utf-8"), ex=60 * 60 * 24)
    return vec

async def qdrant_search(query: str, top_k: int, filters: Optional[Dict[str, Any]] = None):
    vec = await embed_text(query)
    res = await qdrant.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=vec,
        limit=top_k,
        with_payload=True,
    )
    hits = []
    for p in res:
        payload = p.payload or {}
        hits.append({
            "id": str(p.id),
            "score": float(p.score),
            "kind": payload.get("kind"),
            "tags": payload.get("tags"),
            "source": payload.get("source"),
            "chunk": payload.get("text"),
            "meta": payload,
        })
    return hits

async def pgvector_similar_errors(query: str, top_k: int):
    # Requires error_embeddings(embedding vector(768)) and pgvector <=> operator
    vec = await embed_text(query)
    sql = """
      SELECT e.error_id, t.file_path, t.code, t.message,
             (e.embedding <=> %s::vector) AS dist
      FROM error_embeddings e
      JOIN ts_errors t ON t.id = e.error_id
      ORDER BY e.embedding <=> %s::vector
      LIMIT %s;
    """
    try:
        async with await psycopg.AsyncConnection.connect(DATABASE_URL) as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql, (vec, vec, top_k))
                rows = await cur.fetchall()

        return [{
            "id": str(r[0]),
            "score": float(1.0 / (1.0 + r[4])),  # simple convert dist->score
            "kind": "ts_error",
            "source": r[1],
            "meta": {"code": r[2], "message": r[3], "distance": float(r[4])}
        } for r in rows]
    except Exception as e:
        print(f"PGVector search failed: {e}")
        return []

async def hybrid_search(query: str, top_k: int, filters: Optional[Dict[str, Any]] = None):
    # merge qdrant + pgvector
    q_hits = await qdrant_search(query, top_k, filters)
    p_hits = await pgvector_similar_errors(query, top_k)

    by_id = {}
    for h in (q_hits + p_hits):
        by_id[h["id"]] = h if h["id"] not in by_id else (by_id[h["id"]] if by_id[h["id"]]["score"] >= h["score"] else h)

    merged = sorted(by_id.values(), key=lambda x: x["score"], reverse=True)
    return merged[: top_k * 2]  # return a bit extra for KAG expansion
