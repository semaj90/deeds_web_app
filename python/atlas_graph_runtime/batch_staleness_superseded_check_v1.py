"""Read-only timestamptz staleness & superseded-document check for batch analysis.

Classifies batch items (`FRESH`, `STALE_TIMESTAMPTZ`, `HASH_OR_REVISION_MISMATCH`,
`SUPERSEDED`, `MISSING`) against PostgreSQL 18 `timestamptz` columns
(`indexed_at`, `updated_at`, `embedding_created_at`) and `atlas_ast_nodes.superseded_by`
so batch pipelines skip stale or superseded documents before spending LLM tokens.

Strictly read-only (`default_transaction_read_only=on`, `canonicalAuthority: False`,
`writesPerformed: False`).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any


def _ensure_utc(dt: datetime | str | None) -> datetime | None:
    if dt is None:
        return None
    if isinstance(dt, str):
        parsed = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    else:
        parsed = dt
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def classify_document_staleness_v1(
    *,
    indexed_at: datetime | str | None,
    source_modified_at: datetime | str | None = None,
    superseded_by: str | None = None,
    stored_hash: str | None = None,
    current_hash: str | None = None,
    max_age_hours: float | None = None,
    now_utc: datetime | None = None,
) -> dict[str, Any]:
    """Classify a single document/chunk record as FRESH, STALE_TIMESTAMPTZ, HASH_OR_REVISION_MISMATCH, or SUPERSEDED."""
    if superseded_by is not None and str(superseded_by).strip():
        return {"status": "SUPERSEDED", "eligibleForBatch": False, "reason": f"superseded_by={superseded_by}"}

    if current_hash and stored_hash and current_hash.strip() != stored_hash.strip():
        return {"status": "HASH_OR_REVISION_MISMATCH", "eligibleForBatch": False, "reason": "content_hash_changed"}

    idx_dt = _ensure_utc(indexed_at)
    src_dt = _ensure_utc(source_modified_at)
    if idx_dt is None:
        return {"status": "STALE_TIMESTAMPTZ", "eligibleForBatch": False, "reason": "missing_indexed_at"}

    if src_dt is not None and src_dt > idx_dt:
        return {"status": "STALE_TIMESTAMPTZ", "eligibleForBatch": False, "reason": "source_modified_after_indexed_at"}

    ref_now = _ensure_utc(now_utc) or datetime.now(timezone.utc)
    age_hours = (ref_now - idx_dt).total_seconds() / 3600.0
    if max_age_hours is not None and age_hours > max_age_hours:
        return {
            "status": "STALE_TIMESTAMPTZ",
            "eligibleForBatch": False,
            "reason": f"age_hours={age_hours:.2f}>{max_age_hours}",
        }

    return {"status": "FRESH", "eligibleForBatch": True, "ageHours": round(age_hours, 2)}


def check_pg18_batch_staleness_v1(
    relative_paths: list[str],
    *,
    max_age_hours: float | None = None,
    dsn: str | None = None,
) -> dict[str, Any]:
    """Check PG18 timestamptz freshness and superseded_by status for a batch of relative_paths."""
    import psycopg

    if not relative_paths:
        raise ValueError("BATCH_RELATIVE_PATHS_EMPTY")
    unique_paths = list(dict.fromkeys(str(p).strip() for p in relative_paths if str(p).strip()))
    if not unique_paths:
        raise ValueError("BATCH_RELATIVE_PATHS_EMPTY")

    db_url = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db",
    )

    chunk_rows: dict[str, tuple[Any, ...]] = {}
    superseded_ast_paths: dict[str, str] = {}
    global_stats: dict[str, Any] = {}

    with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT relative_path,
                       MAX(coalesce(updated_at, indexed_at)) AS latest_ts,
                       MAX(embedding_created_at) AS latest_emb_ts,
                       MAX(content_hash) AS content_hash
                FROM codebase_chunk_index
                WHERE relative_path = ANY(%s)
                GROUP BY relative_path
                """,
                (unique_paths,),
            )
            for rp, latest_ts, latest_emb_ts, c_hash in cur.fetchall():
                chunk_rows[str(rp)] = (latest_ts, latest_emb_ts, c_hash)

            cur.execute(
                """
                SELECT relative_path, MAX(superseded_by)
                FROM atlas_ast_nodes
                WHERE relative_path = ANY(%s)
                  AND coalesce(superseded_by, '') <> ''
                GROUP BY relative_path
                """,
                (unique_paths,),
            )
            for rp, sup in cur.fetchall():
                superseded_ast_paths[str(rp)] = str(sup)

            cur.execute(
                """
                SELECT COUNT(*) FILTER (WHERE coalesce(superseded_by, '') <> '') AS superseded_ast_nodes,
                       COUNT(*) AS total_ast_nodes
                FROM atlas_ast_nodes
                """
            )
            sup_cnt, tot_ast = cur.fetchone()
            global_stats["supersededAstNodes"] = int(sup_cnt)
            global_stats["totalAstNodes"] = int(tot_ast)

    now_utc = datetime.now(timezone.utc)
    results: list[dict[str, Any]] = []
    summary = {"FRESH": 0, "STALE_TIMESTAMPTZ": 0, "SUPERSEDED": 0, "MISSING": 0}

    for rp in unique_paths:
        if rp not in chunk_rows:
            summary["MISSING"] += 1
            results.append({"relativePath": rp, "status": "MISSING", "eligibleForBatch": False})
            continue
        latest_ts, _emb_ts, c_hash = chunk_rows[rp]
        verdict = classify_document_staleness_v1(
            indexed_at=latest_ts,
            superseded_by=superseded_ast_paths.get(rp),
            stored_hash=c_hash,
            max_age_hours=max_age_hours,
            now_utc=now_utc,
        )
        summary[verdict["status"]] = summary.get(verdict["status"], 0) + 1
        results.append({"relativePath": rp, **verdict})

    return {
        "schema": "atlas.batch-staleness-superseded-check.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "transactionReadOnly": True,
        "checkedCount": len(unique_paths),
        "summary": summary,
        "globalAstStats": global_stats,
        "items": results,
    }
