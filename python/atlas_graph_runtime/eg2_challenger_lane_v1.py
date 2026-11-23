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
    ollama_url: str = DEFAULT_OLLAMA_URL,
) -> dict[str, Any]:
    """Run a read-only nearest-neighbor query against codebase_chunk_eg2_embeddings."""
    import psycopg

    db_url = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
    )
    vec = embed_texts_ollama_v1([query_text], model=EG2_CHALLENGER_MODEL, ollama_url=ollama_url)[0]
    literal = "[" + ",".join(f"{v:.7f}" for v in vec) + "]"
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.source_id::text, c.relative_path, c.symbol,
                       1.0 - (e.embedding <=> %s::halfvec) AS cosine_sim
                FROM codebase_chunk_eg2_embeddings e
                JOIN codebase_chunk_index c ON c.id = e.source_id
                ORDER BY e.embedding <=> %s::halfvec
                LIMIT %s
                """,
                (literal, literal, top_k),
            )
            rows = cur.fetchall()
    return {
        "schema": "atlas.eg2-challenger-query.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "transactionReadOnly": True,
        "model": EG2_CHALLENGER_MODEL,
        "table": "codebase_chunk_eg2_embeddings",
        "query": query_text,
        "hits": [
            {
                "sourceId": r[0],
                "relativePath": r[1],
                "symbol": r[2],
                "cosineSimilarity": round(float(r[3]), 6),
            }
            for r in rows
        ],
    }
