"""Read-only EmbeddingGemma 2 (`embeddinggemma2:q8_0`) challenger lane helper.

Strictly challenger-only (`canonicalAuthority: false`, `writesPerformed: false`):
`embeddinggemma2:q8_0` produces vectors in an orthogonal space to canonical
`semantic_768` (`embeddinggemma:latest`), so it must only query
`codebase_chunk_eg2_embeddings` and never be written to
`codebase_chunk_index.content_embedding_768`.
"""
from __future__ import annotations

import json
import math
import os
import urllib.request
from typing import Any

DEFAULT_OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/")
EG2_CHALLENGER_MODEL = "embeddinggemma2:q8_0"
EG2_Q8_REPRESENTATION_ID = "embeddinggemma2-q8-challenger"
EG2_Q8_MODEL_REVISION = (
    "unsloth/embeddinggemma-2-GGUF:embeddinggemma-2-Q8_0.gguf@sha256:"
    "6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc"
)
CANONICAL_MODEL = "embeddinggemma:latest"
EXPECTED_DIM = 768


def cosine_similarity_v1(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two equal-length vectors."""
    if len(vec_a) != len(vec_b) or not vec_a:
        raise ValueError(f"Vector length mismatch or empty: {len(vec_a)} vs {len(vec_b)}")
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    na = math.sqrt(sum(a * a for a in vec_a))
    nb = math.sqrt(sum(b * b for b in vec_b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def assert_separate_eg2_lane_v1(target_column: str, model_name: str) -> None:
    """Fail closed if an embeddinggemma2 model targets canonical content_embedding_768."""
    if "embeddinggemma2" in model_name.lower() and target_column == "codebase_chunk_index.content_embedding_768":
        raise ValueError(
            "FORBIDDEN_SPACE_MIX: embeddinggemma2:q8_0 is orthogonal to semantic_768 "
            "and must target codebase_chunk_eg2_embeddings, never codebase_chunk_index.content_embedding_768"
        )


def embed_texts_ollama_v1(
    texts: list[str],
    *,
    model: str = EG2_CHALLENGER_MODEL,
    ollama_url: str = DEFAULT_OLLAMA_URL,
    timeout_s: float = 20.0,
) -> list[list[float]]:
    """Embed texts using Ollama `/api/embed` and validate 768-D finite outputs."""
    if not texts:
        return []
    payload = json.dumps({"model": model, "input": texts}).encode("utf-8")
    req = urllib.request.Request(
        f"{ollama_url.rstrip('/')}/api/embed",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    embeddings = body.get("embeddings") or []
    if len(embeddings) != len(texts):
        raise RuntimeError(f"Expected {len(texts)} embeddings from {model}, got {len(embeddings)}")
    for idx, vec in enumerate(embeddings):
        if len(vec) != EXPECTED_DIM or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in vec):
            raise RuntimeError(f"Invalid {EXPECTED_DIM}-D finite vector at index {idx} from {model}")
    return [[float(v) for v in vec] for vec in embeddings]


def resolve_query_vector_v1(
    q8_vector: list[float],
    *,
    representation_id: str,
    model_revision: str,
    query_vector: list[float] | None,
    query_vector_model_revision: str | None,
) -> tuple[list[float] | None, str]:
    """Reject recipe mixing before a database query; None means use the legacy Q8 encoder."""
    if not representation_id.strip() or not model_revision.strip():
        raise ValueError("EG2_RECIPE_IDENTITY_REQUIRED")
    if query_vector is None:
        if representation_id != EG2_Q8_REPRESENTATION_ID or model_revision != EG2_Q8_MODEL_REVISION:
            raise ValueError("EG2_QUERY_ENCODER_RECIPE_MISMATCH")
        if len(q8_vector) != EXPECTED_DIM or not all(math.isfinite(v) for v in q8_vector):
            raise ValueError("EG2_QUERY_VECTOR_INVALID")
        norm = math.sqrt(sum(v * v for v in q8_vector))
        if not math.isfinite(norm) or norm <= 0 or abs(norm - 1.0) > 0.02:
            raise ValueError("EG2_QUERY_VECTOR_NOT_UNIT_NORMALIZED")
        return None, EG2_Q8_MODEL_REVISION
    if query_vector_model_revision != model_revision:
        raise ValueError("EG2_QUERY_VECTOR_REVISION_MISMATCH")
    if len(query_vector) != EXPECTED_DIM or not all(math.isfinite(v) for v in query_vector):
        raise ValueError("EG2_QUERY_VECTOR_INVALID")
    norm = math.sqrt(sum(v * v for v in query_vector))
    if not math.isfinite(norm) or norm <= 0 or abs(norm - 1.0) > 0.02:
        raise ValueError("EG2_QUERY_VECTOR_NOT_UNIT_NORMALIZED")
    return [float(v) for v in query_vector], model_revision


def probe_eg2_space_orthogonality_v1(
    text: str = "drizzle postgres schema migration",
    *,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> dict[str, Any]:
    """Compare embeddinggemma2:q8_0 vs embeddinggemma:latest on the same text."""
    vec_eg2 = embed_texts_ollama_v1([text], model=EG2_CHALLENGER_MODEL, ollama_url=ollama_url)[0]
    vec_canon = embed_texts_ollama_v1([text], model=CANONICAL_MODEL, ollama_url=ollama_url)[0]
    cos = cosine_similarity_v1(vec_eg2, vec_canon)
    return {
        "schema": "atlas.eg2-space-orthogonality.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "eg2Model": EG2_CHALLENGER_MODEL,
        "canonicalModel": CANONICAL_MODEL,
        "dim": EXPECTED_DIM,
        "crossSpaceCosine": round(cos, 6),
        "orthogonalSpaceConfirmed": abs(cos) < 0.25,
    }


def query_eg2_challenger_readonly_v1(
    query_text: str,
    *,
    dsn: str | None = None,
    top_k: int = 5,
    representation_id: str,
    model_revision: str,
    query_vector: list[float] | None = None,
    query_vector_model_revision: str | None = None,
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> dict[str, Any]:
    """Query one exact EG2 recipe; never fuse or mix recipe/model revisions.

    The default Ollama query encoder is only compatible with the historical Q8
    recipe. Other recipes must supply a query vector produced by the matching
    model revision and identify that revision explicitly.
    """
    import psycopg

    if not 1 <= top_k <= 100:
        raise ValueError("EG2_TOP_K_OUT_OF_RANGE")
    if query_vector is None:
        if representation_id != EG2_Q8_REPRESENTATION_ID or model_revision != EG2_Q8_MODEL_REVISION:
            raise ValueError("EG2_QUERY_ENCODER_RECIPE_MISMATCH: provide a matching query_vector and revision")
        q8_vector = embed_texts_ollama_v1([query_text], model=EG2_CHALLENGER_MODEL, ollama_url=ollama_url)[0]
    else:
        q8_vector = []
    resolved_vector, query_model_revision = resolve_query_vector_v1(
        q8_vector,
        representation_id=representation_id,
        model_revision=model_revision,
        query_vector=query_vector,
        query_vector_model_revision=query_vector_model_revision,
    )
    vec = q8_vector if resolved_vector is None else resolved_vector

    db_url = dsn or os.environ.get("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL environment variable or explicit dsn is required")
    literal = "[" + ",".join(f"{v:.7f}" for v in vec) + "]"
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.source_id::text, c.relative_path, c.symbol,
                       e.representation_id, e.model_revision,
                       1.0 - (e.embedding <=> %s::halfvec) AS cosine_sim
                FROM codebase_chunk_eg2_embeddings e
                JOIN codebase_chunk_index c ON c.id = e.source_id
                WHERE e.representation_id = %s::text
                  AND e.model_revision = %s::text
                ORDER BY e.embedding <=> %s::halfvec
                LIMIT %s
                """,
                (literal, representation_id, model_revision, literal, top_k),
            )
            rows = cur.fetchall()
    return {
        "schema": "atlas.eg2-challenger-query.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "transactionReadOnly": True,
        "model": EG2_CHALLENGER_MODEL if resolved_vector is None else None,
        "queryModelRevision": query_model_revision,
        "representationId": representation_id,
        "modelRevision": model_revision,
        "table": "codebase_chunk_eg2_embeddings",
        "query": query_text,
        "hits": [
            {
                "sourceId": r[0],
                "relativePath": r[1],
                "symbol": r[2],
                "representationId": r[3],
                "modelRevision": r[4],
                "cosineSimilarity": round(float(r[5]), 6),
            }
            for r in rows
        ],
    }
