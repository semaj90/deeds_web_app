#!/usr/bin/env python3
"""
Unified RAG ingestion service that bridges:
  - MinIO document loading
  - Go SIMD JSON accelerator (HTTP streaming)
  - LangChain chunking + embedding (embeddinggemma via Ollama)
  - Redis embedding cache
  - pgvector + Qdrant vector storage
  - Neo4j knowledge graph enrichment

Exposes FastAPI endpoints:
  POST /rag/ingest   -> stream document(s) into the pipeline with live progress
  GET  /health       -> basic readiness probe
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import AsyncGenerator, Iterable
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
import redis
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain.embeddings import OllamaEmbeddings
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import PGVector, Qdrant
from minio import Minio
from neo4j import GraphDatabase
from pydantic import BaseModel, Field
from qdrant_client import QdrantClient
from sqlalchemy import create_engine

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # dotenv is optional; continue without it
    pass

# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------


def env(key: str, default: Optional[str] = None) -> str:
    value = os.getenv(key, default)
    if value is None:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


# Core service endpoints
GO_SIMD_URL = env("GO_SIMD_URL", "http://localhost:8095/parse")
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434")
QDRANT_URL = env("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = env("QDRANT_COLLECTION", "legal_docs_simd")
PGVECTOR_URL = env(
    "PGVECTOR_URL",
    "postgresql+psycopg2://legal_admin:123456@localhost:5432/legal_ai",
)
PGVECTOR_COLLECTION = env("PGVECTOR_COLLECTION", "legal_docs_pgvector")
REDIS_URL = env("REDIS_URL", "redis://localhost:6379/0")
NEO4J_URL = env("NEO4J_URL", "bolt://localhost:7687")
NEO4J_USER = env("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = env("NEO4J_PASSWORD", "password")
MINIO_ENDPOINT = env("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = env("MINIO_ACCESS_KEY", "minio")
MINIO_SECRET_KEY = env("MINIO_SECRET_KEY", "minio123")
MINIO_USE_TLS = env("MINIO_USE_TLS", "false").lower() == "true"

# Chunking / embedding parameters
CHUNK_SIZE = int(env("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(env("CHUNK_OVERLAP", "120"))
BATCH_SIZE = int(env("EMBED_BATCH_SIZE", "8"))

# Redis key prefix for embeddings
REDIS_EMBED_KEY = env("REDIS_EMBED_KEY", "emb")

# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------


class IngestDocument(BaseModel):
    """Single document ingestion request."""

    id: Optional[str] = Field(
        default=None, description="Stable identifier for the document."
    )
    content: Optional[str] = Field(
        default=None, description="Raw document content. Required if no MinIO object."
    )
    bucket: Optional[str] = Field(
        default=None, description="MinIO bucket name when loading from storage."
    )
    object_name: Optional[str] = Field(
        default=None, description="MinIO object key when loading from storage."
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional metadata to store alongside text."
    )

    def require_content(self) -> bool:
        return self.content is not None

    def require_object(self) -> bool:
        return self.bucket is not None and self.object_name is not None


class IngestRequest(BaseModel):
    """Batch ingestion payload."""

    documents: List[IngestDocument]


# ---------------------------------------------------------------------------
# Service clients
# ---------------------------------------------------------------------------


@dataclass
class Services:
    minio: Minio
    redis: redis.Redis
    text_splitter: RecursiveCharacterTextSplitter
    embedder: OllamaEmbeddings
    qdrant: Qdrant
    pgvector: PGVector
    neo4j: GraphDatabase


def create_services() -> Services:
    minio_client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_USE_TLS,
    )

    redis_client = redis.Redis.from_url(REDIS_URL)

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " "],
    )

    embedder = OllamaEmbeddings(
        model="embeddinggemma:latest",
        base_url=OLLAMA_URL,
    )

    qdrant_client = QdrantClient(url=QDRANT_URL)
    qdrant_store = Qdrant(
        client=qdrant_client,
        collection_name=QDRANT_COLLECTION,
        embedding=embedder,
    )

    engine = create_engine(PGVECTOR_URL)
    pg_store = PGVector(
        connection=engine,
        collection_name=PGVECTOR_COLLECTION,
        embedding_function=embedder,
    )

    neo_driver = GraphDatabase.driver(
        NEO4J_URL, auth=(NEO4J_USER, NEO4J_PASSWORD)
    )

    return Services(
        minio=minio_client,
        redis=redis_client,
        text_splitter=splitter,
        embedder=embedder,
        qdrant=qdrant_store,
        pgvector=pg_store,
        neo4j=neo_driver,
    )


services = create_services()

# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------


def load_from_minio(doc: IngestDocument) -> str:
    """Retrieve object bytes from MinIO and return decoded text."""
    if not doc.require_object():
        raise ValueError("MinIO bucket and object_name are required for retrieval.")
    response = services.minio.get_object(doc.bucket, doc.object_name)
    try:
        data = response.read()
    finally:
        response.close()
        response.release_conn()
    return data.decode("utf-8", errors="replace")


async def stream_to_go_simd(payload: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Send payload to Go SIMD service and yield parsed JSON lines."""
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream("POST", GO_SIMD_URL, content=payload.encode()) as resp:
            if resp.status_code >= 400:
                text = await resp.aread()
                raise HTTPException(
                    status_code=500,
                    detail=f"SIMD service error ({resp.status_code}): {text.decode()}",
                )

            buffer = b""
            async for chunk in resp.aiter_bytes():
                buffer += chunk
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    if not line.strip():
                        continue
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError:
                        continue


