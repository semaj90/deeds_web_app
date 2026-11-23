"""Build one read-only, exact-task Firecrawl documentation recommendation packet.

The output is a reviewer aid. It does not invoke an LLM or write to canonical stores.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

import psycopg
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from python.atlas_graph_runtime.firecrawl_lexical_api_recommender_v1 import (
    build_rlm_dspy_self_prompt_packet_v1,
    extract_official_api_lexical_signals_v1,
    extract_openspec_task_keywords_v1,
    rank_document_chunks_for_task_v1,
    resolve_workboard_task_v1,
    run_concurrent_rg_keyword_search_v1,
)

DEFAULT_WORKBOARD_PATH = REPO_ROOT / "docs" / "reports" / "openspec-workboard-v1.json"
DEFAULT_REPORT_PATH = REPO_ROOT / "docs" / "reports" / "firecrawl-lexical-task-recommendations-v2.json"


def _load_dsn() -> str:
    load_dotenv(REPO_ROOT / "sveltekit-frontend" / ".env", override=False)
    load_dotenv(REPO_ROOT / ".env", override=False)
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL_REQUIRED")
    return dsn


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only, revision-bound documentation recommendation packet")
    parser.add_argument("--task-key", required=True, help="Exact taskKey or stableKey from the current OpenSpec workboard")
    parser.add_argument("--workboard", type=Path, default=DEFAULT_WORKBOARD_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args()

    workboard_path = args.workboard if args.workboard.is_absolute() else REPO_ROOT / args.workboard
    if not workboard_path.is_file():
        raise RuntimeError("WORKBOARD_SNAPSHOT_MISSING")
    workboard = json.loads(workboard_path.read_text(encoding="utf-8"))
    task_ref = resolve_workboard_task_v1(workboard, args.task_key)
    source_ref = task_ref.get("sourceRef")
    source_path = (REPO_ROOT / source_ref).resolve() if source_ref else None
    if not source_path or REPO_ROOT.resolve() not in source_path.parents or not source_path.is_file():
        raise RuntimeError("TASK_SOURCE_FILE_UNAVAILABLE")
    current_source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if current_source_hash != str(task_ref.get("sourceFileSha256") or "").removeprefix("sha256:"):
        raise RuntimeError("WORKBOARD_SOURCE_SNAPSHOT_STALE")

    with psycopg.connect(_load_dsn()) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path,
                       c.api_signatures, c.domain_tags, c.start_byte, c.end_byte,
                       c.chunk_checksum, p.id::text, p.title, p.url, p.source_authority,
                       p.provider, p.product, p.product_version, p.crawl_revision,
                       p.content_hash, p.evidence_revision
                FROM public.atlas_external_doc_chunks c
                JOIN public.atlas_external_doc_pages p ON p.id = c.page_id
                WHERE p.source_authority = 'OFFICIAL'
                ORDER BY c.chunk_id
            """)
            rows = cur.fetchall()

    document_records: list[dict[str, Any]] = []
    for (chunk_id, chunk_revision, text, heading_path, api_signatures, domain_tags,
         start_byte, end_byte, chunk_checksum, page_id, title, url, source_authority,
         provider, product, product_version, crawl_revision, page_hash, page_revision) in rows:
        if not all((chunk_revision, chunk_checksum, page_id, title, url, provider, product,
                    product_version, crawl_revision, page_hash, page_revision)):
            continue
        if (start_byte is None or end_byte is None or int(end_byte) <= int(start_byte)
                or len((text or "").encode("utf-8")) != int(end_byte) - int(start_byte)):
            continue
        signals = extract_official_api_lexical_signals_v1(
            text=text or "",
            product=product,
            api_signatures=api_signatures or [],
            heading_path=heading_path or [],
            chunk_start_byte=int(start_byte),
        )
        document_records.append({
            "chunkId": chunk_id,
            "evidenceRevision": chunk_revision,
            "chunkChecksum": chunk_checksum,
            "startByte": int(start_byte),
            "endByte": int(end_byte),
            "pageId": page_id,
            "title": title,
            "url": url,
            "sourceAuthority": source_authority,
            "provider": provider,
            "product": product,
            "productVersion": product_version,
            "crawlRevision": crawl_revision,
            "pageContentHash": page_hash,
            "pageEvidenceRevision": page_revision,
            "headingPath": list(heading_path or []),
            "domainTags": list(domain_tags or []),
            "text": text or "",
            "lexicalSignals": signals,
        })

    task = next(row for row in workboard["taskInventory"] if row.get("taskKey") == task_ref["taskKey"])
    keywords = extract_openspec_task_keywords_v1(task, max_keywords=12)
    rg_hits = run_concurrent_rg_keyword_search_v1(
        repo_root=REPO_ROOT, keywords=keywords, max_workers=6,
    )
    recommendations = rank_document_chunks_for_task_v1(
        task_keywords=keywords,
        task_title=task_ref["title"],
        documents=document_records,
        top_k=5,
    )
    packet = build_rlm_dspy_self_prompt_packet_v1(
        task_id=task_ref["stableKey"],
        task_title=task_ref["title"],
        task_keywords=keywords,
        rg_hits_by_keyword=rg_hits,
        recommended_doc_chunks=recommendations,
        task_ref=task_ref,
    )
    report = {
        "schema": "atlas.firecrawl-lexical-task-recommendations.v2",
        "taskRef": task_ref,
        "workboardPath": str(workboard_path),
        "workboardGeneratedAt": workboard.get("generatedAt"),
        "taskKeywords": keywords,
        "officialChunkCount": len(document_records),
        "officialChunksSkippedForMissingCitationCoordinates": len(rows) - len(document_records),
        "repositorySearchHitCount": sum(len(hits) for hits in rg_hits.values()),
        "recommendationCount": len(recommendations),
        "packet": packet,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    output_path = args.output if args.output.is_absolute() else REPO_ROOT / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": report["schema"],
        "taskKey": task_ref["taskKey"],
        "taskRevision": task_ref["taskRevision"],
        "officialChunkCount": report["officialChunkCount"],
        "officialChunksSkippedForMissingCitationCoordinates": report["officialChunksSkippedForMissingCitationCoordinates"],
        "recommendationCount": report["recommendationCount"],
        "reportPath": str(output_path),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
