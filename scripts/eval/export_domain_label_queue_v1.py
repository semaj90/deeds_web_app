#!/usr/bin/env python3
"""Read-only stratified export of codebase_chunk_index rows for human domain labeling.

Exports up to 320 chunks (max 2 per source_ref) with PROPOSAL_ONLY `proposed_label`
and `gold_label: null` so human review never conflates proposals with gold truth.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter
from pathlib import Path
from typing import Any

CLASSES = (
    "retrieval_search",
    "graph_ontology",
    "ui_frontend",
    "storage_schema",
    "ml_inference",
    "legal_regulatory",
)


def load_database_url(env_path: Path) -> str:
    env_url = os.environ.get("DATABASE_URL")
    if env_url:
        return env_url
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL environment variable or sveltekit-frontend/.env entry is required")


def propose_domain_label(source_ref: str, domain_hint: str | None, text_preview: str) -> str:
    """Heuristic PROPOSAL_ONLY label from .okf/path/domain hints (never gold truth)."""
    ref = f"{source_ref} {domain_hint or ''}".lower()
    body = text_preview.lower()

    if any(k in ref for k in ("legal", "statute", "case", "evidence", "court", "citation", "compliance", "contract")):
        return "legal_regulatory"
    if any(k in ref for k in ("retriev", "search", "qdrant", "rrf", "bm25", "rag", "hyperrag", "rerank")):
        return "retrieval_search"
    if any(k in ref for k in ("graph", "neo4j", "gds", "ontology", "okf", "topology", "pagerank", "leiden", "louvain")):
        return "graph_ontology"
    if any(k in ref for k in (".svelte", "routes/(app)", "components/", "ui/", "frontend", "css", "bits-ui")):
        return "ui_frontend"
    if any(k in ref for k in ("drizzle", "schema", "postgres", "pgvector", "migration", "redis", "valkey", "cache", "db/")):
        return "storage_schema"
    if any(k in ref for k in ("onnx", "tensorrt", "trt", "cuda", "gpu", "mlp", "kmeans", "embed", "llama", "torch", "model")):
        return "ml_inference"
    if "select " in body or "create table" in body:
        return "storage_schema"
    if "svelte" in body or "<script" in body:
        return "ui_frontend"
    return "retrieval_search"


def export_queue(
    *,
    limit: int = 320,
    max_per_file: int = 2,
    min_proposed_per_class: int = 45,
    out_path: Path = Path(".tmp/review/domain-label-queue-20261128.jsonl"),
    env_path: Path = Path("sveltekit-frontend/.env"),
) -> dict[str, Any]:
    if out_path.exists():
        raise FileExistsError(f"REFUSING_TO_OVERWRITE_QUEUE: {out_path}")

    import psycopg

    db_url = load_database_url(env_path)
    sql = """
        WITH ranked AS (
          SELECT
            COALESCE(NULLIF(c.chunk_id, ''), c.id::text) AS chunk_id,
            COALESCE(NULLIF(c.source_ref, ''), c.relative_path) AS source_ref,
            COALESCE(
              NULLIF(c.content_hash, ''),
              encode(digest(c.content, 'sha256'), 'hex')
            ) AS sha256,
            COALESCE(NULLIF(c.domain_id, ''), c.domain) AS domain_hint,
            LEFT(c.content, 600) AS text_preview,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(c.source_ref, ''), c.relative_path)
              ORDER BY md5(c.id::text)
            ) AS rn
          FROM codebase_chunk_index c
          WHERE c.content_embedding_768 IS NOT NULL
            AND LENGTH(c.content) >= 120
            AND COALESCE(NULLIF(c.source_ref, ''), c.relative_path) IS NOT NULL
        )
        SELECT chunk_id, source_ref, sha256, domain_hint, text_preview
        FROM ranked
        WHERE rn <= %s
        ORDER BY md5(chunk_id::text)
        LIMIT %s
    """

    supplement_sql = """
        WITH ranked AS (
          SELECT
            COALESCE(NULLIF(c.chunk_id, ''), c.id::text) AS chunk_id,
            COALESCE(NULLIF(c.source_ref, ''), c.relative_path) AS source_ref,
            COALESCE(
              NULLIF(c.content_hash, ''),
              encode(digest(c.content, 'sha256'), 'hex')
            ) AS sha256,
            COALESCE(NULLIF(c.domain_id, ''), c.domain) AS domain_hint,
            LEFT(c.content, 600) AS text_preview,
            ROW_NUMBER() OVER (
              PARTITION BY COALESCE(NULLIF(c.source_ref, ''), c.relative_path)
              ORDER BY md5(c.id::text)
            ) AS rn
          FROM codebase_chunk_index c
          WHERE c.content_embedding_768 IS NOT NULL
            AND LENGTH(c.content) >= 120
            AND COALESCE(NULLIF(c.source_ref, ''), c.relative_path) ~* %s
        )
        SELECT chunk_id, source_ref, sha256, domain_hint, text_preview
        FROM ranked
        WHERE rn <= 2
        ORDER BY md5(chunk_id::text)
        LIMIT %s
    """

    class_path_regex = {
        "ml_inference": "(onnx|tensorrt|trt|cuda|gpu|mlp|kmeans|embed|llama|torch|model)",
        "storage_schema": "(drizzle|schema|postgres|pgvector|migration|redis|valkey|cache|db/)",
        "graph_ontology": "(graph|neo4j|gds|ontology|okf|topology|pagerank|leiden|louvain)",
        "legal_regulatory": "(legal|statute|case|evidence|court|citation|compliance|contract)",
    }

    rows: list[dict[str, Any]] = []
    seen_chunks: set[str] = set()
    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (int(max_per_file), int(limit)))
            for chunk_id, source_ref, sha256, domain_hint, text_preview in cur.fetchall():
                cid = str(chunk_id)
                if cid in seen_chunks:
                    continue
                seen_chunks.add(cid)
                digest = sha256 or hashlib.sha256((text_preview or "").encode("utf-8")).hexdigest()
                proposed = propose_domain_label(str(source_ref), domain_hint, str(text_preview or ""))
                rows.append(
                    {
                        "chunk_id": cid,
                        "source_ref": str(source_ref),
                        "sha256": str(digest),
                        "proposed_label": proposed,
                        "proposal_authority": "PROPOSAL_ONLY",
                        "gold_label": None,
                        "status": "pending_review",
                        "text_preview": str(text_preview or ""),
                    }
                )

            counts = Counter(r["proposed_label"] for r in rows)
            for cls_name, pattern in class_path_regex.items():
                deficit = min_proposed_per_class - counts.get(cls_name, 0)
                if deficit <= 0:
                    continue
                cur.execute(supplement_sql, (pattern, deficit * 3))
                for chunk_id, source_ref, sha256, domain_hint, text_preview in cur.fetchall():
                    if counts.get(cls_name, 0) >= min_proposed_per_class:
                        break
                    cid = str(chunk_id)
                    if cid in seen_chunks:
                        continue
                    proposed = propose_domain_label(str(source_ref), domain_hint, str(text_preview or ""))
                    if proposed != cls_name:
                        continue
                    seen_chunks.add(cid)
                    digest = sha256 or hashlib.sha256((text_preview or "").encode("utf-8")).hexdigest()
                    rows.append(
                        {
                            "chunk_id": cid,
                            "source_ref": str(source_ref),
                            "sha256": str(digest),
                            "proposed_label": proposed,
                            "proposal_authority": "PROPOSAL_ONLY",
                            "gold_label": None,
                            "status": "pending_review",
                            "text_preview": str(text_preview or ""),
                        }
                    )
                    counts[cls_name] += 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("x", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    counts = Counter(r["proposed_label"] for r in rows)
    unique_files = len({r["source_ref"] for r in rows})
    return {
        "schema": "atlas.domain-label-queue.v1",
        "canonical_authority": False,
        "writes_performed": False,
        "transaction_read_only": True,
        "exported_rows": len(rows),
        "unique_source_refs": unique_files,
        "proposed_distribution": dict(sorted(counts.items())),
        "out_path": str(out_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Export stratified PG18 review queue (read-only)")
    parser.add_argument("--limit", type=int, default=320)
    parser.add_argument("--max-per-file", type=int, default=2)
    parser.add_argument("--out", type=Path, default=Path(".tmp/review/domain-label-queue-20261128.jsonl"))
    args = parser.parse_args()
    summary = export_queue(limit=args.limit, max_per_file=args.max_per_file, out_path=args.out)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
