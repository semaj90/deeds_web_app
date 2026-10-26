#!/usr/bin/env python3
"""Stage verified LDR captures as external-doc chunks and optional vectors.

This helper reuses python/atlas_external_docs.py. Outputs are derived local
artifacts only; they are not ACE packets and are not admitted to PostgreSQL.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from hashlib import sha256
import json
import math
from pathlib import Path
import sys
from typing import Any
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_external_docs import chunk_document, embed_llama_server_768


def _sha(data: bytes) -> str:
    return sha256(data).hexdigest()


def _stable(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _repo_path(raw: str) -> Path:
    path = (ROOT / raw).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError("CAPTURE_PATH_OUTSIDE_REPOSITORY")
    return path


def load_verified_captures(manifest_paths: list[str], fetcher: str) -> list[dict[str, Any]]:
    selected: dict[str, dict[str, Any]] = {}
    for raw_manifest in manifest_paths:
        manifest_path = _repo_path(raw_manifest)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        if manifest.get("schema") != "atlas.okf.ldr.documentation-capture.v1":
            raise ValueError(f"INVALID_LDR_CAPTURE_MANIFEST:{manifest_path.name}")
        if manifest.get("canonicalAuthority") is not False or manifest.get("datastoreWrites") is not False:
            raise ValueError(f"CAPTURE_MANIFEST_AUTHORITY_INVALID:{manifest_path.name}")
        for source in manifest.get("sources", []):
            source_id = source.get("id")
            for capture in source.get("captures", []):
                if capture.get("fetcher", "").upper() != fetcher or not capture.get("checksum"):
                    continue
                markdown_path = _repo_path(capture["markdown"])
                metadata_path = _repo_path(capture["metadata"])
                markdown_bytes = markdown_path.read_bytes()
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                actual = _sha(markdown_bytes)
                if actual != capture["checksum"] or actual != metadata.get("capturedMarkdownSha256"):
                    raise ValueError(f"CAPTURE_CHECKSUM_MISMATCH:{source_id}:{fetcher}")
                if metadata.get("canonicalAuthority") is not False or metadata.get("sourceId") != source_id:
                    raise ValueError(f"CAPTURE_METADATA_INVALID:{source_id}:{fetcher}")
                if metadata.get("requestedUrl") != source.get("url"):
                    raise ValueError(f"CAPTURE_URL_MISMATCH:{source_id}:{fetcher}")
                item = {
                    "sourceId": source_id,
                    "url": source["url"],
                    "title": source["title"],
                    "markdown": markdown_bytes.decode("utf-8", errors="strict"),
                    "checksum": actual,
                    "metadata": metadata,
                }
                previous = selected.get(source_id)
                if previous is not None and previous["checksum"] != actual:
                    raise ValueError(f"AMBIGUOUS_CAPTURE_REVISION:{source_id}:{fetcher}")
                selected[source_id] = item
    if not selected:
        raise ValueError(f"NO_VERIFIED_CAPTURES:{fetcher}")
    return [selected[key] for key in sorted(selected)]


def build_chunk_rows(captures: list[dict[str, Any]], maximum_chars: int, overlap_chars: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for capture in captures:
        source_revision = f"sha256:{capture['checksum']}"
        chunks = chunk_document(
            source_id=f"ldr:{capture['sourceId']}",
            source_revision=source_revision,
            source_url=capture["url"],
            title=capture["title"],
            text=capture["markdown"],
            maximum_chars=maximum_chars,
            overlap_chars=overlap_chars,
        )
        for chunk in chunks:
            rows.append({
                "schema": "atlas.ldr.external-doc-chunk-proposal.v1",
                "chunk": chunk.to_dict(),
                "page": {
                    "sourceId": capture["sourceId"],
                    "url": capture["url"],
                    "title": capture["title"],
                    "captureFetcher": capture["metadata"]["fetcher"],
                    "capturedAt": capture["metadata"]["capturedAt"],
                    "contentSha256": capture["checksum"],
                    "sourceEvidenceRevision": source_revision,
                },
                "canonicalAuthority": False,
                "embedding": None,
            })
    return rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Verify and stage captured LDR docs for external-doc vector preparation")
    parser.add_argument("--manifest", action="append", required=True, help="Capture manifest; repeat to combine fetcher runs")
    parser.add_argument("--fetcher", choices=("FIRECRAWL_V2", "BEAUTIFULSOUP_HTTP"), default="FIRECRAWL_V2")
    parser.add_argument("--maximum-chars", type=int, default=1600)
    parser.add_argument("--overlap-chars", type=int, default=200)
    parser.add_argument("--embed", action="store_true", help="Call a configured local llama-server EmbeddingGemma endpoint")
    parser.add_argument("--embedding-url")
    parser.add_argument("--embedding-model")
    parser.add_argument("--write-artifacts", action="store_true", help="Write derived JSONL and receipt under docs/.okf/ldr/derived")
    args = parser.parse_args(argv)
    if args.embed and (not args.write_artifacts or not args.embedding_url or not args.embedding_model):
        parser.error("--embed requires --write-artifacts, --embedding-url, and --embedding-model")
    if not args.embed and (args.embedding_url or args.embedding_model):
        parser.error("embedding endpoint/model options require --embed")

    captures = load_verified_captures(args.manifest, args.fetcher)
    rows = build_chunk_rows(captures, args.maximum_chars, args.overlap_chars)
    embedding_summary = None
    if args.embed:
        vectors = embed_llama_server_768(
            [row["chunk"]["text"] for row in rows],
            base_url=args.embedding_url,
            model=args.embedding_model,
            max_chars_per_request=args.maximum_chars,
        )
        for row, vector in zip(rows, vectors, strict=True):
            values = [float(value) for value in vector]
            norm = math.sqrt(sum(value * value for value in values))
            if len(values) != 768 or not all(math.isfinite(value) for value in values) or norm == 0:
                raise ValueError("EMBEDDING_VECTOR_INVALID")
            row["embedding"] = {
                "representation": "semantic_768",
                "model": args.embedding_model,
                "dimension": 768,
                "cosineVector": values,
                "l2Norm": norm,
                "canonicalAuthority": False,
            }
        embedding_summary = {
            "status": "DERIVED_EMBEDDINGS_CREATED",
            "model": args.embedding_model,
            "endpoint": args.embedding_url,
            "dimension": 768,
            "count": len(vectors),
        }

    result: dict[str, Any] = {
        "schema": "atlas.ldr.vector-corpus-stage-receipt.v1",
        "runId": str(uuid4()),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "fetcher": args.fetcher,
        "sourceCount": len(captures),
        "chunkCount": len(rows),
        "sourceChecksums": {capture["sourceId"]: capture["checksum"] for capture in captures},
        "embedding": embedding_summary or {"status": "NOT_REQUESTED", "count": 0},
        "canonicalAuthority": False,
        "localArtifactsWritten": args.write_artifacts,
        "postgresWrites": False,
        "qdrantWrites": False,
        "acePacketsCreated": False,
    }
    run_dir = None
    if args.write_artifacts:
        run_dir = ROOT / "docs/.okf/ldr/derived" / result["runId"]
        run_dir.mkdir(parents=True, exist_ok=False)
        jsonl_path = run_dir / "chunks.jsonl"
        payload = "".join(_stable(row) + "\n" for row in rows)
        jsonl_path.write_text(payload, encoding="utf-8", newline="\n")
        result["chunksJsonl"] = jsonl_path.relative_to(ROOT).as_posix()
        result["chunksJsonlSha256"] = _sha(payload.encode("utf-8"))
        result["receiptPath"] = (run_dir / "receipt.json").relative_to(ROOT).as_posix()
    result["receiptChecksum"] = f"sha256:{_sha(_stable(result).encode('utf-8'))}"
    if run_dir is not None:
        (run_dir / "receipt.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
        )
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
