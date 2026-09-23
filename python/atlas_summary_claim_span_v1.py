"""VAL-05: exact-revision UTF-8 span verification for summary claims.

This module verifies an already-read canonical chunk row. The caller must query
by both chunk_id and evidence_revision and pass the returned identity fields;
there is deliberately no "latest" selector or datastore client here.
"""
from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from typing import Any

_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_CHUNK_REVISION = re.compile(r"^sha256:[a-f0-9]{64}$")


def verify_summary_claim_byte_span_v1(
    *,
    expected_chunk_id: str,
    expected_chunk_evidence_revision: str,
    canonical_chunk_row: Mapping[str, Any],
    start_byte: int,
    end_byte: int,
    text_checksum: str,
) -> dict[str, Any]:
    """Return VERIFIED only when the exact row identity and UTF-8 byte slice match."""
    base = {"startByte": start_byte, "endByte": end_byte, "textChecksum": text_checksum}
    if not expected_chunk_id or not isinstance(expected_chunk_id, str):
        return {"status": "REJECTED", "reason": "EXPECTED_CHUNK_ID_INVALID", "span": base}
    if not isinstance(expected_chunk_evidence_revision, str) or not _CHUNK_REVISION.fullmatch(expected_chunk_evidence_revision):
        return {"status": "REJECTED", "reason": "EXPECTED_REVISION_INVALID", "span": base}
    if canonical_chunk_row.get("chunk_id") != expected_chunk_id:
        return {"status": "REJECTED", "reason": "CHUNK_ID_MISMATCH", "span": base}
    if canonical_chunk_row.get("evidence_revision") != expected_chunk_evidence_revision:
        return {"status": "REJECTED", "reason": "REVISION_MISMATCH", "span": base}
    if not isinstance(start_byte, int) or isinstance(start_byte, bool) or start_byte < 0:
        return {"status": "REJECTED", "reason": "START_BYTE_INVALID", "span": base}
    if not isinstance(end_byte, int) or isinstance(end_byte, bool) or end_byte <= start_byte:
        return {"status": "REJECTED", "reason": "BYTE_RANGE_INVALID", "span": base}
    if not isinstance(text_checksum, str) or not _SHA256.fullmatch(text_checksum):
        return {"status": "REJECTED", "reason": "TEXT_CHECKSUM_INVALID", "span": base}
    text = canonical_chunk_row.get("text")
    if not isinstance(text, str):
        return {"status": "REJECTED", "reason": "CANONICAL_TEXT_MISSING", "span": base}
    try:
        chunk_bytes = text.encode("utf-8", errors="strict")
    except UnicodeEncodeError:
        return {"status": "REJECTED", "reason": "CANONICAL_TEXT_INVALID_UTF8", "span": base}
    if end_byte > len(chunk_bytes):
        return {"status": "REJECTED", "reason": "OUT_OF_BOUNDS", "span": base}
    selected = chunk_bytes[start_byte:end_byte]
    try:
        selected.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return {"status": "REJECTED", "reason": "SPAN_NOT_UTF8_BOUNDARY", "span": base}
    actual = hashlib.sha256(selected).hexdigest()
    if actual != text_checksum:
        return {"status": "REJECTED", "reason": "CHECKSUM_MISMATCH", "span": base}
    return {"status": "VERIFIED", "reason": "EXACT_REVISION_AND_BYTES", "span": base}
