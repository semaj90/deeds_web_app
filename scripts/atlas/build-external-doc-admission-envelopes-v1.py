#!/usr/bin/env python3
"""DOC-06A handoff dry run: manifest -> FetchResult -> native page DocCoordinateV1 -> chunks -> admission envelopes.

Thin caller of the EXISTING owners (atlas_doc_manifest / atlas_external_docs / atlas_okf_docs_pipeline /
atlas_doc_coordinate). It is not a fetcher and never writes Postgres/Qdrant/Valkey/Neo4j.

  --acquire   bounded network fetch of the manifest's pages via the pipeline's own _fetch_single +
              compile_chunks + write_source_artifacts (acquisition/normalization only, no embedding).
  (default)   offline: rebuild chunks from the saved raw pages with the pipeline's own NATIVE page coordinate and emit
              the ExternalDocAdmissionInputV1-shaped envelopes plus a bounded receipt.

Identity (EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_01): one page-level DocCoordinateV1 per page (built by
atlas_okf_docs_pipeline.build_page_coordinate from manifest fields), carried unchanged into every chunk; each chunk's own
evidence is ExternalDocChunkEvidenceV1.chunk_evidence_revision. chunk_id is unchanged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

import atlas_okf_docs_pipeline as P  # noqa: E402
from atlas_external_docs import _normalize_ws  # noqa: E402

MANIFEST = ROOT / "docs/.okf/dev/pinned-docs.manifest.json"
COORDS = ROOT / "docs/.okf/dev/pinned-docs.coordinates.json"
ENVELOPES = ROOT / "docs/.okf/pinned/admission-envelopes-v1.json"
RECEIPT = ROOT / "docs/reports/external-doc-admission-envelopes-v1.json"
MAX_CHARS, OVERLAP = 1600, 200


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def stable(value) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def acquire(manifest) -> list[dict]:
    root = Path(manifest.output_root).resolve()
    failures: list[dict] = []
    for source in manifest.sources:
        pages = []
        for url in source.pages:
            try:
                pages.append(P._fetch_single(source, url))
            except Exception as exc:  # record and continue; never fabricate a page
                failures.append({"source_id": source.source_id, "url": url, "error": str(exc)[:200]})
            time.sleep(1)
        if pages:
            chunks = P.compile_chunks(pages, stanza_pipeline=None, stanza_model_revision="none", maximum_chars=MAX_CHARS,
                                      overlap_chars=OVERLAP, coordinate_for=lambda page, source=source: P.build_page_coordinate(source, page))
            P.write_source_artifacts(root, source, pages, chunks)
    return failures


def check_sidecar(manifest, coords: dict) -> None:
    """The manifest is the identity source of truth; the sidecar mirrors it for runtime bindings/overrides. Fail closed on drift."""
    for source in manifest.sources:
        cfg = coords["sources"][source.source_id]
        mirrored = {"provider": cfg["provider"], "product": cfg["product"], "version_qualification": cfg["versionQualification"], "product_version": cfg.get("productVersion")}
        actual = {"provider": source.provider, "product": source.product, "version_qualification": source.version_qualification, "product_version": source.product_version}
        if mirrored != actual:
            raise SystemExit(f"COORDINATE_SIDECAR_DRIFT:{source.source_id}: manifest={actual} sidecar={mirrored}")


def duplicates(values: list[str]) -> dict:
    counts: dict[str, int] = {}
    for value in values:
        counts[value] = counts.get(value, 0) + 1
    groups = {k: v for k, v in counts.items() if v > 1}
    return {"groups": len(groups), "rows": sum(groups.values())}


def build(manifest, coords: dict) -> tuple[list[dict], dict]:
    envelopes: list[dict] = []
    native_total = native_null = normalization_differs = 0
    for source in manifest.sources:
        raw_dir = ROOT / source.output_namespace / "raw"
        authority = coords["sources"][source.source_id]["authorityClass"]
        for receipt_path in sorted(raw_dir.glob("*.json")):
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            text = receipt_path.with_suffix(".md").read_text(encoding="utf-8").replace("\r\n", "\n")
            url = receipt["resolved_url"]
            override = coords["sources"][source.source_id].get("urlOverrides", {}).get(url, {})
            authority_class = override.get("authorityClass", authority)
            artifact = P.PageArtifact(
                source_id=source.source_id, source_revision=source.source_revision, requested_url=receipt["requested_url"], resolved_url=url,
                title=receipt["title"], text=text, fetcher=receipt["fetcher"], raw_checksum=receipt["raw_checksum"],
                normalized_checksum=receipt["normalized_checksum"], outgoing_urls=tuple(receipt.get("outgoing_urls") or ()),
                metadata=receipt.get("metadata") or {}, retrieved_at=receipt["fetched_at"],
            )
            coordinate = P.build_page_coordinate(source, artifact)
            chunks = P.compile_chunks([artifact], stanza_pipeline=None, stanza_model_revision="none", maximum_chars=MAX_CHARS,
                                      overlap_chars=OVERLAP, coordinate_for=lambda page, source=source: P.build_page_coordinate(source, page))
            native_total += len(chunks)
            native_null += sum(1 for c in chunks if c.doc_coordinate is None)
            normalization_differs += 1 if _normalize_ws(text) != text else 0
            qualification = "UNVERSIONED" if coordinate.product_version.startswith("UNVERSIONED@") else source.version_qualification or "CURRENT_UPSTREAM"
            envelopes.append({
                "manifestRevision": manifest.manifest_revision,
                "sourceRevision": source.source_revision,
                "sourceId": source.source_id,
                "authorityClass": authority_class,
                "versionQualification": qualification,
                "page": {
                    "provider": coordinate.provider, "product": coordinate.product, "productVersion": coordinate.product_version,
                    "architecture": coordinate.architecture, "language": coordinate.language, "url": coordinate.url, "title": receipt["title"],
                    "publisher": source.publisher, "sourceAuthority": "OFFICIAL" if authority_class == "OFFICIAL_PRIMARY" else "COMMUNITY",
                    "fetcher": receipt["fetcher"], "crawlRevision": source.source_revision,
                    "parserRevision": f"beautifulsoup4=={receipt.get('metadata', {}).get('parserVersion', 'unknown')}/html.parser",
                    "contentHash": coordinate.content_hash, "evidenceRevision": coordinate.evidence_revision, "retrievedAt": receipt["fetched_at"],
                },
                "chunks": [{
                    "chunkId": c.chunk_id, "ordinal": c.ordinal, "headingPath": list(c.heading_path), "sectionAnchor": "/".join(c.heading_path) or None,
                    "startChar": c.start_char, "endChar": c.end_char, "startByte": c.start_byte, "endByte": c.end_byte, "text": c.text,
                    "domainClass": c.domain_class, "ontologyClasses": list(c.ontology_classes), "codeBlocks": [dict(b) for b in c.code_blocks],
                    "apiSignatures": list(c.api_signatures), "chunkChecksum": sha(c.text),
                    "evidenceRevision": c.chunk_evidence_revision,
                } for c in chunks],
            })
    page_revisions = [e["page"]["evidenceRevision"] for e in envelopes]
    chunk_revisions = [c["evidenceRevision"] for e in envelopes for c in e["chunks"]]
    return envelopes, {
        "nativeChunks": native_total, "nativeChunksWithoutDocCoordinate": native_null,
        "pageNormalizationDiffersFromStoredText": normalization_differs,
        "uniquePageEvidenceRevisionCount": len(set(page_revisions)), "duplicatePageEvidenceRevision": duplicates(page_revisions),
        "uniqueChunkEvidenceRevisionCount": len(set(chunk_revisions)), "duplicateChunkEvidenceRevision": duplicates(chunk_revisions),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--acquire", action="store_true")
    args = parser.parse_args()
    manifest = P.load_manifest(MANIFEST)
    coords = json.loads(COORDS.read_text(encoding="utf-8"))
    check_sidecar(manifest, coords)
    failures = acquire(manifest) if args.acquire else []
    envelopes, native = build(manifest, coords)
    ENVELOPES.parent.mkdir(parents=True, exist_ok=True)
    ENVELOPES.write_text(json.dumps(envelopes, sort_keys=True, ensure_ascii=False), encoding="utf-8")
    RECEIPT.parent.mkdir(parents=True, exist_ok=True)
    receipt = {
        "schema": "atlas.external-doc-admission-envelopes.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestRevision": manifest.manifest_revision,
        "acquired": args.acquire,
        "acquisitionFailures": failures,
        "pages": len(envelopes),
        "chunks": sum(len(e["chunks"]) for e in envelopes),
        "envelopesDigest": "sha256:" + sha(stable(envelopes)),
        "envelopesFile": str(ENVELOPES.relative_to(ROOT)).replace("\\", "/"),
        "native": native,
        "coordinateSource": "manifest fields (provider/product/product_version/version_qualification/...) via atlas_okf_docs_pipeline.build_page_coordinate; sidecar mirrors and is checked for drift",
        "sampleEnvelopes": [{**e, "chunks": e["chunks"][:2]} for e in envelopes[:3]],
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0},
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("pages", "chunks", "native", "acquisitionFailures", "envelopesDigest")}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
