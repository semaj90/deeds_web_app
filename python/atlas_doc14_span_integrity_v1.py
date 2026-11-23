"""Fail-closed source-span validation and JSONL publication for DOC-14.

The expected normalized-document digest comes from the capture artifact
readback, never from a relation proposal. Stanza character offsets are checked
against the chunk text and converted to UTF-8 byte coordinates before the
candidate batch can replace its prior JSONL artifact.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
from typing import Any, Mapping, Sequence


_SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _span(value: Any, *, limit: int, label: str) -> tuple[int, int]:
    if (
        not isinstance(value, (list, tuple)) or len(value) != 2
        or not isinstance(value[0], int) or isinstance(value[0], bool)
        or not isinstance(value[1], int) or isinstance(value[1], bool)
    ):
        raise ValueError(f"{label}_SPAN_REQUIRED")
    start, end = value
    if start < 0 or end <= start or end > limit:
        raise ValueError(f"{label}_SPAN_OUT_OF_BOUNDS")
    return start, end


def validate_stanza_relation_candidate_v1(
    *,
    relation: Mapping[str, Any],
    source_readback: Mapping[str, Any],
    chunk: Mapping[str, Any],
) -> dict[str, Any]:
    """Verify candidate identity and every Stanza span against captured bytes."""
    source_bytes = source_readback.get("content_bytes")
    if not isinstance(source_bytes, bytes):
        raise ValueError("NORMALIZED_CAPTURE_BYTES_REQUIRED")

    expected_document_sha256 = source_readback.get("content_sha256")
    if not isinstance(expected_document_sha256, str) or not _SHA256_HEX.fullmatch(expected_document_sha256):
        raise ValueError("CAPTURE_READBACK_SHA256_REQUIRED")
    actual_document_sha256 = _sha256(source_bytes)
    if actual_document_sha256 != expected_document_sha256:
        raise ValueError("NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH")

    for source_field, chunk_field in (
        ("source_id", "source_id"),
        ("source_revision", "source_revision"),
        ("source_url", "source_url"),
    ):
        source_value = source_readback.get(source_field)
        chunk_value = chunk.get(chunk_field)
        if not source_value or source_value != chunk_value:
            raise ValueError(f"CHUNK_{source_field.upper()}_MISMATCH")

    chunk_id = chunk.get("chunk_id")
    chunk_text = chunk.get("text")
    if not isinstance(chunk_id, str) or not chunk_id or not isinstance(chunk_text, str):
        raise ValueError("CHUNK_IDENTITY_REQUIRED")
    chunk_bytes = chunk_text.encode("utf-8")
    chunk_start, chunk_end = _span(
        [chunk.get("start_byte"), chunk.get("end_byte")],
        limit=len(source_bytes), label="CHUNK",
    )
    if source_bytes[chunk_start:chunk_end] != chunk_bytes:
        raise ValueError("CHUNK_SOURCE_READBACK_MISMATCH")
    if chunk.get("document_checksum") != expected_document_sha256:
        raise ValueError("CHUNK_DOCUMENT_CHECKSUM_MISMATCH")

    binding = relation.get("evidence_binding")
    if not isinstance(binding, Mapping):
        raise ValueError("EVIDENCE_BINDING_MISSING")
    if relation.get("status") != "PROPOSED":
        raise ValueError("RELATION_PROPOSAL_STATUS_INVALID")
    if relation.get("canonical_authority") is not False:
        raise ValueError("RELATION_PROPOSAL_AUTHORITY_INVALID")
    if not isinstance(relation.get("extractor_version"), str) or not relation["extractor_version"].strip():
        raise ValueError("RELATION_EXTRACTOR_VERSION_REQUIRED")
    identity_pairs = (
        ("source_ref", source_readback.get("source_id")),
        ("source_url", source_readback.get("source_url")),
        ("source_revision", source_readback.get("source_revision")),
        ("document_checksum", expected_document_sha256),
        ("chunk_id", chunk_id),
        ("chunk_evidence_revision", chunk.get("chunk_evidence_revision")),
    )
    for field, expected in identity_pairs:
        if binding.get(field) != expected:
            raise ValueError(f"EVIDENCE_{field.upper()}_MISMATCH")
    if binding.get("coordinate_space") != "NORMALIZED_DOCUMENT_UTF8_BYTES":
        raise ValueError("EVIDENCE_COORDINATE_SPACE_MISMATCH")

    evidence_chars = _span(
        relation.get("evidence_span_chars"), limit=len(chunk_text), label="EVIDENCE_CHARACTER",
    )
    expected_start = chunk_start + len(chunk_text[:evidence_chars[0]].encode("utf-8"))
    expected_end = chunk_start + len(chunk_text[:evidence_chars[1]].encode("utf-8"))
    evidence_start, evidence_end = _span(
        [binding.get("start_byte"), binding.get("end_byte")],
        limit=len(source_bytes), label="EVIDENCE_BYTE",
    )
    if (evidence_start, evidence_end) != (expected_start, expected_end):
        raise ValueError("EVIDENCE_CHARACTER_BYTE_MAPPING_MISMATCH")
    if evidence_start < chunk_start or evidence_end > chunk_end:
        raise ValueError("EVIDENCE_SPAN_OUTSIDE_CHUNK")

    evidence_bytes = source_bytes[evidence_start:evidence_end]
    try:
        evidence_text = evidence_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise ValueError("EVIDENCE_SPAN_NOT_UTF8_BOUNDARY") from error
    if evidence_text != binding.get("evidence_text"):
        raise ValueError("EVIDENCE_TEXT_MISMATCH")
    evidence_sha256 = _sha256(evidence_bytes)
    if binding.get("evidence_checksum") != evidence_sha256:
        raise ValueError("EVIDENCE_CHECKSUM_MISMATCH")

    predicate_span = _span(
        relation.get("predicate_span_chars"), limit=len(chunk_text), label="PREDICATE_CHARACTER",
    )
    predicate_text = relation.get("predicate")
    if not isinstance(predicate_text, str) or chunk_text[predicate_span[0]:predicate_span[1]] != predicate_text:
        raise ValueError("PREDICATE_TEXT_SPAN_MISMATCH")
    if predicate_span[0] < evidence_chars[0] or predicate_span[1] > evidence_chars[1]:
        raise ValueError("PREDICATE_OUTSIDE_EVIDENCE_SPAN")

    participants = relation.get("participants")
    if not isinstance(participants, (list, tuple)) or len(participants) < 2:
        raise ValueError("RELATION_PARTICIPANTS_REQUIRED")
    for participant in participants:
        if not isinstance(participant, Mapping):
            raise ValueError("RELATION_PARTICIPANT_INVALID")
        participant_span = _span(
            [participant.get("start_char"), participant.get("end_char")],
            limit=len(chunk_text), label="PARTICIPANT_CHARACTER",
        )
        participant_text = participant.get("text")
        if not isinstance(participant_text, str) or chunk_text[participant_span[0]:participant_span[1]] != participant_text:
            raise ValueError("PARTICIPANT_TEXT_SPAN_MISMATCH")
        if participant_span[0] < evidence_chars[0] or participant_span[1] > evidence_chars[1]:
            raise ValueError("PARTICIPANT_OUTSIDE_EVIDENCE_SPAN")

    for field, role in (("subject_candidates", "subject"), ("object_candidates", "object")):
        candidates = relation.get(field)
        if not isinstance(candidates, (list, tuple)):
            raise ValueError(f"{field.upper()}_REQUIRED")
        expected_candidates = [item for item in participants if item.get("role") == role]
        if list(candidates) != expected_candidates:
            raise ValueError(f"{field.upper()}_PARTICIPANT_MISMATCH")

    return {
        "status": "SPAN_READBACK_VERIFIED",
        "sourceSha256": actual_document_sha256,
        "chunkId": chunk_id,
        "chunkSha256": _sha256(chunk_bytes),
        "startByte": evidence_start,
        "endByte": evidence_end,
        "evidenceSha256": evidence_sha256,
    }


def validate_relation_candidate_batch_v1(
    *,
    rows: Sequence[Mapping[str, Any]],
    sources_by_identity: Mapping[tuple[str, str, str], Mapping[str, Any]],
    chunks_by_id: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Validate every row before publication; any invalid row rejects the batch."""
    failures: list[tuple[int, str]] = []
    for index, row in enumerate(rows):
        chunk_id = row.get("chunk_id")
        chunk = chunks_by_id.get(str(chunk_id)) if chunk_id is not None else None
        candidate = row.get("candidate")
        if not isinstance(chunk, Mapping) or not isinstance(candidate, Mapping):
            failures.append((index, "CANDIDATE_CHUNK_IDENTITY_MISSING"))
            continue
        identity = (
            str(row.get("source_id") or ""),
            str(row.get("source_revision") or ""),
            str(chunk.get("source_url") or ""),
        )
        source = sources_by_identity.get(identity)
        if not isinstance(source, Mapping):
            failures.append((index, "NORMALIZED_CAPTURE_READBACK_MISSING"))
            continue
        try:
            verification = validate_stanza_relation_candidate_v1(
                relation=candidate, source_readback=source, chunk=chunk,
            )
        except ValueError as error:
            failures.append((index, str(error)))
            continue
        if (
            row.get("source_id") != chunk.get("source_id")
            or row.get("source_revision") != chunk.get("source_revision")
            or row.get("chunk_checksum") != verification["chunkSha256"]
            or row.get("span_validation") != "SPAN_READBACK_VERIFIED"
        ):
            failures.append((index, "CANDIDATE_ROW_IDENTITY_OR_VALIDATION_MISMATCH"))
    if failures:
        first_index, first_reason = failures[0]
        raise ValueError(
            f"DOC14_RELATION_CANDIDATE_BATCH_REJECTED:{len(failures)}:ROW_{first_index}:{first_reason}"
        )
    return {"validatedCount": len(rows), "failedCount": 0, "canonicalAuthority": False}


def publish_validated_relation_candidates_jsonl_v1(
    *,
    path: Path,
    rows: Sequence[Mapping[str, Any]],
    sources_by_identity: Mapping[tuple[str, str, str], Mapping[str, Any]],
    chunks_by_id: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Validate the complete batch, then atomically replace and read back JSONL."""
    validation = validate_relation_candidate_batch_v1(
        rows=rows, sources_by_identity=sources_by_identity, chunks_by_id=chunks_by_id,
    )
    payload = "".join(
        json.dumps(dict(row), sort_keys=True, ensure_ascii=False) + "\n" for row in rows
    ).encode("utf-8")
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent),
    )
    temporary_path = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        if temporary_path.read_bytes() != payload:
            raise RuntimeError("RELATION_CANDIDATE_TEMP_READBACK_MISMATCH")
        os.replace(temporary_path, path)
        readback = path.read_bytes()
        if readback != payload:
            raise RuntimeError("RELATION_CANDIDATE_ARTIFACT_READBACK_MISMATCH")
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass
    return {
        **validation,
        "path": str(path),
        "sha256": _sha256(readback),
        "byteLength": len(readback),
        "writesPerformed": True,
    }
