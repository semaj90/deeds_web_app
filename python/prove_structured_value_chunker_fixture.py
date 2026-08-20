"""Emit normalized Consiliency treesitter-chunker evidence for the SV-4 fixture.

This is a proof helper, not a canonical materializer. Missing package/grammar support
is reported as BLOCKED rather than silently falling back to regex extraction.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from atlas_structural_provenance import normalize_treesitter_chunker_chunk


def _chunk_to_dict(chunk: Any) -> dict[str, Any]:
    normalized = normalize_treesitter_chunker_chunk(chunk)
    normalized["content"] = getattr(chunk, "content", None)
    normalized["chunk_id"] = getattr(chunk, "chunk_id", None)
    normalized["node_id"] = getattr(chunk, "node_id", None)
    normalized["file_id"] = getattr(chunk, "file_id", None)
    normalized["symbol_id"] = getattr(chunk, "symbol_id", None)
    return normalized


def prove_fixture(path: Path, language: str) -> dict[str, Any]:
    try:
        import chunker  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependent
        return {
            "schema": "atlas.treesitter-chunker-fixture-probe.v1",
            "status": "BLOCKED_TREE_SITTER_CHUNKER",
            "source_ref": path.as_posix(),
            "language": language,
            "package_revision": None,
            "chunks": [],
            "diagnostics": [f"TREE_SITTER_CHUNKER_IMPORT_FAILED:{type(exc).__name__}:{exc}"],
            "canonical_authority": False,
        }

    package_revision = getattr(chunker, "__version__", None)
    try:
        from chunker import chunk_file  # type: ignore
        chunks = list(chunk_file(path, language))
    except Exception as exc:  # pragma: no cover - environment dependent
        return {
            "schema": "atlas.treesitter-chunker-fixture-probe.v1",
            "status": "BLOCKED_TREE_SITTER_CHUNKER",
            "source_ref": path.as_posix(),
            "language": language,
            "package_revision": package_revision,
            "chunks": [],
            "diagnostics": [f"TREE_SITTER_CHUNKER_PARSE_FAILED:{type(exc).__name__}:{exc}"],
            "canonical_authority": False,
        }

    raw_bytes = path.read_bytes()
    normalized_chunks = []
    diagnostics: list[str] = []
    for chunk in chunks:
        item = _chunk_to_dict(chunk)
        start = item.get("byte_start")
        end = item.get("byte_end")
        if isinstance(start, int) and isinstance(end, int) and 0 <= start <= end <= len(raw_bytes):
            sliced = raw_bytes[start:end].decode("utf-8")
            item["byte_slice_matches_content"] = item.get("content") in (None, sliced)
            if item.get("content") is not None and item["content"] != sliced:
                diagnostics.append(f"CHUNK_BYTE_SLICE_MISMATCH:{item.get('upstream_chunk_id') or item.get('chunk_id')}")
        else:
            item["byte_slice_matches_content"] = False
            diagnostics.append(f"CHUNK_BYTE_RANGE_INVALID:{item.get('upstream_chunk_id') or item.get('chunk_id')}")
        normalized_chunks.append(item)

    return {
        "schema": "atlas.treesitter-chunker-fixture-probe.v1",
        "status": "READY",
        "source_ref": path.as_posix(),
        "language": language,
        "package_revision": package_revision,
        "chunk_count": len(normalized_chunks),
        "chunks": normalized_chunks,
        "diagnostics": diagnostics,
        "canonical_authority": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True)
    parser.add_argument("--language", default="typescript")
    parser.add_argument("--output")
    args = parser.parse_args()

    path = Path(args.file).resolve()
    result = prove_fixture(path, args.language)
    payload = json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        output = Path(args.output).resolve()
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(payload, encoding="utf-8")
    sys.stdout.write(payload)
    return 0 if result["status"] == "READY" else 3


if __name__ == "__main__":
    raise SystemExit(main())
