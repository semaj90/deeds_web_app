"""Parent Atlas structural provenance normalization helpers.

This module is intentionally side-effect free so the 8095 FastAPI service can
reuse it without changing service ownership. It normalizes Consiliency
Tree-sitter chunk provenance and grounded LangExtract intervals.

Neither helper creates Atlas canonical identity.
"""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any


def _field(item: Any, *names: str) -> Any:
    if isinstance(item, dict):
        for name in names:
            if name in item and item[name] is not None:
                return item[name]
    for name in names:
        value = getattr(item, name, None)
        if value is not None:
            return value
    return None


def _string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, (list, tuple, set)):
        return [str(item) for item in value if str(item)]
    return [str(value)]


def _int_list(value: Any) -> list[int] | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        try:
            return [int(item) for item in value]
        except (TypeError, ValueError):
            return None
    return None


def normalize_treesitter_chunker_chunk(item: Any) -> dict[str, Any]:
    """Extract native structural provenance without synthesizing Atlas IDs.

    Exact AST coordinates are copied only when the upstream chunker exposes
    them. Missing values remain ``None`` so downstream code can fail closed
    rather than fabricating a path from spans or symbol names.
    """

    metadata = _field(item, "metadata") or {}
    if is_dataclass(metadata):
        metadata = asdict(metadata)
    if not isinstance(metadata, dict):
        metadata = {}

    def meta_or_field(*names: str) -> Any:
        value = _field(item, *names)
        if value is not None:
            return value
        for name in names:
            if metadata.get(name) is not None:
                return metadata.get(name)
        return None

    parent_route = meta_or_field("parent_route", "parentRoute")
    parent_context = meta_or_field("parent_context", "parentContext")
    symbol = meta_or_field("symbol", "name", "qualified_name")

    return {
        "upstream_node_id": meta_or_field("node_id", "nodeId"),
        "upstream_file_id": meta_or_field("file_id", "fileId"),
        "upstream_symbol_id": meta_or_field("symbol_id", "symbolId"),
        "upstream_chunk_id": meta_or_field("chunk_id", "chunkId"),
        "node_type": str(meta_or_field("node_type", "kind", "type", "nodeType") or "fragment"),
        "name": str(symbol) if symbol else None,
        "signature": meta_or_field("signature", "normalized_signature", "normalizedSignature"),
        "named": meta_or_field("named", "is_named", "isNamed"),
        "grammar_revision": meta_or_field("grammar_revision", "grammarRevision", "language_revision", "languageRevision"),
        "ast_path": _int_list(meta_or_field("ast_path", "astPath", "child_index_path", "childIndexPath")),
        "named_ast_path": _int_list(meta_or_field("named_ast_path", "namedAstPath", "named_child_index_path", "namedChildIndexPath")),
        "parent_ast_path": _int_list(meta_or_field("parent_ast_path", "parentAstPath")),
        "parent_named_ast_path": _int_list(meta_or_field("parent_named_ast_path", "parentNamedAstPath")),
        "parent_node_type": meta_or_field("parent_node_type", "parentNodeType"),
        "child_index": meta_or_field("child_index", "childIndex"),
        "named_child_index": meta_or_field("named_child_index", "namedChildIndex"),
        "depth": meta_or_field("depth", "ast_depth", "astDepth"),
        "parent_route": _string_list(parent_route),
        "parent_context": str(parent_context) if parent_context is not None else None,
        "byte_start": meta_or_field("byte_start", "start_byte", "byteStart", "startByte"),
        "byte_end": meta_or_field("byte_end", "end_byte", "byteEnd", "endByte"),
        "start_line": meta_or_field("start_line", "line_start", "startLine"),
        "end_line": meta_or_field("end_line", "line_end", "endLine"),
        "calls": _string_list(metadata.get("calls")),
        "imports": _string_list(metadata.get("imports")),
        "exports": _string_list(metadata.get("exports")),
        "dependencies": _string_list(metadata.get("dependencies")),
    }


def _alignment_value(value: Any) -> str | None:
    if value is None:
        return None
    enum_value = getattr(value, "value", None)
    if enum_value is not None:
        return str(enum_value)
    text = str(value)
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text.lower()


def normalize_langextract_extraction(item: Any) -> dict[str, Any]:
    interval = getattr(item, "char_interval", None)
    if interval is None and isinstance(item, dict):
        interval = item.get("char_interval")
    start_pos = None
    end_pos = None
    if interval is not None:
        if isinstance(interval, dict):
            start_pos = interval.get("start_pos")
            end_pos = interval.get("end_pos")
        else:
            start_pos = getattr(interval, "start_pos", None)
            end_pos = getattr(interval, "end_pos", None)
    extraction_class = _field(item, "extraction_class", "label") or "UNKNOWN"
    extraction_text = _field(item, "extraction_text", "text") or ""
    attributes = _field(item, "attributes") or {}
    alignment_status = _field(item, "alignment_status")
    return {
        "extraction_class": str(extraction_class),
        "extraction_text": str(extraction_text),
        "char_interval": ({"start_pos": int(start_pos), "end_pos": int(end_pos)} if start_pos is not None and end_pos is not None else None),
        "alignment_status": _alignment_value(alignment_status),
        "attributes": attributes if isinstance(attributes, dict) else {},
        "grounded": start_pos is not None and end_pos is not None,
    }


def is_exact_langextract_alignment(value: str | None) -> bool:
    return value == "match_exact"


def describe_contract() -> str:
    return (
        "Consiliency IDs and AST coordinates are upstream provenance only. "
        "LangExtract char intervals ground semantic observations to source text. "
        "Atlas canonical identity is assigned only after GIS promotion."
    )
