#!/usr/bin/env python3
"""Compare bounded cuVS CAGRA results against exact PostgreSQL cosine KNN.

This is a read-only challenger proof over one frozen in-memory cohort. It
never writes to PostgreSQL, changes retrieval routing, or promotes a model.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import numpy as np
import psycopg2


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPO_ROOT / "docs" / "reports" / "cagra-postgres-parity-v1.json"
DEFAULT_ROWS = 8192
DEFAULT_QUERIES = 32
TOP_K = 10
SEED = 20261018


def _database_url() -> str:
    for path in (REPO_ROOT / ".env", REPO_ROOT / "sveltekit-frontend" / ".env"):
        if not path.exists():
            continue
        match = re.search(r"^DATABASE_URL=(.+)$", path.read_text(errors="ignore"), re.MULTILINE)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL_NOT_FOUND")


def _wsl_database_url() -> str:
    parts = urlsplit(_database_url())
    if not parts.scheme or not parts.hostname:
        raise RuntimeError("DATABASE_URL_INVALID")
    netloc = parts.netloc.rsplit("@", 1)
    host = "127.0.0.1:5434"
    rewritten = f"{netloc[0]}@{host}" if len(netloc) == 2 else host
    return urlunsplit((parts.scheme, rewritten, parts.path, parts.query, parts.fragment))


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _load_corpus(row_limit: int) -> tuple[list[str], np.ndarray, list[str | None], list[str | None]]:
    connection = psycopg2.connect(_wsl_database_url(), application_name="atlas-cagra-postgres-parity-v1")
    try:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '180s'")
            cursor.execute("""
                SELECT id::text, content_embedding_768::text,
                       source_revision::text, workspace_revision::text
                  FROM public.codebase_chunk_index
                 WHERE content_embedding_768 IS NOT NULL
                 ORDER BY md5(id::text), id
                 LIMIT %s
            """, (row_limit,))
            rows = cursor.fetchall()
        connection.rollback()
    finally:
        connection.close()
    if len(rows) < max(64, DEFAULT_QUERIES + TOP_K + 1):
        raise RuntimeError(f"INSUFFICIENT_COHORT_ROWS:{len(rows)}")
    ids = [str(row[0]) for row in rows]
    vectors = np.empty((len(rows), 768), dtype=np.float32)
    for ordinal, row in enumerate(rows):
        values = np.fromstring(row[1].strip("[]"), sep=",", dtype=np.float32)
        if values.shape != (768,) or not np.isfinite(values).all():
            raise RuntimeError(f"INVALID_VECTOR_AT_ORDINAL:{ordinal}")
        vectors[ordinal] = values
    return ids, vectors, [row[2] for row in rows], [row[3] for row in rows]


def _postgres_exact(ids: list[str], vectors: np.ndarray, query_ordinals: list[int]) -> list[list[str]]:
    connection = psycopg2.connect(_wsl_database_url(), application_name="atlas-cagra-postgres-exact-oracle-v1")
    exact_rows: list[list[str]] = []
    try:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL statement_timeout = '180s'")
            cursor.execute("SET LOCAL enable_indexscan = off")
            for ordinal in query_ordinals:
                query_text = "[" + ",".join(format(float(value), ".9g") for value in vectors[ordinal]) + "]"
                cursor.execute("""
                    SELECT id::text
                      FROM public.codebase_chunk_index
                     WHERE id = ANY(%s::uuid[])
                       AND content_embedding_768 IS NOT NULL
                       AND id <> %s::uuid
                     ORDER BY content_embedding_768 <=> %s::vector(768), id
                     LIMIT %s
                """, (ids, ids[ordinal], query_text, TOP_K))
                result = [str(row[0]) for row in cursor.fetchall()]
                if len(result) != TOP_K:
                    raise RuntimeError(f"POSTGRES_EXACT_RESULT_COUNT:{ordinal}:{len(result)}")
                exact_rows.append(result)
        connection.rollback()
    finally:
        connection.close()
    return exact_rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    parser.add_argument("--queries", type=int, default=DEFAULT_QUERIES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not (TOP_K + 2 <= args.rows <= 16000) or not (1 <= args.queries <= 64):
        raise SystemExit("BOUNDS: rows 12..16000; queries 1..64")

    ids, vectors, source_revisions, workspace_revisions = _load_corpus(args.rows)
    if len(set(ids)) != len(ids):
        raise RuntimeError("DUPLICATE_CANONICAL_ROW_IDS")
    rng = np.random.default_rng(SEED)
    query_ordinals = sorted(int(value) for value in rng.choice(len(ids), size=min(args.queries, len(ids)), replace=False))
    query_vectors = vectors[np.asarray(query_ordinals, dtype=np.int64)]
    exact_ids = _postgres_exact(ids, vectors, query_ordinals)

    import cuvs
    from atlas_compute.ann_compare import compare_cuvs_exact_and_cagra

    started = time.perf_counter()
    comparison = compare_cuvs_exact_and_cagra(
        vectors,
        query_vectors,
        metric="cosine",
        k=TOP_K,
        query_corpus_ordinals=query_ordinals,
        graph_degree=64,
        intermediate_graph_degree=128,
        build_algo="ivf_pq",
        search_width=1,
        itopk_size=64,
    )
    elapsed_ms = (time.perf_counter() - started) * 1000.0

    pg_recalls: list[float] = []
    result_rows = []
    for query_index, ordinal in enumerate(query_ordinals):
        cagra_ids = [ids[value] for value in comparison.comparisons[query_index].cagra_ordinals]
        overlap = len(set(exact_ids[query_index]) & set(cagra_ids))
        recall = overlap / TOP_K
        pg_recalls.append(recall)
        result_rows.append({
            "queryChunkId": ids[ordinal],
            "queryOrdinal": ordinal,
            "postgresExactTopK": exact_ids[query_index],
            "cagraTopK": cagra_ids,
            "recallAtK": recall,
        })

    vector_bytes = vectors.tobytes(order="C")
    identity_bytes = "\n".join(ids).encode("utf-8")
    receipt = {
        "schema": "atlas.cagra-postgres-parity-receipt.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "CAGRA_POSTGRES_EXACT_PARITY_DIAGNOSTIC",
        "canonicalAuthority": False,
        "productionRoutingChanged": False,
        "databaseWritesPerformed": False,
        "representation": {
            "column": "public.codebase_chunk_index.content_embedding_768",
            "dimensions": 768,
            "metric": "cosine",
            "lineageQualification": "PARTIAL_OR_UNQUALIFIED",
            "rowsWithSourceRevision": sum(value is not None for value in source_revisions),
            "rowsWithWorkspaceRevision": sum(value is not None for value in workspace_revisions),
        },
        "cohort": {
            "rows": len(ids),
            "queryRows": len(query_ordinals),
            "topK": TOP_K,
            "selection": "ORDER BY md5(id::text), id; frozen in memory for both exact PG and cuVS/CAGRA",
            "seed": SEED,
            "vectorSha256": _sha256(vector_bytes),
            "identityOrderSha256": _sha256(identity_bytes),
            "queryOrdinalSha256": _sha256(",".join(map(str, query_ordinals)).encode("ascii")),
        },
        "executors": {
            "postgresExact": "pgvector cosine sort over exact frozen cohort IDs; self excluded; id tie-break",
            "challenger": "cuVS CAGRA on CUDA using the same FP32 vector/query arrays",
            "cuvsVersion": getattr(cuvs, "__version__", "unknown"),
            "cagraBuildMs": comparison.cagra_build_ms,
            "cagraSearchMs": comparison.cagra_search_ms,
            "cuvsExactSearchMs": comparison.exact_search_ms,
            "totalElapsedMs": elapsed_ms,
            "gpuMemoryTelemetry": {
                "source": "rapids-sidecar-cupy",
                "admissionGrade": False,
                "note": "CUDA runtime memory info is diagnostic only on this WDDM host; use NVML or nvidia-smi for admission.",
            },
            "gpuFreeMiBBefore": comparison.gpu_free_mb_before,
            "gpuFreeMiBAfter": comparison.gpu_free_mb_after,
            "parameters": {
                "graphDegree": comparison.graph_degree,
                "intermediateGraphDegree": comparison.intermediate_graph_degree,
                "buildAlgorithm": comparison.build_algo,
                "searchWidth": comparison.search_width,
                "itopkSize": comparison.itopk_size,
            },
        },
        "parity": {
            "meanRecallAtKAgainstPostgres": statistics.fmean(pg_recalls),
            "minimumRecallAtKAgainstPostgres": min(pg_recalls),
            "meanCagraRecallAgainstCuVSExact": comparison.mean_recall_at_k,
            "perQuery": result_rows,
        },
        "limitations": [
            "Bounded 16K-row maximum diagnostic cohort; not full-corpus retrieval evaluation.",
            "No reviewed relevance judgments; nearest-neighbor parity is not semantic quality.",
            "Missing source/workspace revisions prevent production evidence qualification.",
            "No durable cuVS GPU lease was issued; this was an operator-approved diagnostic after idle :8090 shutdown, and CuPy memory samples are not admission-grade.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: receipt[key] for key in ("schema", "status", "cohort", "executors", "parity", "limitations")}, indent=2))
    print(f"receipt={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
