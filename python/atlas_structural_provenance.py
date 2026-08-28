"""Parent Atlas structural provenance normalization helpers.

This module is intentionally side-effect free so the 8095 FastAPI service can
reuse it without changing service ownership. It normalizes:

* Consiliency treesitter-chunker CodeChunk metadata into the exact upstream
  provenance fields Parent Atlas expects.
* LangExtract Extraction grounding into char-interval + alignment metadata.

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


def normalize_treesitter_chunker_chunk(item: Any) -> dict[str, Any]:
    """Extract native Consiliency provenance without synthesizing Atlas IDs.

    Missing upstream fields remain ``None``. The caller may create explicit
    compatibility provenance, but must not relabel compatibility values as
    native Consiliency IDs or Atlas canonical IDs.
    """

    metadata = _field(item, "metadata") or {}
    if is_dataclass(metadata):
        metadata = asdict(metadata)
    if not isinstance(metadata, dict):
        metadata = {}

    parent_route = _field(item, "parent_route", "parentRoute")
    if parent_route is None:
        parent_route = metadata.get("parent_route", metadata.get("parentRoute", []))

    parent_context = _field(item, "parent_context", "parentContext")
    if parent_context is None:
        parent_context = metadata.get("parent_context", metadata.get("parentContext"))

    symbol = _field(item, "symbol", "name")
    if symbol is None:
        symbol = metadata.get("symbol", metadata.get("qualified_name"))

    return {
        "upstream_node_id": _field(item, "node_id", "nodeId") or metadata.get("node_id"),
        "upstream_file_id": _field(item, "file_id", "fileId") or metadata.get("file_id"),
        "upstream_symbol_id": _field(item, "symbol_id", "symbolId") or metadata.get("symbol_id"),
        "upstream_chunk_id": _field(item, "chunk_id", "chunkId") or metadata.get("chunk_id"),
        "node_type": str(_field(item, "node_type", "kind", "type", "nodeType") or "fragment"),
        "name": str(symbol) if symbol else None,
        "parent_route": _string_list(parent_route),
        "parent_context": str(parent_context) if parent_context is not None else None,
        "byte_start": _field(item, "byte_start", "start_byte", "byteStart", "startByte"),
        "byte_end": _field(item, "byte_end", "end_byte", "byteEnd", "endByte"),
        "start_line": _field(item, "start_line", "line_start", "startLine"),
        "end_line": _field(item, "end_line", "line_end", "endLine"),
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
    """Normalize a LangExtract Extraction with exact/fuzzy grounding metadata."""

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

    # The bundled compatibility extractor predates LangExtract's native
    # CharInterval object and exposes the same coordinates as start_char /
    # end_char. Preserve those exact offsets at the adapter boundary rather
    # than treating an otherwise byte-grounded extraction as ungrounded.
    if start_pos is None and end_pos is None:
        start_pos = _field(item, "start_char")
        end_pos = _field(item, "end_char")

    extraction_class = _field(item, "extraction_class", "label") or "UNKNOWN"
    extraction_text = _field(item, "extraction_text", "text") or ""
    attributes = _field(item, "attributes") or {}
    alignment_status = _field(item, "alignment_status")

    return {
        "extraction_class": str(extraction_class),
        "extraction_text": str(extraction_text),
        "char_interval": (
            {"start_pos": int(start_pos), "end_pos": int(end_pos)}
            if start_pos is not None and end_pos is not None
            else None
        ),
        "alignment_status": _alignment_value(alignment_status),
        "attributes": attributes if isinstance(attributes, dict) else {},
        "grounded": start_pos is not None and end_pos is not None,
    }


def is_exact_langextract_alignment(value: str | None) -> bool:
    return value == "match_exact"


def describe_contract() -> str:
    return (
        "Consiliency IDs are upstream provenance only. LangExtract char intervals "
        "ground semantic observations to source text. Atlas canonical identity is "
        "assigned only after GIS promotion."
    )
