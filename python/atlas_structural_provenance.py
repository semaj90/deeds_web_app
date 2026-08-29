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


# ---------------------------------------------------------------------------
# Per-occurrence position resolution (CSGR-3, 2026-08-29)
#
# treesitter-chunker's `chunk.calls`/`imports`/`exports`/dependencies are flat name-string
# lists with no per-occurrence position — every AstEvidenceEdge built from them currently
# inherits the whole chunk's own start_line/start_column (see miniforge_nlp_sidecar_v2.py's
# add_edge()). For a chunk containing multiple calls/references, this stamps the SAME position
# onto every one of them — found live via openspec/changes/parent-atlas-compiler-semantic-graph-resolution
# tasks.md's "94.8% of unresolved_target edges share a position with a sibling" finding.
#
# find_occurrence_positions() is a pure, side-effect-free supplement: given one chunk's own
# source slice (already available as chunk.start_byte:chunk.end_byte in the caller) and the
# list of name strings already extracted by treesitter-chunker, it independently re-parses that
# slice with tree_sitter_language_pack and returns every real occurrence position for each name,
# ordered by position in the source. It does NOT change edge cardinality or call
# treesitter-chunker again — it is intentionally decoupled so a caller can choose how to use the
# result (e.g. attach a first-match position, or expand into N edges) without this function
# taking that policy decision itself. Not yet wired into the live /ast/chunk endpoint — the
# design questions in tasks.md (ambiguous-match policy, re-parse cost, downstream consumer
# impact) are not resolved, so this stays a standalone, independently-testable building block.
# ---------------------------------------------------------------------------


def _dotted_call_text(function_node: Any, source_bytes: bytes) -> str | None:
    """Reconstructs a call's callee text (`path.join`, `console.log`, bare `exit`) from a
    tree-sitter `function` field node — the same shape treesitter-chunker's own `calls` strings
    use, so a direct string comparison is possible without re-implementing name resolution."""
    start = getattr(function_node, "start_byte", None)
    end = getattr(function_node, "end_byte", None)
    if start is None or end is None:
        return None
    try:
        return source_bytes[start:end].decode("utf-8")
    except Exception:
        return None


def find_occurrence_positions(
    source_text: str,
    language: str,
    names: list[str],
) -> dict[str, list[tuple[int, int]]]:
    """Returns {name: [(row_0indexed, column_0indexed), ...]} for every real occurrence of each
    `names` entry found by re-parsing `source_text` (expected to be one chunk's own source
    slice, not a whole file). Matches both call-expression callees (`path.join(...)` -> "path.join")
    and bare identifier/reference occurrences. A name absent from the parse tree maps to an empty
    list — callers decide the fallback (e.g. keep the existing chunk-level position). Never
    raises: any parse or traversal failure yields an all-empty result, consistent with this
    module's side-effect-free, best-effort contract.
    """
    result: dict[str, list[tuple[int, int]]] = {name: [] for name in names}
    if not names or not source_text.strip():
        return result

    try:
        from tree_sitter_language_pack import get_parser  # type: ignore

        parser = get_parser(language)
        source_bytes = source_text.encode("utf-8")
        tree = parser.parse(source_bytes)
        root = tree.root_node
    except Exception:
        return result

    name_set = set(names)
    stack = [root]
    while stack:
        node = stack.pop()
        node_type = str(getattr(node, "type", ""))

        # Call expressions: match the callee's reconstructed text against dotted/bare names
        # (`path.join`, `console.log`, bare `exit`) — mirrors treesitter-chunker's own `calls`
        # string shape.
        if node_type in ("call_expression", "call"):
            function_node = None
            for child_name in ("function", "callee"):
                function_node = node.child_by_field_name(child_name) if hasattr(node, "child_by_field_name") else None
                if function_node is not None:
                    break
            if function_node is not None:
                callee_text = _dotted_call_text(function_node, source_bytes)
                if callee_text and callee_text in name_set:
                    row, column = getattr(node, "start_point", (0, 0))
                    result[callee_text].append((int(row), int(column)))

        # Bare identifier / property occurrences: match REFERENCES/imports/exports name lists,
        # which are typically single identifiers rather than dotted call expressions.
        elif node_type in ("identifier", "property_identifier", "shorthand_property_identifier"):
            start = getattr(node, "start_byte", None)
            end = getattr(node, "end_byte", None)
            if start is not None and end is not None:
                try:
                    text = source_bytes[start:end].decode("utf-8")
                except Exception:
                    text = None
                if text and text in name_set:
                    row, column = getattr(node, "start_point", (0, 0))
                    result[text].append((int(row), int(column)))

        stack.extend(reversed(list(getattr(node, "children", []))))

    for name in result:
        result[name].sort()
    return result


def occurrence_to_absolute_position(
    chunk_start_line: int,
    chunk_start_column: int,
    occurrence_row: int,
    occurrence_column: int,
) -> tuple[int, int]:
    """Converts one `find_occurrence_positions()` result (row/column relative to the re-parsed
    CHUNK slice, both 0-indexed) into a file-absolute position.

    The chunk's own first line is `chunk_start_line`, but that line's text only starts at
    `chunk_start_column` within the full file line (the chunk is a byte slice starting mid-line
    whenever `chunk_start_column > 0`) — so an occurrence on the chunk's own row 0 needs
    `chunk_start_column` added to its column. Every subsequent row within the chunk is a full
    line on its own, already absolute in the file's line-numbering once `chunk_start_line` is
    added to the row — no column adjustment applies there, since that line didn't have any
    chunk-prefix material stripped from its start.
    """
    if occurrence_row == 0:
        return (chunk_start_line, chunk_start_column + occurrence_column)
    return (chunk_start_line + occurrence_row, occurrence_column)
