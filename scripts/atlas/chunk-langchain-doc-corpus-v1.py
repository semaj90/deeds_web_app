#!/usr/bin/env python3
"""Build local, version-qualified chunks from a verified LangChain fetch receipt.

This is an adapter over the existing Parent Atlas document coordinate and
chunking owners. It emits immutable local artifacts only: no embeddings,
database admission, vector projection, or cache writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import tempfile
import sys
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

import atlas_okf_docs_pipeline as P  # noqa: E402
from atlas_external_docs import _normalize_ws  # noqa: E402


def _sha(payload: bytes) -> str:
    return "sha256:" + hashlib.sha256(payload).hexdigest()


def _stable(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _title(product: str, url: str, text: str) -> str:
    for line in text.splitlines():
        match = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if match:
            return match.group(1)
    path = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    return f"{product}: {path or product}"


def _allowed_prefixes(config: dict[str, Any]) -> dict[str, tuple[str, str, str]]:
    corpus = config.get("corpusId")
    authority = urlparse(str(config.get("authority", "")))
    if not corpus or authority.scheme != "https" or not authority.hostname:
        raise ValueError("CORPUS_CONFIG_ID_OR_AUTHORITY_INVALID")
    sections: dict[str, tuple[str, str, str]] = {}
    for section in config.get("sections", []):
        section_id = section.get("id")
        product = section.get("product")
        prefix = section.get("allowedPathPrefix")
        language = section.get("language", "python")
        if not all(isinstance(value, str) and value for value in (section_id, product, prefix)):
            raise ValueError("CORPUS_SECTION_CONFIG_INVALID")
        if not isinstance(language, str) or not language.strip():
            raise ValueError("CORPUS_SECTION_LANGUAGE_INVALID")
        if not prefix.startswith("/") or not prefix.endswith("/") or section_id in sections:
            raise ValueError("CORPUS_SECTION_PREFIX_INVALID")
        sections[section_id] = (product, prefix, language.strip().lower())
    if not sections:
        raise ValueError("CORPUS_SECTIONS_REQUIRED")
    return sections


def build_chunks(
    input_dir: Path,
    corpus_config_path: Path,
    *,
    chunk_sink: Callable[[bytes], None] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    input_dir = input_dir.resolve(strict=True)
    receipt_path = input_dir / "receipt.json"
    manifest_path = input_dir / "pages.jsonl"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    config = json.loads(corpus_config_path.read_text(encoding="utf-8"))
    prefixes = _allowed_prefixes(config)
    if receipt.get("schema") != "atlas.langchain-doc-fetch-receipt.v1":
        raise ValueError("FETCH_RECEIPT_SCHEMA_MISMATCH")
    if receipt.get("writes", {}).get("postgres") != 0 or receipt.get("writes", {}).get("qdrant") != 0:
        raise ValueError("FETCH_RECEIPT_NOT_ARTIFACT_ONLY")
    manifest_bytes = manifest_path.read_bytes()
    if _sha(manifest_bytes) != receipt.get("pagesManifestSha256"):
        raise ValueError("FETCH_MANIFEST_CHECKSUM_MISMATCH")

    rows = [json.loads(line) for line in manifest_bytes.decode("utf-8").splitlines() if line.strip()]
    failures = receipt.get("failures")
    if not isinstance(failures, list):
        raise ValueError("FETCH_FAILURE_ROWS_REQUIRED")
    if len(rows) != receipt.get("fetchedPageCount") or len(failures) != receipt.get("failedPageCount"):
        raise ValueError("FETCH_CONSERVATION_MISMATCH")
    if len(rows) + len(failures) != receipt.get("discoveredUrlCount"):
        raise ValueError("DISCOVERY_CONSERVATION_MISMATCH")
    if any(row.get("status") != "FETCHED" or row.get("canonicalAuthority") is not False for row in rows):
        raise ValueError("FETCHED_PAGE_ROW_INVALID")

    generated_at = receipt.get("generatedAt")
    if not isinstance(generated_at, str):
        raise ValueError("FETCH_SNAPSHOT_TIMESTAMP_REQUIRED")
    datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    source_revision = receipt["pagesManifestSha256"]
    chunks_out: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    scope_rejections: list[dict[str, str]] = []
    rows.sort(key=lambda row: row["canonicalUrl"])
    chunk_hasher = hashlib.sha256()
    chunk_count = 0
    unique_chunk_ids: set[str] = set()
    unique_evidence: set[str] = set()
    for row in rows:
        section = prefixes.get(row.get("sectionId"))
        if section is None:
            raise ValueError("FETCH_ROW_SECTION_UNKNOWN")
        product, allowed_prefix, language = section
        if row.get("language") not in (None, language):
            raise ValueError("FETCH_ROW_LANGUAGE_MISMATCH")
        url = row.get("canonicalUrl")
        parsed = urlparse(str(url))
        authority = urlparse(str(config["authority"]))
        if parsed.scheme != "https" or parsed.hostname != authority.hostname or not parsed.path.startswith(allowed_prefix):
            raise ValueError("FETCH_URL_OUTSIDE_DECLARED_SECTION")
        resolved_url = row.get("resolvedUrl") or url
        resolved = urlparse(str(resolved_url))
        if resolved.scheme != "https" or resolved.hostname != authority.hostname or not resolved.path.startswith(allowed_prefix):
            scope_rejections.append({
                "canonicalUrl": str(url),
                "resolvedUrl": str(resolved_url),
                "sectionId": str(row["sectionId"]),
                "reason": "REDIRECT_OUTSIDE_DECLARED_SECTION",
            })
            continue
        if row.get("product") != product or url in seen_urls:
            raise ValueError("FETCH_ROW_PRODUCT_OR_URL_CONFLICT")
        seen_urls.add(url)

        artifact_rel = Path(str(row.get("artifactPath", "")))
        if artifact_rel.is_absolute() or ".." in artifact_rel.parts:
            raise ValueError("FETCH_ARTIFACT_PATH_INVALID")
        artifact_path = (input_dir / artifact_rel).resolve(strict=True)
        if not artifact_path.is_relative_to(input_dir):
            raise ValueError("FETCH_ARTIFACT_ESCAPES_INPUT_ROOT")
        text = artifact_path.read_text(encoding="utf-8")
        if _sha(text.encode("utf-8")) != row.get("normalizedSha256"):
            raise ValueError("FETCH_PAGE_CHECKSUM_MISMATCH")

        source_id = f"{config['corpusId']}:{row['sectionId']}"
        source = P.SourceConfig(
            source_id=source_id,
            source_revision=source_revision,
            title=product,
            base_urls=(f"https://{authority.hostname}{allowed_prefix}",),
            allowed_domains=(authority.hostname,),
            authority_class="OFFICIAL_PRIMARY",
            default_fetcher="DIRECT_MARKDOWN",
            output_namespace=".tmp/atlas/langchain-doc-corpus-v1",
            include_paths=(allowed_prefix,),
            exclude_paths=(),
            maximum_pages=10_000,
            maximum_depth=0,
            follow_sitemap=False,
            pages=(),
            ldr_export_files=(),
            provider="langchain",
            product=product,
            version_qualification="CURRENT_UPSTREAM",
            language=language,
            publisher="LangChain",
            chunk_identity_version="V2",
        )
        page = P.PageArtifact(
            source_id=source_id,
            source_revision=source_revision,
            requested_url=url,
            resolved_url=resolved_url,
            title=_title(product, url, text),
            text=text,
            fetcher="DIRECT_MARKDOWN_SNAPSHOT",
            raw_checksum=str(row["rawSha256"]),
            normalized_checksum=str(row["normalizedSha256"]),
            outgoing_urls=(),
            metadata={"fetchMethod": row.get("fetchMethod"), "contentType": row.get("contentType")},
            retrieved_at=generated_at,
        )
        chunks = P.compile_chunks(
            [page], stanza_pipeline=None, stanza_model_revision="none",
            maximum_chars=2_800, overlap_chars=240,
            coordinate_for=lambda current, bound=source: P.build_page_coordinate(bound, current),
            chunk_identity_version="V2",
        )
        normalized_bytes = _normalize_ws(text).encode("utf-8")
        for chunk in chunks:
            if normalized_bytes[chunk.start_byte:chunk.end_byte] != chunk.text.encode("utf-8"):
                raise ValueError("CHUNK_BYTE_SPAN_CONTENT_MISMATCH")
            chunk_row = chunk.to_dict()
            chunk_row.update({
                "schema": "atlas.external-doc-chunk.v1",
                "corpusId": config["corpusId"],
                "sectionId": row["sectionId"],
                "product": product,
                "language": language,
                "canonicalUrl": url,
                "sourceManifestSha256": source_revision,
                "fetchMethod": row.get("fetchMethod"),
            })
            chunk_id = chunk_row["chunk_id"]
            evidence_revision = chunk_row["chunk_evidence_revision"]
            if chunk_id in unique_chunk_ids or evidence_revision in unique_evidence:
                raise ValueError("CHUNK_IDENTITY_COLLISION")
            unique_chunk_ids.add(chunk_id)
            unique_evidence.add(evidence_revision)
            encoded = _stable(chunk_row) + b"\n"
            chunk_hasher.update(encoded)
            chunk_count += 1
            if chunk_sink is None:
                chunks_out.append(chunk_row)
            else:
                chunk_sink(encoded)

    if chunk_sink is None:
        chunks_out.sort(key=lambda row: (row["canonicalUrl"], row["ordinal"], row["chunk_id"]))
        chunk_bytes = b"".join(_stable(row) + b"\n" for row in chunks_out)
        chunk_hasher = hashlib.sha256(chunk_bytes)
        chunk_count = len(chunks_out)
    summary = {
        "schema": "atlas.langchain-doc-chunk-receipt.v1",
        "status": "PARTIAL_ARTIFACT_COHORT" if failures or scope_rejections else "ARTIFACT_COHORT_COMPLETE",
        "corpusId": config["corpusId"],
        "fetchReceiptSha256": _sha(receipt_path.read_bytes()),
        "sourceManifestSha256": source_revision,
        "discoveredPageCount": len(rows) + len(failures),
        "fetchedPageCount": len(rows),
        "failedPageCount": len(failures),
        "failureRows": failures,
        "scopeAdmittedPageCount": len(rows) - len(scope_rejections),
        "scopeRejectedPageCount": len(scope_rejections),
        "scopeRejectionRows": scope_rejections,
        "discoveryOutcomeConserved": len(rows) - len(scope_rejections) + len(failures) + len(scope_rejections) == receipt["discoveredUrlCount"],
        "chunkCount": chunk_count,
        "uniqueChunkIdCount": len(unique_chunk_ids),
        "uniqueChunkEvidenceRevisionCount": len(unique_evidence),
        "chunkManifestSha256": "sha256:" + chunk_hasher.hexdigest(),
        "chunkIdentityVersion": "V2",
        "productVersionPolicy": "CURRENT_UPSTREAM@fetch-date; content-bound per page",
        "languages": sorted({language for _, _, language in prefixes.values()}),
        "canonicalAuthority": False,
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0},
    }
    if not summary["discoveryOutcomeConserved"]:
        raise ValueError("DISCOVERY_OUTCOME_CONSERVATION_MISMATCH")
    return chunks_out, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", type=Path, required=True, help="Exact verified fetch-run directory")
    parser.add_argument("--corpus-config", type=Path, default=ROOT / "docs/.okf/topics/langchain/corpus.json")
    parser.add_argument("--output-dir", type=Path, help="New output directory; defaults to <dir>/chunks-v1")
    args = parser.parse_args()
    output_dir = (args.output_dir or args.dir / "chunks-v1").resolve()
    output_dir.parent.mkdir(parents=True, exist_ok=True)
    if output_dir.exists():
        raise SystemExit("OUTPUT_DIRECTORY_ALREADY_EXISTS")
    with tempfile.TemporaryDirectory(prefix=".chunks-v1-", dir=output_dir.parent) as staging:
        staging_dir = Path(staging)
        chunk_path = staging_dir / "chunks.jsonl"
        with chunk_path.open("xb") as stream:
            _, receipt = build_chunks(args.dir, args.corpus_config, chunk_sink=stream.write)
            stream.flush()
        receipt_path = staging_dir / "receipt.json"
        with receipt_path.open("xb") as stream:
            stream.write(json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8") + b"\n")
        staging_dir.rename(output_dir)
    print(json.dumps({**receipt, "outputDir": str(output_dir.relative_to(ROOT)).replace("\\", "/")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
