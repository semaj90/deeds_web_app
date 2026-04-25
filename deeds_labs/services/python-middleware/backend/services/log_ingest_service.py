"""
Log Ingest Service - AVX2-Optimized Error Pipeline
Handles: AST/TS/Svelte logs → SIMD parse → embeddings → storage → RL scoring
"""
from __future__ import annotations
import os
import hashlib
import asyncio
from typing import List, Dict, Any
from datetime import datetime

import httpx
import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance

# CPU optimization flags for 11th gen Intel
os.environ.setdefault("GOAMD64", "v3")  # AVX2 support
os.environ.setdefault("CGO_CFLAGS", "-march=native -O3")

SIMD_JSON_URL = os.getenv("SIMD_JSON_URL", "http://localhost:8096")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
EMBED_MODEL = os.getenv("EMBED_MODEL", "embeddinggemma:latest")
EMBED_DIM = int(os.getenv("EMBED_DIM", "768"))

redis_client = redis.from_url(REDIS_URL, decode_responses=False)
qdrant_client = QdrantClient(url=QDRANT_URL)

class ErrorLogEntry:
    """Normalized error entry"""
    def __init__(self, route_path: str, file_path: str, code: str,
                 message: str, line: int, column: int, severity: str):
        self.route_path = route_path
        self.file_path = file_path
        self.code = code
        self.message = message
        self.line = line
        self.column = column
        self.severity = severity
        self.hash = self._compute_hash()
        self.timestamp = datetime.utcnow()

    def _compute_hash(self) -> str:
        """Unique hash for deduplication"""
        content = f"{self.file_path}:{self.line}:{self.column}:{self.code}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def to_text(self) -> str:
        """Format for embedding"""
        return f"{self.code}: {self.message}\n{self.file_path}:{self.line}:{self.column}"

