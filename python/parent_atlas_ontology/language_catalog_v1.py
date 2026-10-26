"""Validate a read-only Tree-sitter language-pack manifest snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


CATALOG_SCHEMA = "atlas.okf-tree-sitter-language-catalog.v1"


def _canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def build_catalog(manifest_bytes: bytes, *, source_ref: str, python_version: str) -> dict[str, Any]:
    manifest = json.loads(manifest_bytes)
    if not isinstance(manifest, dict) or not isinstance(manifest.get("languages"), dict):
        raise ValueError("TREE_SITTER_MANIFEST_LANGUAGES_INVALID")
    version = manifest.get("version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError("TREE_SITTER_MANIFEST_VERSION_MISSING")
    grammar_ids = sorted(manifest["languages"], key=str.casefold)
    if not grammar_ids or any(not isinstance(item, str) or not item.strip() for item in grammar_ids):
        raise ValueError("TREE_SITTER_GRAMMAR_ID_INVALID")
    if len({item.casefold() for item in grammar_ids}) != len(grammar_ids):
        raise ValueError("TREE_SITTER_GRAMMAR_ID_COLLISION")
    catalog: dict[str, Any] = {
        "schema": CATALOG_SCHEMA,
        "catalogId": "tree-sitter-language-pack",
        "source": {
            "packageName": "tree-sitter-language-pack",
            "packageVersion": version,
            "sourceRef": source_ref,
            "manifestSha256": hashlib.sha256(manifest_bytes).hexdigest(),
            "observedPythonVersion": python_version,
        },
        "namespace": "PARSER_GRAMMAR_ID",
        "entries": [{"grammarId": item, "qualification": "CANDIDATE"} for item in grammar_ids],
        "lspServerBindings": [],
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    catalog["catalogSha256"] = hashlib.sha256(_canonical_bytes(catalog)).hexdigest()
    validate_catalog(catalog)
    return catalog


def validate_catalog(catalog: dict[str, Any]) -> None:
    if catalog.get("schema") != CATALOG_SCHEMA:
        raise ValueError("TREE_SITTER_CATALOG_SCHEMA_INVALID")
    if catalog.get("namespace") != "PARSER_GRAMMAR_ID":
        raise ValueError("TREE_SITTER_CATALOG_NAMESPACE_INVALID")
    source = catalog.get("source")
    if not isinstance(source, dict) or source.get("packageName") != "tree-sitter-language-pack":
        raise ValueError("TREE_SITTER_CATALOG_SOURCE_INVALID")
    digest = source.get("manifestSha256")
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("TREE_SITTER_MANIFEST_CHECKSUM_INVALID")
    entries = catalog.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError("TREE_SITTER_CATALOG_ENTRIES_INVALID")
    ids = []
    for entry in entries:
        if not isinstance(entry, dict) or set(entry) != {"grammarId", "qualification"}:
            raise ValueError("TREE_SITTER_CATALOG_ENTRY_INVALID")
        if not isinstance(entry["grammarId"], str) or not entry["grammarId"].strip():
            raise ValueError("TREE_SITTER_GRAMMAR_ID_INVALID")
        if entry["qualification"] != "CANDIDATE":
            raise ValueError("TREE_SITTER_CATALOG_PROMOTION_BLOCKED")
        ids.append(entry["grammarId"])
    if ids != sorted(ids, key=str.casefold) or len({item.casefold() for item in ids}) != len(ids):
        raise ValueError("TREE_SITTER_CATALOG_ORDER_OR_DUPLICATE_INVALID")
    if catalog.get("lspServerBindings") != []:
        raise ValueError("TREE_SITTER_LSP_BINDINGS_MUST_BE_EMPTY")
    if catalog.get("canonicalAuthority") is not False or catalog.get("writesPerformed") is not False:
        raise ValueError("TREE_SITTER_CATALOG_AUTHORITY_INVALID")
    expected = hashlib.sha256(_canonical_bytes({k: v for k, v in catalog.items() if k != "catalogSha256"})).hexdigest()
    if catalog.get("catalogSha256") != expected:
        raise ValueError("TREE_SITTER_CATALOG_CHECKSUM_MISMATCH")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--source-ref", required=True)
    parser.add_argument("--python-version", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    catalog = build_catalog(args.manifest.read_bytes(), source_ref=args.source_ref, python_version=args.python_version)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"entries": len(catalog["entries"]), "catalogSha256": catalog["catalogSha256"], "output": str(args.output)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
