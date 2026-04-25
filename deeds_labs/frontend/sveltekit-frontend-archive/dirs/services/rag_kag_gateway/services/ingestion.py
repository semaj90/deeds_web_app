"""
Ingestion Service - Knowledge base updates
Handles document and run ingestion for learning loop
"""
import hashlib
import json
from datetime import datetime
import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import PointStruct
import psycopg
import uuid

import sys
sys.path.append('..')
from config import (
    QDRANT_URL, QDRANT_COLLECTION,
    OLLAMA_URL, OLLAMA_EMBED_MODEL,
    PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE
)

qdrant = AsyncQdrantClient(url=QDRANT_URL)


def _get_conn_str():
    return f"postgresql://{PG_USER}:{PG_PASSWORD}@{PG_HOST}:{PG_PORT}/{PG_DATABASE}"


async def _get_embedding(text: str) -> list[float]:
    """Generate embedding via Ollama"""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{OLLAMA_URL}/api/embeddings",
            json={"model": OLLAMA_EMBED_MODEL, "prompt": text}
        )
        resp.raise_for_status()
        return resp.json()["embedding"]


async def ingest_document(
    kind: str,
    text: str,
    tags: list[str],
    source: str,
    extra: dict | None = None
) -> dict:
    """
    Ingest a document into Qdrant knowledge base
    """
    try:
        # Generate embedding
        embedding = await _get_embedding(text[:2000])  # Truncate for embedding model

        # Create point
        point_id = str(uuid.uuid4())
        text_hash = hashlib.sha256(text.encode()).hexdigest()[:16]

        point = PointStruct(
            id=point_id,
            vector=embedding,
            payload={
                "kind": kind,
                "text": text,
                "tags": tags,
                "source": source,
                "hash": text_hash,
                "created_at": datetime.utcnow().isoformat(),
                "extra": extra or {}
            }
        )

        # Upsert to Qdrant
        await qdrant.upsert(
            collection_name=QDRANT_COLLECTION,
            points=[point]
        )

        return {
            "success": True,
            "id": point_id,
            "kind": kind,
            "hash": text_hash
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


async def ingest_run(
    run_id: str,
    file: str,
    diff: str,
    pre_errors: int,
    post_errors: int,
    outcome: str,
    prompt_hash: str | None = None,
    retrieved_ids: list[str] | None = None
) -> dict:
    """
    Log an autonomous fix attempt to PostgreSQL for learning
    This feeds the self-improving loop
    """
    conn_str = _get_conn_str()

    # Calculate metrics
    errors_fixed = pre_errors - post_errors
    success_rate = errors_fixed / pre_errors if pre_errors > 0 else 0.0

    try:
        async with await psycopg.AsyncConnection.connect(conn_str) as conn:
            async with conn.cursor() as cur:
                # Create runs table if not exists
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS phase87_runs (
                        id SERIAL PRIMARY KEY,
                        run_id VARCHAR(100) UNIQUE,
                        file_path TEXT,
                        diff TEXT,
                        pre_errors INTEGER,
                        post_errors INTEGER,
                        errors_fixed INTEGER,
                        success_rate FLOAT,
                        outcome VARCHAR(20),
                        prompt_hash VARCHAR(64),
                        retrieved_ids JSONB,
                        created_at TIMESTAMP DEFAULT NOW()
                    )
                """)

                # Insert run
                await cur.execute("""
                    INSERT INTO phase87_runs
                    (run_id, file_path, diff, pre_errors, post_errors, errors_fixed,
                     success_rate, outcome, prompt_hash, retrieved_ids)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (run_id) DO UPDATE SET
                        diff = EXCLUDED.diff,
                        post_errors = EXCLUDED.post_errors,
                        errors_fixed = EXCLUDED.errors_fixed,
                        success_rate = EXCLUDED.success_rate,
                        outcome = EXCLUDED.outcome
                    RETURNING id
                """, (
                    run_id, file, diff, pre_errors, post_errors, errors_fixed,
                    success_rate, outcome, prompt_hash,
                    json.dumps(retrieved_ids) if retrieved_ids else None
                ))

                result = await cur.fetchone()
                await conn.commit()

        # If successful fix, also add to Qdrant for future retrieval
        if outcome == "success" and errors_fixed > 0:
            await ingest_document(
                kind="ace_llm_output",
                text=f"File: {file}\nErrors fixed: {errors_fixed}\nDiff:\n{diff[:1000]}",
                tags=["phase87", "successful_fix", outcome],
                source=file,
                extra={
                    "run_id": run_id,
                    "errors_fixed": errors_fixed,
                    "success_rate": success_rate
                }
            )

        return {
            "success": True,
            "run_id": run_id,
            "errors_fixed": errors_fixed,
            "success_rate": success_rate,
            "outcome": outcome
        }

    except Exception as e:
        return {"success": False, "error": str(e)}