async def parse_with_simd(raw_log: str) -> Dict[str, Any]:
    """Step 1: Parse raw tool output with AVX2-optimized SIMD JSON"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{SIMD_JSON_URL}/parse",
            json={"json": raw_log}
        )
        resp.raise_for_status()
        return resp.json()

async def embed_texts_cached(texts: List[str]) -> List[List[float]]:
    """Step 2: Generate embeddings with Redis cache"""
    REDIS_EMB_PREFIX = "emb:gemma:"

    # Check cache
    keys = [f"{REDIS_EMB_PREFIX}{hashlib.sha256(t.encode()).hexdigest()}"
            for t in texts]
    cached = await redis_client.mget(keys)

    cache_hits = []
    missing_indices = []
    missing_texts = []

    for i, blob in enumerate(cached):
        if blob:
            import numpy as np
            arr = np.frombuffer(blob, dtype="float32")
            cache_hits.append(arr.tolist())
        else:
            cache_hits.append(None)
            missing_indices.append(i)
            missing_texts.append(texts[i])

    # Fetch missing embeddings
    if missing_texts:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_HOST}/api/embeddings",
                json={"model": EMBED_MODEL, "prompt": missing_texts}
            )
            resp.raise_for_status()
            data = resp.json()

            # Cache new embeddings
            import numpy as np
            pipe = redis_client.pipeline()
            for idx, embedding in zip(missing_indices, data.get("embeddings", [])):
                arr = np.array(embedding, dtype="float32")
                cache_hits[idx] = arr.tolist()
                pipe.set(keys[idx], arr.tobytes(), ex=86400)  # 24h TTL
            await pipe.execute()

    return cache_hits


async def store_in_postgres(db: AsyncSession, errors: List[ErrorLogEntry],
                            vectors: List[List[float]]) -> None:
    """Step 3: Store in Postgres 17 + pgvector"""
    import sqlalchemy as sa

    table = sa.Table("error_embedding", sa.MetaData(), autoload_with=db.bind)

    rows = []
    for e, vec in zip(errors, vectors):
        rows.append({
            "route_path": e.route_path,
            "error_code": e.code,
            "message": e.message,
            "file_path": e.file_path,
            "hash": e.hash,
            "embedding": vec,
            "fixed": False,
        })

    await db.execute(
        sa.insert(table).values(rows).on_conflict_do_nothing(index_elements=["hash"])
    )
    await db.commit()

async def upsert_to_qdrant(errors: List[ErrorLogEntry],
                           vectors: List[List[float]]) -> None:
    """Step 4: Mirror to Qdrant for fast similarity search"""
    collection = "error_embeddings"

    # Ensure collection exists
    try:
        qdrant_client.get_collection(collection)
    except:
        qdrant_client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE)
        )

    points = []
    for e, vec in zip(errors, vectors):
        points.append(PointStruct(
            id=int(hashlib.sha256(e.hash.encode()).hexdigest()[:16], 16) % (2**63),
            vector=vec,
            payload={
                "route_path": e.route_path,
                "error_code": e.code,
                "message": e.message,
                "file_path": e.file_path,
                "severity": e.severity,
                "timestamp": e.timestamp.isoformat(),
            }
        ))

    qdrant_client.upsert(collection_name=collection, points=points)

async def score_with_rl_head(errors: List[ErrorLogEntry],
                             feature_vectors: List[List[float]]) -> List[Dict[str, Any]]:
    """Step 5: Send to C++/CUDA RL head for action scoring"""
    RL_HEAD_URL = os.getenv("RL_HEAD_URL", "http://localhost:8097")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{RL_HEAD_URL}/score_batch",
            json={
                "features": feature_vectors,
                "metadata": [{"hash": e.hash, "code": e.code} for e in errors]
            }
        )
        resp.raise_for_status()
        return resp.json()["actions"]

async def ingest_log_batch(raw_logs: List[str], db: AsyncSession) -> Dict[str, Any]:
    """
    Main pipeline: raw logs → SIMD parse → normalize → embed → store → RL score
    """
    # Step 1: Parse with SIMD (AVX2-optimized)
    parsed_logs = await asyncio.gather(*[parse_with_simd(log) for log in raw_logs])

    # Step 2: Normalize to ErrorLogEntry
    errors = []
    for parsed in parsed_logs:
        for err in parsed.get("errors", []):
            errors.append(ErrorLogEntry(
                route_path=parsed.get("route_path", "unknown"),
                file_path=parsed.get("file_path", "unknown"),
                code=err.get("code", "UNKNOWN"),
                message=err.get("message", ""),
                line=err.get("line", 0),
                column=err.get("column", 0),
                severity=err.get("severity", "error")
            ))

    if not errors:
        return {"status": "no_errors", "count": 0}

    # Step 3: Generate embeddings (with Redis cache)
    texts = [e.to_text() for e in errors]
    vectors = await embed_texts_cached(texts)

    # Step 4: Store in Postgres + pgvector
    await store_in_postgres(db, errors, vectors)

    # Step 5: Mirror to Qdrant
    await upsert_to_qdrant(errors, vectors)

    # Step 6: Build 1024-d feature vectors (simplified - extend with AST graph features)
    feature_vectors = []
    for vec in vectors:
        # Pad/extend to 1024-d with zeros (in production, add AST/graph/runtime features)
        extended = vec + [0.0] * (1024 - len(vec))
        feature_vectors.append(extended[:1024])

    # Step 7: Score with RL head
    actions = await score_with_rl_head(errors, feature_vectors)

    return {
        "status": "success",
        "errors_ingested": len(errors),
        "actions": actions,
        "timestamp": datetime.utcnow().isoformat()
    }

async def find_similar_errors(query_text: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """Query Qdrant for similar errors we've seen before"""
    # Generate embedding for query
    vectors = await embed_texts_cached([query_text])
    query_vector = vectors[0]

    # Search Qdrant
    results = qdrant_client.search(
        collection_name="error_embeddings",
        query_vector=query_vector,
        limit=top_k
    )

    return [
        {
            "score": hit.score,
            "error_code": hit.payload["error_code"],
            "message": hit.payload["message"],
            "file_path": hit.payload["file_path"],
            "route_path": hit.payload["route_path"],
        }
        for hit in results
    ]
