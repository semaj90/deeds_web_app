#!/usr/bin/env python3
"""
Read-only PostgreSQL 18 Vector Index & Extension Audit (HNSW / IVFFlat / DiskANN-Vamana).

Inspects pg_extension, pg_available_extensions, and pg_indexes under BEGIN READ ONLY
to detect:
1. Installed vs available vector extensions (vector, vectorscale/StreamingDiskANN, pg_diskann/Vamana).
2. HNSW ef_construction drift on canonical codebase_chunk_index.content_embedding_768 (target ef_construction=200 vs 64).
3. Mixed vector_cosine_ops (fp32) vs halfvec_cosine_ops (fp16) across codebase_chunk_index columns.
4. Legacy IVFFlat indexes or redundant IVFFlat + HNSW dual indexes on the same table/column.
5. Duplicate HNSW index definitions on the same table/column.

Authority rule: Strictly read-only diagnostic receipt; performs zero DDL or data mutations.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPORT_PATH = WORKSPACE_ROOT / "docs" / "reports" / "pgvector-hnsw-ivfflat-diskann-audit-v1.json"

INDEX_DEF_RE = re.compile(
    r"USING\s+(?P<am>hnsw|ivfflat|diskann|bm25)\s*\((?P<expr>.+?)\)(?:\s+WITH\s*\((?P<with_opts>[^)]+)\))?",
    re.IGNORECASE,
)


def parse_index_def(indexname: str, tablename: str, indexdef: str) -> dict[str, Any]:
    """Parse a PostgreSQL CREATE INDEX definition into structured metadata."""
    match = INDEX_DEF_RE.search(indexdef)
    if not match:
        return {
            "tablename": tablename,
            "indexname": indexname,
            "accessMethod": "unknown",
            "columnExpr": "",
            "operatorClass": "unknown",
            "options": {},
            "indexdef": indexdef,
        }

    am = match.group("am").lower()
    expr = match.group("expr").strip()
    with_opts_raw = match.group("with_opts") or ""

    parts = expr.split()
    col_name = parts[0] if parts else expr
    op_class = parts[1] if len(parts) > 1 else "default"

    options: dict[str, str] = {}
    if with_opts_raw:
        for kv in with_opts_raw.split(","):
            if "=" in kv:
                k, v = kv.split("=", 1)
                options[k.strip()] = v.strip().strip("'\"")

    precision_lane = (
        "fp16_halfvec"
        if "halfvec" in op_class or "halfvec" in expr
        else ("fp32_vector" if "vector_" in op_class else "other")
    )

    return {
        "tablename": tablename,
        "indexname": indexname,
        "accessMethod": am,
        "columnName": col_name,
        "operatorClass": op_class,
        "precisionLane": precision_lane,
        "options": options,
        "indexdef": indexdef,
    }


def analyze_vector_indexes(
    parsed_indexes: list[dict[str, Any]],
    installed_extensions: list[dict[str, Any]],
    available_extensions: list[dict[str, Any]],
) -> dict[str, Any]:
    """Identify structural drift, duplicates, legacy IVFFlat, and DiskANN/Vamana status."""
    ext_names = {e["extname"] for e in installed_extensions}
    avail_names = {e["name"] for e in available_extensions}

    diskann_extensions = {
        "pgvectorscale_installed": "vectorscale" in ext_names,
        "pg_diskann_installed": "pg_diskann" in ext_names,
        "pgvectorscale_available_in_image": "vectorscale" in avail_names,
        "pg_diskann_available_in_image": "pg_diskann" in avail_names,
        "pgvector_version": next(
            (e["extversion"] for e in installed_extensions if e["extname"] == "vector"),
            None,
        ),
    }

    findings: list[dict[str, Any]] = []

    # 1. Check canonical codebase_chunk_index.content_embedding_768 ef_construction
    for idx in parsed_indexes:
        if (
            idx["tablename"] == "codebase_chunk_index"
            and idx.get("columnName") == "content_embedding_768"
            and idx["accessMethod"] == "hnsw"
        ):
            ef_c = int(idx["options"].get("ef_construction", "64"))
            if ef_c < 200:
                findings.append(
                    {
                        "findingCode": "HNSW_EF_CONSTRUCTION_DRIFT",
                        "severity": "MEDIUM",
                        "tablename": idx["tablename"],
                        "indexname": idx["indexname"],
                        "columnName": idx["columnName"],
                        "observedOptions": idx["options"],
                        "targetOptions": {"m": "16", "ef_construction": "200"},
                        "detail": (
                            f"{idx['indexname']} on canonical content_embedding_768 has "
                            f"ef_construction={ef_c} (target specification is ef_construction=200)."
                        ),
                    }
                )

    # 2. Check legacy IVFFlat and dual IVFFlat+HNSW on same (table, column)
    by_table_col: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for idx in parsed_indexes:
        key = (idx["tablename"], idx.get("columnName", ""))
        by_table_col.setdefault(key, []).append(idx)

    for (tname, cname), group in by_table_col.items():
        ams = {g["accessMethod"] for g in group}
        if "ivfflat" in ams and "hnsw" in ams:
            findings.append(
                {
                    "findingCode": "REDUNDANT_IVFFLAT_AND_HNSW_COEXISTENCE",
                    "severity": "MEDIUM",
                    "tablename": tname,
                    "columnName": cname,
                    "indexes": [g["indexname"] for g in group],
                    "detail": (
                        f"{tname}.{cname} maintains both a legacy IVFFlat index and an HNSW index, "
                        "doubling write amplification without recall benefit."
                    ),
                }
            )
        elif "ivfflat" in ams and "hnsw" not in ams:
            findings.append(
                {
                    "findingCode": "LEGACY_IVFFLAT_ONLY",
                    "severity": "LOW",
                    "tablename": tname,
                    "columnName": cname,
                    "indexes": [g["indexname"] for g in group],
                    "observedOptions": group[0]["options"],
                    "detail": (
                        f"{tname}.{cname} uses legacy IVFFlat ({group[0]['options']}) without an HNSW index."
                    ),
                }
            )

        # 3. Check duplicate HNSW indexes on same (table, column, operatorClass)
        hnsw_group = [g for g in group if g["accessMethod"] == "hnsw"]
        if len(hnsw_group) > 1:
            findings.append(
                {
                    "findingCode": "DUPLICATE_HNSW_INDEX",
                    "severity": "MEDIUM",
                    "tablename": tname,
                    "columnName": cname,
                    "indexes": [g["indexname"] for g in hnsw_group],
                    "detail": (
                        f"{tname}.{cname} has {len(hnsw_group)} duplicate HNSW indexes: "
                        + ", ".join(g["indexname"] for g in hnsw_group)
                    ),
                }
            )

    # 4. Check mixed fp32 vs fp16 halfvec operator classes on codebase_chunk_index
    cci_indexes = [i for i in parsed_indexes if i["tablename"] == "codebase_chunk_index"]
    fp32_cols = sorted({i.get("columnName", "") for i in cci_indexes if i["precisionLane"] == "fp32_vector"})
    fp16_cols = sorted({i.get("columnName", "") for i in cci_indexes if i["precisionLane"] == "fp16_halfvec"})
    if fp32_cols and fp16_cols:
        findings.append(
            {
                "findingCode": "MIXED_FP32_VECTOR_AND_FP16_HALFVEC_INDEXES",
                "severity": "INFO",
                "tablename": "codebase_chunk_index",
                "fp32VectorColumns": fp32_cols,
                "fp16HalfvecColumns": fp16_cols,
                "detail": (
                    "codebase_chunk_index mixes fp32 vector_cosine_ops (canonical content_embedding_768, latent_64) "
                    "and fp16 halfvec_cosine_ops (content_embedding, summary_embedding, error_embedding, latent_128, latent_256). "
                    "Canonical semantic_768 remains fp32 vector_cosine_ops."
                ),
            }
        )

    return {
        "diskannAndVamanaStatus": diskann_extensions,
        "summaryCounts": {
            "totalVectorIndexes": len(parsed_indexes),
            "hnswCount": sum(1 for i in parsed_indexes if i["accessMethod"] == "hnsw"),
            "ivfflatCount": sum(1 for i in parsed_indexes if i["accessMethod"] == "ivfflat"),
            "fp32VectorCount": sum(1 for i in parsed_indexes if i["precisionLane"] == "fp32_vector"),
            "fp16HalfvecCount": sum(1 for i in parsed_indexes if i["precisionLane"] == "fp16_halfvec"),
            "findingsCount": len(findings),
        },
        "findings": findings,
    }


def run_live_audit(dsn: str | None = None, output_path: Path = DEFAULT_REPORT_PATH) -> dict[str, Any]:
    import psycopg2

    db_url = dsn or os.environ.get("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")
    conn = psycopg2.connect(db_url, connect_timeout=5, application_name="atlas_readonly_pgvector_audit")
    try:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            cur.execute("SET LOCAL statement_timeout = '5s'")
            cur.execute(
                "SELECT current_setting('server_version'), current_setting('server_version_num'), "
                "current_setting('io_method', true), current_setting('effective_io_concurrency', true)"
            )
            server_version, server_version_num, io_method, effective_io_concurrency = cur.fetchone()

            cur.execute("SELECT extname, extversion FROM pg_extension ORDER BY extname")
            installed_extensions = [{"extname": r[0], "extversion": r[1]} for r in cur.fetchall()]

            cur.execute(
                """
                SELECT name, default_version, installed_version, comment
                FROM pg_available_extensions
                WHERE name ILIKE '%vec%' OR name ILIKE '%disk%' OR name ILIKE '%ann%' OR name ILIKE '%bm25%' OR name ILIKE '%search%'
                ORDER BY name
                """
            )
            available_extensions = [
                {
                    "name": r[0],
                    "defaultVersion": r[1],
                    "installedVersion": r[2],
                    "comment": r[3],
                }
                for r in cur.fetchall()
            ]

            cur.execute(
                """
                SELECT tablename, indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%' OR indexdef ILIKE '%diskann%')
                ORDER BY tablename, indexname
                """
            )
            raw_indexes = cur.fetchall()

            cur.execute(
                """
                SELECT table_name, column_name, data_type, udt_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name IN ('codebase_chunk_index', 'atlas_feature_map', 'atlas_domain_ontology', 'domain_taxonomy_v1')
                ORDER BY table_name, ordinal_position
                """
            )
            relevant_columns = [
                {"table": r[0], "column": r[1], "dataType": r[2], "udtName": r[3]}
                for r in cur.fetchall()
            ]

            plans: list[dict[str, Any]] = []
            codebase_columns = {item["column"] for item in relevant_columns if item["table"] == "codebase_chunk_index"}
            if "source_ref" in codebase_columns:
                cur.execute(
                    "EXPLAIN (FORMAT JSON, SETTINGS) "
                    "SELECT source_ref FROM public.codebase_chunk_index "
                    "WHERE source_ref IS NOT NULL LIMIT 10"
                )
                plans.append({"name": "codebase_source_ref_bounded_read", "sql": "SELECT source_ref FROM public.codebase_chunk_index WHERE source_ref IS NOT NULL LIMIT 10", "plan": cur.fetchone()[0]})
            if "content_embedding_768" in codebase_columns:
                zero_vector = "[" + ",".join(["0"] * 768) + "]"
                selected_column = "id" if "id" in codebase_columns else "source_ref"
                cur.execute(
                    "EXPLAIN (FORMAT JSON, SETTINGS) "
                    f"SELECT {selected_column} FROM public.codebase_chunk_index "
                    "WHERE content_embedding_768 IS NOT NULL "
                    "ORDER BY content_embedding_768 <=> %s::vector LIMIT 10",
                    (zero_vector,),
                )
                plans.append({"name": "codebase_semantic_768_topk", "sql": f"SELECT {selected_column} FROM public.codebase_chunk_index WHERE content_embedding_768 IS NOT NULL ORDER BY content_embedding_768 <=> $query_vector::vector LIMIT 10", "plan": cur.fetchone()[0]})
        conn.rollback()
    finally:
        conn.close()

    parsed_indexes = [parse_index_def(r[1], r[0], r[2]) for r in raw_indexes]
    analysis = analyze_vector_indexes(parsed_indexes, installed_extensions, available_extensions)

    payload_without_checksum = {
        "schema": "atlas.pgvector-hnsw-ivfflat-diskann-audit.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "readOnlyTransaction": True,
        "server": {
            "version": server_version,
            "versionNum": server_version_num,
            "ioMethod": io_method,
            "effectiveIoConcurrency": effective_io_concurrency,
        },
        "relevantColumns": relevant_columns,
        "representativePlans": plans,
        "authorityNote": "Diagnostic read-only catalog receipt; does not mutate indexes or promote retrieval lanes.",
        "installedExtensions": installed_extensions,
        "availableVectorExtensions": available_extensions,
        **analysis,
        "indexes": parsed_indexes,
    }

    canonical_bytes = json.dumps(payload_without_checksum, sort_keys=True, separators=(",", ":")).encode("utf-8")
    receipt_checksum = f"sha256:{hashlib.sha256(canonical_bytes).hexdigest()}"
    report = {**payload_without_checksum, "receiptChecksum": receipt_checksum}

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    result = run_live_audit()
    print(
        json.dumps(
            {
                "schema": result["schema"],
                "summaryCounts": result["summaryCounts"],
                "diskannAndVamanaStatus": result["diskannAndVamanaStatus"],
                "findingCodes": [f["findingCode"] for f in result["findings"]],
                "receiptChecksum": result["receiptChecksum"],
            },
            indent=2,
        )
    )
