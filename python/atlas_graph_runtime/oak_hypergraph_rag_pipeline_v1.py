"""End-to-end read-only OaK + PG18 pgvector/KMeans + DSPy lm15 HyperGraphRAG pipeline.

Connects:
1. SSD-backed PG18 `pgvector` HNSW + optional `kmeans_cluster` / FTS prefill
   (`fetch_pgvector_kmeans_dag_prefill_v1`)
2. SHA-256-sealed `ContextManifest` + allowlisted read-only OaK ops
   (`build_sealed_oak_manifest_v1`, `verify_sealed_oak_manifest_v1`)
3. Bounded chunk-content hydration (`[:900]` chars for `<= 4` hits)
4. Bounded `dspy.Predict` (`engine="lm15"`) cited recommendation
   (`run_dspy_predict_ace_recommender_v1`)

Strictly non-canonical and read-only (`canonicalAuthority: False`,
`writesPerformed: False`, `hiddenStatePersisted: False`).
"""
from __future__ import annotations

import os
from typing import Any, Callable, Mapping, Sequence

from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (
    ScopedAceReadbackV1,
    run_dspy_predict_ace_recommender_v1,
)
from atlas_graph_runtime.pgvector_kmeans_dag_prefill_v1 import (
    fetch_pgvector_kmeans_dag_prefill_v1,
)
from atlas_graph_runtime.sealed_oak_manifest_v1 import (
    OAK_ALLOWLISTED_READONLY_OPS,
    build_sealed_oak_manifest_v1,
    verify_sealed_oak_manifest_v1,
)


def _hydrate_chunk_texts_readonly_v1(
    chunk_ids: list[str],
    *,
    dsn: str | None = None,
    max_chars: int = 900,
) -> dict[str, dict[str, str]]:
    """Fetch bounded chunk text + source_revision from PG18 read-only for cited verification."""
    import psycopg

    if not chunk_ids:
        return {}
    db_url = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
    )
    out: dict[str, dict[str, str]] = {}
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, relative_path, source_revision,
                       left(coalesce(content, ''), %s)
                FROM codebase_chunk_index
                WHERE id::text = ANY(%s)
                """,
                (int(max_chars), chunk_ids),
            )
            for cid, rel_path, src_rev, text in cur.fetchall():
                if not isinstance(src_rev, str) or not src_rev.strip():
                    continue
                out[str(cid)] = {
                    "chunkId": str(cid),
                    "sourceRef": str(rel_path or ""),
                    "sourceRevision": str(src_rev or "pg18:unversioned"),
                    "text": str(text or ""),
                }
    return out


def run_sealed_oak_hypergraph_rag_v1(
    *,
    task_id: str,
    query_text: str,
    source_revision: str | None = None,
    workspace_revision: str | None = None,
    graph_snapshot_revision: str | None = None,
    top_k: int = 4,
    ef_search: int = 40,
    kmeans_clusters: list[int] | None = None,
    kmeans_model_version: str | None = None,
    fts_query: str | None = None,
    dsn: str | None = None,
    base_url: str = "http://127.0.0.1:8090",
    lm: Any | None = None,
    prefill_result: dict[str, Any] | None = None,
    hydrated_chunks: dict[str, dict[str, str]] | None = None,
    context_manifest_v2: Mapping[str, Any] | None = None,
    ace_records: Sequence[dict[str, Any]] | None = None,
    scoped_ace_readback: ScopedAceReadbackV1 | None = None,
    token_counter: Callable[[str], int] | None = None,
    model_revision: str | None = None,
    program_revision: str = "atlas.doc14-dspy-predict-ace.v1",
) -> dict[str, Any]:
    """Run diagnostic OAK prefill; synthesize only from a separate admitted ACE V2 manifest."""
    prefill = prefill_result or fetch_pgvector_kmeans_dag_prefill_v1(
        query_text,
        top_k=top_k,
        ef_search=ef_search,
        kmeans_clusters=kmeans_clusters,
        kmeans_model_version=kmeans_model_version,
        fts_query=fts_query,
        dsn=dsn,
    )
    hits = prefill.get("hits") or []
    source_refs = [h["relativePath"] for h in hits if h.get("relativePath")]
    if not source_refs:
        return {
            "schema": "atlas.oak-hypergraph-rag-pipeline.v1",
            "status": "NO_PREFILL_HITS",
            "canonicalAuthority": False,
            "writesPerformed": False,
            "hiddenStatePersisted": False,
        }

    if not all(isinstance(value, str) and value.strip() for value in (
        source_revision, workspace_revision, graph_snapshot_revision,
    )):
        return {
            "schema": "atlas.oak-hypergraph-rag-pipeline.v1",
            "status": "PREFILL_LINEAGE_REQUIRED",
            "canonicalAuthority": False,
            "writesPerformed": False,
            "hiddenStatePersisted": False,
        }

    sealed_manifest = build_sealed_oak_manifest_v1(
        task_id=task_id,
        source_refs=source_refs,
        source_revision=source_revision,
        workspace_revision=workspace_revision,
        graph_snapshot_revision=graph_snapshot_revision,
        allowed_oak_ops=OAK_ALLOWLISTED_READONLY_OPS,
        prefill_hits=hits,
    )
    if not verify_sealed_oak_manifest_v1(sealed_manifest):
        raise RuntimeError("SEALED_MANIFEST_VERIFICATION_FAILED")

    chunk_ids = [str(h["chunkId"]) for h in hits[:top_k]]
    hydrated = (
        hydrated_chunks
        if hydrated_chunks is not None
        else _hydrate_chunk_texts_readonly_v1(chunk_ids, dsn=dsn)
    )
    if context_manifest_v2 is None or scoped_ace_readback is None:
        recommendation = {
            "schema": "atlas.dspy-predict-ace-recommendation.v1",
            "status": "CANONICAL_ACE_CONTEXT_REQUIRED",
            "citationVerified": False,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }
    else:
        recommendation = run_dspy_predict_ace_recommender_v1(
            task_query=query_text,
            context_manifest=context_manifest_v2,
            records=ace_records,
            scoped_readback=scoped_ace_readback,
            lm=lm,
            base_url=base_url,
            max_chunks=top_k,
            model_revision=model_revision,
            program_revision=program_revision,
            token_counter=token_counter,
        )

    return {
        "schema": "atlas.oak-hypergraph-rag-pipeline.v1",
        "status": recommendation.get("status", "UNKNOWN"),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "prefillManifestChecksum": sealed_manifest["manifestChecksum"],
        "allowedOakOps": sealed_manifest["allowedOakOps"],
        "memoryTelemetry": prefill.get("memoryTelemetry"),
        "recommendation": recommendation,
    }
