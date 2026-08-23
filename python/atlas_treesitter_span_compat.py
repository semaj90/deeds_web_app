"""Compatibility validation for treesitter-chunker byte spans.

Current treesitter-chunker releases define ``byte_start``/``byte_end`` as UTF-8
byte offsets into the original source bytes. Parent Atlas therefore accepts an
explicit upstream span unchanged when it satisfies that contract.

A narrowly scoped compatibility path exists for older/runtime-specific behavior
where offsets were calculated after CRLF -> LF normalization. That path is only
entered after the original-byte span fails validation and is accepted only when
both the normalized source slice and the remapped original-byte slice agree with
the upstream chunk content.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

SpanCoordinateMode = Literal[
    "ORIGINAL_UTF8",
    "LF_COMPAT_REMAPPED",
    "CONTENT_UNAVAILABLE",
    "INVALID",
]


@dataclass(frozen=True)
class SpanResolution:
    start_byte: int
    end_byte: int
    mode: SpanCoordinateMode
    verified: bool


def _raw_field(item: Any, name: str) -> Any:
    if isinstance(item, dict):
        return item.get(name)
    return getattr(item, name, None)


def raw_chunk_content(item: Any) -> str | None:
    value = _raw_field(item, "content")
    if value is None:
        value = _raw_field(item, "text")
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="strict")
    return str(value)


def _valid_range(length: int, start: int, end: int) -> bool:
    return 0 <= start <= end <= length


def _lf_boundary_to_original(original: bytes, normalized_offset: int) -> int | None:
    """Map an offset in CRLF->LF normalized bytes back to original bytes."""

    if normalized_offset < 0:
        return None

    original_pos = 0
    normalized_pos = 0
    while original_pos < len(original):
        if normalized_pos == normalized_offset:
            return original_pos
        if original[original_pos : original_pos + 2] == b"\r\n":
            original_pos += 2
            normalized_pos += 1
        else:
            original_pos += 1
            normalized_pos += 1

    if normalized_pos == normalized_offset:
        return original_pos
    return None


def resolve_chunk_byte_span(
    source: str,
    raw_chunk: Any,
    start_byte: int,
    end_byte: int,
) -> SpanResolution:
    """Validate an upstream span, with a fail-closed LF compatibility fallback.

    ``ORIGINAL_UTF8`` is the canonical path. ``LF_COMPAT_REMAPPED`` is accepted
    only when the explicit offsets fail against original bytes but exactly select
    the upstream content in a CRLF->LF normalized view, and the mapped original
    byte range normalizes back to that same content.

    If the raw chunk does not expose content, the span cannot be independently
    verified here; the original offsets are retained as ``CONTENT_UNAVAILABLE``
    so the existing corpus self-validity gate remains authoritative.
    """

    original = source.encode("utf-8")
    start = int(start_byte)
    end = int(end_byte)
    content = raw_chunk_content(raw_chunk)

    if not _valid_range(len(original), start, end):
        return SpanResolution(start, end, "INVALID", False)

    if content is None:
        return SpanResolution(start, end, "CONTENT_UNAVAILABLE", False)

    content_bytes = content.encode("utf-8")
    if original[start:end] == content_bytes:
        return SpanResolution(start, end, "ORIGINAL_UTF8", True)

    normalized = original.replace(b"\r\n", b"\n")
    if not _valid_range(len(normalized), start, end):
        return SpanResolution(start, end, "INVALID", False)
    if normalized[start:end] != content_bytes:
        return SpanResolution(start, end, "INVALID", False)

    remapped_start = _lf_boundary_to_original(original, start)
    remapped_end = _lf_boundary_to_original(original, end)
    if remapped_start is None or remapped_end is None:
        return SpanResolution(start, end, "INVALID", False)
    if not _valid_range(len(original), remapped_start, remapped_end):
        return SpanResolution(start, end, "INVALID", False)

    remapped_slice = original[remapped_start:remapped_end]
    if remapped_slice.replace(b"\r\n", b"\n") != content_bytes:
        return SpanResolution(start, end, "INVALID", False)

    return SpanResolution(
        remapped_start,
        remapped_end,
        "LF_COMPAT_REMAPPED",
        True,
    )
