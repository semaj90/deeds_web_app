#!/usr/bin/env python3
"""DOC-06A handoff dry run: manifest -> FetchResult -> DocCoordinateV1 -> ChunkRecord -> admission envelopes.

Thin caller of the EXISTING owners (atlas_doc_manifest / atlas_external_docs / atlas_okf_docs_pipeline /
atlas_doc_coordinate). It is not a fetcher and never writes Postgres/Qdrant/Valkey/Neo4j.

  --acquire   bounded network fetch of the manifest's pages via the pipeline's own _fetch_single +
              compile_chunks + write_source_artifacts (acquisition/normalization only, no embedding).
  (default)   offline: rebuild version-qualified chunks from the saved raw pages and emit the
              ExternalDocAdmissionInputV1-shaped envelopes plus a bounded receipt.

The pipeline's manifest schema forbids provider/product/version fields, so DocCoordinateV1 inputs come
from the sidecar docs/.okf/dev/pinned-docs.coordinates.json; the receipt records that as a finding.
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
from atlas_doc_coordinate import build_doc_coordinate  # noqa: E402
from atlas_external_docs import chunk_document  # noqa: E402

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
            chunks = P.compile_chunks(pages, stanza_pipeline=None, stanza_model_revision="none",
                                      maximum_chars=MAX_CHARS, overlap_chars=OVERLAP)
            P.write_source_artifacts(root, source, pages, chunks)
    return failures


def authority_enum(authority_class: str) -> str:
    return "OFFICIAL" if authority_class == "OFFICIAL_PRIMARY" else "COMMUNITY"


def build(manifest, coords: dict) -> tuple[list[dict], dict]:
    envelopes: list[dict] = []
    native_null = native_total = 0
    parity_mismatch = 0
    for source in manifest.sources:
        cfg = coords["sources"][source.source_id]
        raw_dir = ROOT / source.output_namespace / "raw"
        for receipt_path in sorted(raw_dir.glob("*.json")):
            receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
            text = receipt_path.with_suffix(".md").read_text(encoding="utf-8").replace("\r\n", "\n")
            url = receipt["resolved_url"]
            # Native pipeline output, recomputed deterministically from the committed raw page (chunks.jsonl is a
            # gitignored, rebuildable intermediate and must not be required): the pipeline's own compile_chunks.
            artifact = P.PageArtifact(
                source_id=source.source_id, source_revision=source.source_revision, requested_url=receipt["requested_url"],
                resolved_url=url, title=receipt["title"], text=text, fetcher=receipt["fetcher"], raw_checksum=receipt["raw_checksum"],
                normalized_checksum=receipt["normalized_checksum"], outgoing_urls=tuple(receipt.get("outgoing_urls") or ()),
                metadata=receipt.get("metadata") or {},
            )
            native = {c.chunk_id: c for c in P.compile_chunks([artifact], stanza_pipeline=None, stanza_model_revision="none",
                                                              maximum_chars=MAX_CHARS, overlap_chars=OVERLAP)}
            native_total += len(native)
            native_null += sum(1 for c in native.values() if c.doc_coordinate is None)
            override = cfg.get("urlOverrides", {}).get(url, {})
            qualification = override.get("versionQualification", cfg["versionQualification"])
            authority_class = override.get("authorityClass", cfg["authorityClass"])
            fetched = receipt["fetched_at"]
            product_version = cfg.get("productVersion") or f"CURRENT_UPSTREAM@{fetched[:10]}"
            if qualification == "UNVERSIONED":
                product_version = f"UNVERSIONED@{fetched[:10]}"
            page_hash = sha(text)
            coordinate = build_doc_coordinate(provider=cfg["provider"], product=cfg["product"], product_version=product_version,
                                              url=url, content_hash=page_hash, language=cfg.get("language"))
            chunks = chunk_document(source_id=source.source_id, source_revision=source.source_revision, source_url=url,
                                    title=receipt["title"], text=text, maximum_chars=MAX_CHARS, overlap_chars=OVERLAP,
                                    doc_coordinate=coordinate)
            chunk_rows = []
            for c in chunks:
                if c.chunk_id not in native or native[c.chunk_id].text != c.text:
                    parity_mismatch += 1
                chunk_rows.append({
                    "chunkId": c.chunk_id, "ordinal": c.ordinal, "headingPath": list(c.heading_path),
                    "sectionAnchor": c.doc_coordinate.section_anchor, "startChar": c.start_char, "endChar": c.end_char,
                    "startByte": c.start_byte, "endByte": c.end_byte, "text": c.text, "domainClass": c.domain_class,
                    "ontologyClasses": list(c.ontology_classes), "codeBlocks": [dict(b) for b in c.code_blocks],
                    "apiSignatures": list(c.api_signatures), "chunkChecksum": sha(c.text),
                    # DocCoordinateV1's own chunk-level revision (section_anchor + document hash). Kept as-is so the
                    # validator can prove whether it is unique per chunk.
                    "evidenceRevision": c.doc_coordinate.evidence_revision,
                })
            envelopes.append({
                "manifestRevision": manifest.manifest_revision,
                "sourceRevision": source.source_revision,
                "sourceId": source.source_id,
                "authorityClass": authority_class,
                "versionQualification": qualification,
                "page": {
                    "provider": cfg["provider"], "product": cfg["product"], "productVersion": product_version,
                    "architecture": None, "language": cfg.get("language"), "url": url, "title": receipt["title"],
                    "publisher": cfg.get("publisher"), "sourceAuthority": authority_enum(authority_class),
                    "fetcher": receipt["fetcher"], "crawlRevision": source.source_revision,
                    "parserRevision": f"beautifulsoup4=={receipt.get('metadata', {}).get('parserVersion', 'unknown')}/html.parser",
                    "contentHash": page_hash, "evidenceRevision": coordinate.evidence_revision, "retrievedAt": fetched,
                },
                "chunks": chunk_rows,
            })
    return envelopes, {"nativeChunks": native_total, "nativeChunksWithoutDocCoordinate": native_null, "rechunkChecksumMismatches": parity_mismatch}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--acquire", action="store_true")
    args = parser.parse_args()
    manifest = P.load_manifest(MANIFEST)
    coords = json.loads(COORDS.read_text(encoding="utf-8"))
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
        "coordinateSource": "docs/.okf/dev/pinned-docs.coordinates.json (sidecar; SourceConfigV1 forbids these fields)",
        "sampleEnvelopes": [{**e, "chunks": e["chunks"][:2]} for e in envelopes[:3]],
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0},
    }
    RECEIPT.write_text(json.dumps(receipt, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: receipt[k] for k in ("pages", "chunks", "native", "acquisitionFailures", "envelopesDigest")}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
