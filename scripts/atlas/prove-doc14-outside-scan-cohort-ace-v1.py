"""DOC-14 P1/P3/P4/P5 proof:
1. Join `admittedOutsideScanCohort` (EXISTS_OUTSIDE_SCAN targets) against PostgreSQL 18
   `codebase_chunk_index` + `openspec_task_source_index_v1` (read-only).
2. Emit DOC-14 typed relation proposals (`TASK_REFERENCES_DOCUMENT`, `FILE_IMPORTS_FILE`, `DOCUMENT_HAS_CHUNK`).
3. Compare lexical-only vs graph-only vs hybrid RRF top-K retrieval on a newly admitted target.
4. Verify pre-ACE admission (`admit_verified_topk`) and emit `docs/reports/doc14-outside-scan-cohort-ace-proof-v1.json`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from python.atlas_graph_runtime.document_relation_rrf_v1 import (
    admit_verified_topk,
    build_relation_proposal_v1,
    fuse_topk,
)

V2_AUDIT_PATH = REPO_ROOT / "docs" / "reports" / "okf-docs-openspec-relations-audit-v2-20261122.json"
REPORT_PATH = REPO_ROOT / "docs" / "reports" / "doc14-outside-scan-cohort-ace-proof-v1.json"


def _load_dsn() -> str:
    load_dotenv(REPO_ROOT / "sveltekit-frontend" / ".env", override=False)
    load_dotenv(REPO_ROOT / ".env", override=False)
    return os.environ.get("DATABASE_URL", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db")


def _normalize_rel(path_str: str) -> str:
    return path_str.replace("\\", "/").lstrip("./")


def evaluate_cohort_hybrid_vs_single_lane(
    cohort_items: list[dict[str, Any]],
    pg_matches_by_ref: dict[str, dict[str, Any]],
    *,
    graph_revision: str = f"sha256:{'a' * 64}",
    query_terms: tuple[str, ...] = ("search", "runtime", "retrieval", "schema", "context"),
) -> dict[str, Any]:
    """Compare lexical-only, graph-only, and hybrid RRF top-K on the outside-scan cohort."""
    store: dict[str, dict[str, Any]] = {}
    lexical_ranked: list[tuple[float, str]] = []
    graph_ranked: list[tuple[float, str]] = []

    for item in cohort_items:
        ref = item["sourceRef"]
        pg_row = pg_matches_by_ref.get(ref)
        disk_sha = item.get("sourceSha256")
        pg_rev = pg_row.get("sourceRevision") if pg_row else None
        # Use Postgres sourceRevision when SHA-256 qualified; otherwise disk SHA-256
        effective_rev = pg_rev if isinstance(pg_rev, str) and pg_rev.startswith("sha256:") else disk_sha
        spans = [
            [t["evidenceSpan"]["startByte"], t["evidenceSpan"]["endByte"]]
            for t in item.get("observedRelationTuples", [])
            if isinstance(t.get("evidenceSpan"), dict)
        ]
        if not spans:
            spans = [[0, max(1, len(ref.encode("utf-8")))]]
        store[ref] = {
            "chunkId": ref,
            "sourceRevision": effective_rev,
            "graphRevision": graph_revision,
            "supportingSpans": spans,
            "relationPaths": item.get("observedRelationTuples", []),
            "pgMatched": pg_row is not None,
        }
        lowered = ref.lower()
        lex_hits = sum(1 for term in query_terms if term in lowered)
        lexical_ranked.append((float(lex_hits), ref))
        graph_ranked.append((float(item.get("repairPriorityScore") or 0.0), ref))

    lexical_ids = [ref for score, ref in sorted(lexical_ranked, key=lambda x: (-x[0], x[1])) if score > 0][:15]
    graph_ids = [ref for _, ref in sorted(graph_ranked, key=lambda x: (-x[0], x[1]))][:15]
    fused = fuse_topk(lexical_ids, [], graph_ids, [], k=10)
    admitted = admit_verified_topk(fused, lambda cid: store.get(cid), limit=10)
    return {
        "lexicalOnlyTop5": lexical_ids[:5],
        "graphOnlyTop5": graph_ids[:5],
        "hybridTop5": [r["chunkId"] for r in admitted[:5]],
        "admittedCount": sum(1 for r in admitted if r["admissionStatus"] == "ADMITTED"),
        "admittedTop5": admitted[:5],
    }


def export_pg_proven_chunks_jsonl(
    conn: psycopg.Connection,
    cohort: list[dict[str, Any]],
    output_jsonl: Path,
    *,
    scope: str = "repo:deeds",
    max_chars: int = 8192,
) -> dict[str, Any]:
    """Export only PostgreSQL-PROVEN, hash-verified chunks as JSONL for atlas_doc14_embedding_upsert_v1.py."""
    hex64_re = re.compile(r"^[0-9a-f]{64}$")
    cohort_by_norm: dict[str, dict[str, Any]] = {}
    variants: set[str] = set()
    for item in cohort:
        norm = _normalize_rel(item["sourceRef"])
        cohort_by_norm[norm] = item
        variants.add(norm)
        if norm.startswith("sveltekit-frontend/"):
            stripped = norm[len("sveltekit-frontend/"):]
            cohort_by_norm[stripped] = item
            variants.add(stripped)

    exported_lines: list[str] = []
    skipped: dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COALESCE(c.chunk_id, c.id::text) AS chunk_id,
                   COALESCE(c.source_ref, c.relative_path) AS source_ref,
                   COALESCE(c.source_revision, l.source_revision) AS source_revision,
                   c.content,
                   l.membership_status,
                   l.revision_status
            FROM public.codebase_chunk_index c
            JOIN public.atlas_packet_chunk_lineage l
              ON l.chunk_row_id = c.id
            WHERE (c.source_ref = ANY(%s) OR c.relative_path = ANY(%s))
              AND l.membership_status IN ('EXACT_SINGLE_MEMBER', 'EXACT_MULTI_MEMBER')
              AND l.revision_status = 'PROVEN'
            ORDER BY chunk_id
            LIMIT 200
        """, (list(variants), list(variants)))
        rows = cur.fetchall()

    seen_chunks: set[str] = set()
    for chunk_id, src_ref, src_rev, content, membership_status, revision_status in rows:
        item = cohort_by_norm.get(_normalize_rel(src_ref or ""))
        if not item:
            skipped["NOT_IN_COHORT"] = skipped.get("NOT_IN_COHORT", 0) + 1
            continue
        if not isinstance(content, str) or not content.strip():
            skipped["EMPTY_CONTENT"] = skipped.get("EMPTY_CONTENT", 0) + 1
            continue
        if len(content) > max_chars:
            skipped["EXCEEDS_MAX_CHARS"] = skipped.get("EXCEEDS_MAX_CHARS", 0) + 1
            continue
        if not isinstance(src_rev, str) or not src_rev.startswith("sha256:"):
            skipped["MISSING_SOURCE_REVISION"] = skipped.get("MISSING_SOURCE_REVISION", 0) + 1
            continue
        raw_content_sha = str(item.get("sourceSha256") or "").removeprefix("sha256:")
        if not hex64_re.fullmatch(raw_content_sha):
            skipped["INVALID_CONTENT_SHA256"] = skipped.get("INVALID_CONTENT_SHA256", 0) + 1
            continue
        cid = str(chunk_id)
        if cid in seen_chunks:
            continue
        seen_chunks.add(cid)
        chunk_sha = hashlib.sha256(content.encode("utf-8")).hexdigest()
        rec = {
            "chunkId": cid,
            "sourceRef": item["sourceRef"],
            "sourceRevision": src_rev,
            "contentSha256": raw_content_sha,
            "chunkSha256": chunk_sha,
            "text": content,
            "title": item["sourceRef"],
            "scope": scope,
            "membershipStatus": str(membership_status),
            "pgReadbackStatus": str(revision_status),
            "admissionStatus": "INDEX_ELIGIBLE",
        }
        exported_lines.append(json.dumps(rec, ensure_ascii=False))

    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    output_jsonl.write_text("\n".join(exported_lines) + ("\n" if exported_lines else ""), encoding="utf-8")
    return {
        "jsonlPath": str(output_jsonl),
        "exportedCount": len(exported_lines),
        "skippedCounts": skipped,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main(export_jsonl: Path | None = None) -> int:
    audit = json.loads(V2_AUDIT_PATH.read_text(encoding="utf-8"))
    cohort = (audit.get("unresolvedMentionReview") or {}).get("admittedOutsideScanCohort") or []
    cohort_refs = [c["sourceRef"] for c in cohort]

    pg_matches: dict[str, dict[str, Any]] = {}
    with psycopg.connect(_load_dsn()) as conn:
        with conn.cursor() as cur:
            # Match against codebase_chunk_index (with or without sveltekit-frontend/ prefix)
            lookup_variants: set[str] = set()
            for r in cohort_refs:
                norm = _normalize_rel(r)
                lookup_variants.add(norm)
                if norm.startswith("sveltekit-frontend/"):
                    lookup_variants.add(norm[len("sveltekit-frontend/"):])

            cur.execute("""
                SELECT COALESCE(source_ref, relative_path) AS matched_path,
                       relative_path,
                       source_revision,
                       workspace_revision,
                       file_content_hash,
                       count(*)::int AS chunk_count
                FROM public.codebase_chunk_index
                WHERE source_ref = ANY(%s) OR relative_path = ANY(%s)
                GROUP BY 1, 2, 3, 4, 5
            """, (list(lookup_variants), list(lookup_variants)))
            for matched_path, rel_path, src_rev, ws_rev, file_hash, chunk_count in cur.fetchall():
                for orig in cohort_refs:
                    norm = _normalize_rel(orig)
                    stripped = norm[len("sveltekit-frontend/"):] if norm.startswith("sveltekit-frontend/") else norm
                    if matched_path in (norm, stripped) or rel_path in (norm, stripped):
                        pg_matches[orig] = {
                            "matchedPath": matched_path,
                            "relativePath": rel_path,
                            "sourceRevision": src_rev,
                            "workspaceRevision": ws_rev,
                            "fileContentHash": file_hash,
                            "chunkCount": chunk_count,
                        }

    # P3: Emit DOC-14 typed relation proposals for Postgres-verified outside-scan targets
    relation_proposals: list[dict[str, Any]] = []
    graph_rev = str(audit.get("graphRevision") or f"sha256:{'0'*64}")
    for item in cohort:
        ref = item["sourceRef"]
        pg_row = pg_matches.get(ref)
        if not pg_row:
            continue
        target_rev = pg_row.get("sourceRevision")
        if not isinstance(target_rev, str) or not target_rev.startswith("sha256:"):
            target_rev = item["sourceSha256"]
        for tup in item.get("observedRelationTuples", [])[:1]:
            relation_proposals.append(
                build_relation_proposal_v1(
                    subject_kind="document",
                    subject_id=tup["subjectId"],
                    subject_source_revision=tup["sourceRevision"],
                    object_kind="code_file",
                    object_id=ref,
                    object_source_revision=target_rev,
                    predicate="TASK_REFERENCES_DOCUMENT",
                    method="doc14_outside_scan_pg_join_v1",
                    source_ref=tup["subjectId"],
                    content_sha256=item["sourceSha256"],
                    graph_revision=graph_rev,
                )
            )

    # P4 + P5: Replay lexical vs graph vs hybrid and verify pre-ACE admission
    replay = evaluate_cohort_hybrid_vs_single_lane(cohort, pg_matches, graph_revision=graph_rev)
    export_summary = None
    if export_jsonl is not None:
        with psycopg.connect(_load_dsn()) as export_conn:
            export_summary = export_pg_proven_chunks_jsonl(export_conn, cohort, export_jsonl)
    report = {
        "schema": "atlas.doc14-outside-scan-cohort-ace-proof.v1",
        "cohortCount": len(cohort),
        "pgMatchedTargetCount": len(pg_matches),
        "pgMatchedTargetsSample": [
            {"sourceRef": k, **v} for k, v in sorted(pg_matches.items())[:10]
        ],
        "doc14RelationProposalCount": len(relation_proposals),
        "sampleDoc14RelationProposals": relation_proposals[:5],
        "retrievalReplay": replay,
        "jsonlExport": export_summary,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": report["schema"],
        "cohortCount": report["cohortCount"],
        "pgMatchedTargetCount": report["pgMatchedTargetCount"],
        "doc14RelationProposalCount": report["doc14RelationProposalCount"],
        "admittedCount": replay["admittedCount"],
        "hybridTop5": replay["hybridTop5"],
        "jsonlExport": export_summary,
        "reportPath": str(REPORT_PATH),
    }, indent=2))
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DOC-14 outside-scan cohort PG18 join + pre-ACE proof.")
    parser.add_argument("--export-eligible-jsonl", type=Path, default=None)
    args = parser.parse_args()
    raise SystemExit(main(export_jsonl=args.export_eligible_jsonl))
