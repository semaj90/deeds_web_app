#!/usr/bin/env python3
"""Artifact-only documentation-diff evidence builder for Parent Atlas.

Reuses the existing documentation owners:
- python/atlas_doc_manifest.py
- python/atlas_external_docs.py
- python/atlas_okf_docs_pipeline.py

This script does NOT write Postgres, Qdrant, Valkey/BitFrost, Neo4j, RabbitMQ,
or canonical Parent Atlas state. Network acquisition is opt-in with --fetch.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Iterable
from uuid import NAMESPACE_URL, uuid5

from atlas_external_docs import (
    classify_domain,
    classify_ontology,
    enforce_allowed_domain,
    extract_code_blocks_and_signatures,
    fetch_beautifulsoup,
)
from atlas_okf_docs_pipeline import load_manifest, plan_manifest_recrawl_delta_v1

SCHEMA = "atlas.documentation-diff-learning-circuit.v1"
INDEX_SCHEMA = "atlas.documentation-diff-index-row.v1"
ACE_PREVIEW_SCHEMA = "atlas.ace-doc-diff-context-preview.v1"
ESTIMATOR_REVISION = "utf8-char-quarter-v1"
PRODUCER_REVISION = "documentation-diff-learning-circuit-v1"


def stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(value: str | bytes) -> str:
    raw = value if isinstance(value, bytes) else value.encode("utf-8")
    return sha256(raw).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def deterministic_evidence_id(source_id: str, source_revision: str, source_ref: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"atlas://documentation-diff/{source_id}/{source_revision}/{source_ref}"))


def approximate_tokens(text: str) -> int:
    # Deliberately a planning estimate, never tokenizer truth.
    return max(1, (len(text) + 3) // 4)


def changed_line_count(previous_text: str | None, current_text: str) -> int:
    if previous_text is None:
        return len(current_text.splitlines())
    before = previous_text.splitlines()
    after = current_text.splitlines()
    common = sum(1 for a, b in zip(before, after) if a == b)
    return (len(before) - common) + (len(after) - common)


def prompt_priority(diff_kind: str, *, api_signature_count: int, code_block_count: int) -> int:
    base = {
        "CONTENT_CHANGED": 80,
        "OBSERVED_NO_BASELINE": 60,
        "CONTENT_UNCHANGED": 10,
        "FETCH_FAILED": 0,
    }[diff_kind]
    return min(100, base + min(10, api_signature_count * 2) + min(10, code_block_count))


def load_previous_artifact(path: str | None) -> dict[str, dict[str, Any]]:
    if not path:
        return {}
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = payload.get("entries", [])
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("sourceRef"):
            out[str(row["sourceRef"])] = row
    return out


def selected_sources(previous_manifest_path: str, current_manifest_path: str):
    previous = load_manifest(previous_manifest_path)
    current = load_manifest(current_manifest_path)
    plan = plan_manifest_recrawl_delta_v1(previous, current)
    if not plan["canAcquire"]:
        raise SystemExit("DOC_RECRAWL_DELTA_BLOCKED:" + ",".join(plan["blockers"]))
    selected_ids = set(plan["selectedSourceIds"])
    return previous, current, plan, [source for source in current.sources if source.source_id in selected_ids]


def source_urls(source: Any) -> tuple[str, ...]:
    urls = tuple(source.pages) if source.pages else tuple(source.base_urls)
    return tuple(dict.fromkeys(urls[: source.maximum_pages]))


def build_entry(source: Any, url: str, previous_row: dict[str, Any] | None, *, fetch: bool) -> dict[str, Any]:
    enforce_allowed_domain(url, source.allowed_domains)
    if not fetch:
        return {
            "evidenceId": deterministic_evidence_id(source.source_id, source.source_revision, url),
            "sourceId": source.source_id,
            "sourceRevision": source.source_revision,
            "sourceRef": url,
            "normalizedChecksum": previous_row.get("normalizedChecksum") if previous_row else None,
            "diffKind": "OBSERVED_NO_BASELINE" if previous_row is None else "CONTENT_UNCHANGED",
            "domainClass": previous_row.get("domainClass", "documentation") if previous_row else "documentation",
            "ontologyClasses": previous_row.get("ontologyClasses", ["CONCEPT"]) if previous_row else ["CONCEPT"],
            "tokenFeatures": {
                "utf8Bytes": 0,
                "charCount": 0,
                "lineCount": 0,
                "approximateTokens": 0,
                "estimatorRevision": ESTIMATOR_REVISION,
            },
            "changedLineCount": 0,
            "apiSignatureCount": 0,
            "codeBlockCount": 0,
            "promptPriority": 0,
            "fetchState": "NOT_FETCHED",
            "evidenceRefs": [f"manifest:{source.source_id}:{source.source_revision}", url],
            "canonicalAuthority": False,
        }

    try:
        fetched = fetch_beautifulsoup(url)
    except Exception as exc:
        return {
            "evidenceId": deterministic_evidence_id(source.source_id, source.source_revision, url),
            "sourceId": source.source_id,
            "sourceRevision": source.source_revision,
            "sourceRef": url,
            "normalizedChecksum": None,
            "diffKind": "FETCH_FAILED",
            "domainClass": "documentation",
            "ontologyClasses": ["CONCEPT"],
            "tokenFeatures": {
                "utf8Bytes": 0,
                "charCount": 0,
                "lineCount": 0,
                "approximateTokens": 0,
                "estimatorRevision": ESTIMATOR_REVISION,
            },
            "changedLineCount": 0,
            "apiSignatureCount": 0,
            "codeBlockCount": 0,
            "promptPriority": 0,
            "fetchState": "FAILED",
            "error": f"{type(exc).__name__}:{exc}",
            "evidenceRefs": [f"manifest:{source.source_id}:{source.source_revision}", url],
            "canonicalAuthority": False,
        }

    text = fetched.markdown
    previous_checksum = previous_row.get("normalizedChecksum") if previous_row else None
    previous_text = previous_row.get("text") if previous_row else None
    diff_kind = (
        "OBSERVED_NO_BASELINE"
        if previous_row is None
        else ("CONTENT_UNCHANGED" if previous_checksum == fetched.normalized_checksum else "CONTENT_CHANGED")
    )
    code_blocks, signatures = extract_code_blocks_and_signatures(text)
    domain = classify_domain(fetched.title, text)
    ontology = list(classify_ontology(text))
    line_delta = changed_line_count(previous_text if isinstance(previous_text, str) else None, text)
    token_features = {
        "utf8Bytes": len(text.encode("utf-8")),
        "charCount": len(text),
        "lineCount": len(text.splitlines()),
        "approximateTokens": approximate_tokens(text),
        "estimatorRevision": ESTIMATOR_REVISION,
    }
    return {
        "evidenceId": deterministic_evidence_id(source.source_id, source.source_revision, fetched.resolved_url),
        "sourceId": source.source_id,
        "sourceRevision": source.source_revision,
        "sourceRef": fetched.resolved_url,
        "requestedUrl": url,
        "title": fetched.title,
        "normalizedChecksum": fetched.normalized_checksum,
        "rawChecksum": fetched.raw_checksum,
        "diffKind": diff_kind,
        "domainClass": domain,
        "ontologyClasses": ontology,
        "tokenFeatures": token_features,
        "changedLineCount": line_delta,
        "apiSignatureCount": len(signatures),
        "codeBlockCount": len(code_blocks),
        "promptPriority": prompt_priority(
            diff_kind,
            api_signature_count=len(signatures),
            code_block_count=len(code_blocks),
        ),
        "apiSignatures": list(signatures),
        "fetchMetadata": dict(fetched.metadata),
        "fetchState": "FETCHED",
        "text": text,
        "evidenceRefs": [
            f"manifest:{source.source_id}:{source.source_revision}",
            fetched.resolved_url,
            f"sha256:{fetched.normalized_checksum}",
        ],
        "canonicalAuthority": False,
    }


def build_index_row(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": INDEX_SCHEMA,
        "evidenceId": entry["evidenceId"],
        "sourceId": entry["sourceId"],
        "sourceRevision": entry["sourceRevision"],
        "sourceRef": entry["sourceRef"],
        "normalizedChecksum": entry["normalizedChecksum"],
        "diffKind": entry["diffKind"],
        "domainClass": entry["domainClass"],
        "ontologyClasses": entry["ontologyClasses"],
        "approximateTokens": entry["tokenFeatures"]["approximateTokens"],
        "promptPriority": entry["promptPriority"],
        "canonicalAuthority": False,
    }


def build_ace_preview(entries: Iterable[dict[str, Any]], artifact_checksum: str) -> dict[str, Any]:
    entries = list(entries)
    total_tokens = sum(int(row["tokenFeatures"]["approximateTokens"]) for row in entries)
    changed = [row for row in entries if row["diffKind"] in {"CONTENT_CHANGED", "OBSERVED_NO_BASELINE"}]
    return {
        "schema": ACE_PREVIEW_SCHEMA,
        "status": "BLOCKED_IDENTITY",
        "reason": "CONTEXT_MANIFEST_AND_CANDIDATE_COORDINATES_REQUIRED",
        "artifactChecksum": artifact_checksum,
        "featureMapping": {
            "changedDocumentCount": len(changed),
            "approximateTokens": total_tokens,
            "domainClasses": sorted({row["domainClass"] for row in entries}),
            "ontologyClasses": sorted({item for row in entries for item in row["ontologyClasses"]}),
            "maxPromptPriority": max((int(row["promptPriority"]) for row in entries), default=0),
        },
        "requiredForAdmission": [
            "ContextManifestV2",
            "candidateSnapshotRevision",
            "ordinalMapChecksum",
            "representationRevision",
            "featureRevision",
            "artifactChecksum",
        ],
        "bitfrost": {
            "cacheWrite": False,
            "modelKvTensorInsert": False,
            "previewOnly": True,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--previous-manifest", required=True)
    parser.add_argument("--current-manifest", required=True)
    parser.add_argument("--previous-artifact")
    parser.add_argument("--out-dir", default=".tmp/atlas/documentation-diff-learning-circuit-v1")
    parser.add_argument("--fetch", action="store_true", help="Perform bounded BeautifulSoup network acquisition.")
    args = parser.parse_args()

    previous_manifest, current_manifest, plan, sources = selected_sources(
        args.previous_manifest, args.current_manifest
    )
    previous_rows = load_previous_artifact(args.previous_artifact)

    entries: list[dict[str, Any]] = []
    for source in sources:
        for url in source_urls(source):
            prior = previous_rows.get(url)
            entries.append(build_entry(source, url, prior, fetch=args.fetch))

    entries.sort(key=lambda row: (row["sourceId"], row["sourceRef"], row["evidenceId"]))
    body = {
        "schema": SCHEMA,
        "generatedAt": now_iso(),
        "producerRevision": PRODUCER_REVISION,
        "previousManifestRevision": previous_manifest.manifest_revision,
        "currentManifestRevision": current_manifest.manifest_revision,
        "workspaceRevision": current_manifest.workspace_revision,
        "sourceSnapshotRevision": current_manifest.source_snapshot_revision,
        "fetchEnabled": bool(args.fetch),
        "recrawlPlan": plan,
        "entries": entries,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    artifact_checksum = "sha256:" + sha256_hex(stable_json(body))
    body["artifactChecksum"] = artifact_checksum

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = out_dir / "documentation-diff-learning-circuit-v1.json"
    index_path = out_dir / "documentation-diff-index-v1.jsonl"
    ace_path = out_dir / "ace-doc-diff-context-preview-v1.json"

    artifact_path.write_text(json.dumps(body, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index_rows = [build_index_row(row) for row in entries]
    index_path.write_text(
        "".join(json.dumps(row, sort_keys=True, ensure_ascii=False) + "\n" for row in index_rows),
        encoding="utf-8",
    )
    ace_preview = build_ace_preview(entries, artifact_checksum)
    ace_path.write_text(json.dumps(ace_preview, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": "DOCUMENTATION_DIFF_ARTIFACT_PRODUCED",
        "artifact": str(artifact_path),
        "index": str(index_path),
        "acePreview": str(ace_path),
        "entries": len(entries),
        "selectedSources": len(sources),
        "fetchEnabled": bool(args.fetch),
        "artifactChecksum": artifact_checksum,
        "writesPerformed": False,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