def cache_embedding(doc_id: str, embedding: Iterable[float]) -> None:
    vector = np.asarray(list(embedding), dtype=np.float32)
    services.redis.set(f"{REDIS_EMBED_KEY}:{doc_id}", vector.tobytes())


async def embed_chunks(chunks: List[str]) -> List[List[float]]:
    loop = asyncio.get_running_loop()
    embeddings: List[List[float]] = []
    for start in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[start : start + BATCH_SIZE]
        vectors = await loop.run_in_executor(
            None, services.embedder.embed_documents, batch
        )
        embeddings.extend(vectors)
    return embeddings


async def store_vectors(
    chunks: List[str],
    embeddings: List[List[float]],
    base_metadata: Dict[str, Any],
    base_id: str,
) -> None:
    docs = [
        Document(page_content=chunk, metadata={**base_metadata, "chunk": idx})
        for idx, chunk in enumerate(chunks)
    ]

    loop = asyncio.get_running_loop()
    await asyncio.gather(
        loop.run_in_executor(
            None,
            services.qdrant.add_documents,
            docs,
            embeddings,
        ),
        loop.run_in_executor(
            None,
            services.pgvector.add_documents,
            docs,
            embeddings,
        ),
    )

    for idx, vector in enumerate(embeddings):
        cache_embedding(f"{base_id}:{idx}", vector)


async def update_neo4j(metadata: Dict[str, Any], source_id: str) -> None:
    def _run() -> None:
        with services.neo4j.session() as session:
            session.run(
                """
                MERGE (d:Document {id: $id})
                SET d += $props
                WITH d
                FOREACH (court IN CASE WHEN $court IS NULL THEN [] ELSE [$court] END |
                    MERGE (c:Court {name: court})
                    MERGE (d)-[:ISSUED_BY]->(c)
                )
                """,
                id=source_id,
                props={k: v for k, v in metadata.items() if v is not None},
                court=metadata.get("court"),
            )

    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, _run)


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(title="RAG Ingestion Service", version="1.0.0")


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "ok"}


@app.post("/rag/ingest")
async def rag_ingest(request: IngestRequest):
    start_time = time.time()

    async def event_stream() -> AsyncGenerator[bytes, None]:
        processed = 0
        for doc in request.documents:
            try:
                content = doc.content
                if content is None:
                    content = load_from_minio(doc)

                parsed_docs = []
                async for parsed in stream_to_go_simd(content):
                    parsed_docs.append(parsed)

                if not parsed_docs:
                    raise ValueError("SIMD parser returned no content.")

                for parsed in parsed_docs:
                    base_id = parsed.get("id") or doc.id or f"doc-{processed}"
                    base_metadata = {
                        **doc.metadata,
                        "parsed": parsed,
                    }

                    chunks = services.text_splitter.split_text(parsed.get("content", ""))
                    embeddings = await embed_chunks(chunks)
                    await store_vectors(chunks, embeddings, base_metadata, base_id)

                    # Optionally run entity extraction with metadata prompt
                    # (Placeholder: replicate parsed metadata directly)
                    await update_neo4j(parsed, base_id)

                    processed += 1
                    payload = {
                        "id": base_id,
                        "chunks": len(chunks),
                        "elapsed_ms": int((time.time() - start_time) * 1000),
                    }
                    yield (json.dumps(payload) + "\n").encode()

            except Exception as exc:  # noqa: BLE001
                error_payload = {
                    "error": str(exc),
                    "document": doc.id or doc.object_name or "unknown",
                }
                yield (json.dumps(error_payload) + "\n").encode()

    return StreamingResponse(event_stream(), media_type="application/jsonl")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(env("PORT", "8080")))
