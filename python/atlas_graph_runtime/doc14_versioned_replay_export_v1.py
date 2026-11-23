"""Versioned query-candidate replay export and fail-closed GAN-validation verifier.

Packages one reviewed query and its candidate set with:
- `ordinalMap` (CandidateOrdinal `0..N-1` -> chunkId, sourceRef, sourceRevision, chunkSha256)
- `featureDefinitions`, `featureMatrix`, and `presenceMask` (explicit `0/1` masks)
- `tupleProvenance` (UTF-8 span-bound relation tuples)
- `relevanceGrades` (`0..3` grades + `reviewerRef`, exact 1-to-1 by chunkId)
- `quoteChecks` (exact source-byte quotes + SHA-256)

Fail-closed replay verifier (`replay_and_verify_bundle_v1`) requires authoritative
revisions, chunk hashes, and source-byte coverage for every candidate/quote, and
rejects:
- `REPLAY_MISSING_AUTHORITATIVE_EVIDENCE`
- `REPLAY_STALE_SOURCE_REVISION`
- `REPLAY_ROW_SUBSTITUTION_DETECTED`
- `REPLAY_INVALID_MASK`
- `REPLAY_DUPLICATE_OR_MISSING_GRADE`
- `REPLAY_QUOTE_MISMATCH`
- `REPLAY_CHECKSUM_MISMATCH`
"""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _canonical_json(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _sha256_bytes(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def build_versioned_replay_bundle_v1(
    *,
    query_id: str,
    query_text: str,
    feature_definitions: list[str],
    candidates: list[dict[str, Any]],
    feature_matrix: list[list[float | None]],
    presence_mask: list[list[int]],
    tuple_provenance: list[dict[str, Any]],
    relevance_grades: list[dict[str, Any]],
    quote_checks: list[dict[str, Any]],
) -> dict[str, Any]:
    """Assemble and SHA-256-seal a versioned query-candidate replay bundle."""
    if not candidates or not feature_definitions:
        raise ValueError("BUNDLE_EMPTY_CANDIDATES_OR_FEATURES")
    n = len(candidates)
    d = len(feature_definitions)
    if len(feature_matrix) != n or len(presence_mask) != n:
        raise ValueError("BUNDLE_MATRIX_ROW_COUNT_MISMATCH")

    ordinal_map = []
    for idx, c in enumerate(candidates):
        if len(feature_matrix[idx]) != d or len(presence_mask[idx]) != d:
            raise ValueError(f"BUNDLE_MATRIX_WIDTH_MISMATCH:row={idx}")
        ordinal_map.append(
            {
                "candidateOrdinal": idx,
                "chunkId": str(c["chunkId"]),
                "sourceRef": str(c["sourceRef"]),
                "sourceRevision": str(c["sourceRevision"]),
                "chunkSha256": str(c["chunkSha256"]),
            }
        )

    body = {
        "schema": "atlas.doc14-versioned-replay-bundle.v1",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "hiddenStatePersisted": False,
        "queryId": str(query_id),
        "queryText": str(query_text),
        "featureDefinitions": list(feature_definitions),
        "ordinalMap": ordinal_map,
        "featureMatrix": feature_matrix,
        "presenceMask": presence_mask,
        "tupleProvenance": tuple_provenance,
        "relevanceGrades": relevance_grades,
        "quoteChecks": quote_checks,
    }
    checksum = _sha256_bytes(_canonical_json(body).encode("utf-8"))
    return {**body, "bundleChecksum": checksum}


def replay_and_verify_bundle_v1(
    bundle: dict[str, Any],
    *,
    expected_source_revisions: dict[str, str],
    expected_chunk_hashes: dict[str, str],
    source_bytes_by_ref: dict[str, bytes],
    expected_chunk_spans: dict[str, tuple[int, int]],
    require_reviewed_grades: bool = True,
) -> dict[str, Any]:
    """Fail-closed replay verifier requiring full authoritative evidence coverage."""
    expected_sum = bundle.get("bundleChecksum")
    if not isinstance(expected_sum, str) or not expected_sum.startswith("sha256:"):
        raise ValueError("REPLAY_CHECKSUM_MISMATCH:missing")
    body = {k: v for k, v in bundle.items() if k != "bundleChecksum"}
    actual_sum = _sha256_bytes(_canonical_json(body).encode("utf-8"))
    if actual_sum != expected_sum:
        raise ValueError("REPLAY_CHECKSUM_MISMATCH:tampered")

    ordinal_map = bundle.get("ordinalMap") or []
    feat_defs = bundle.get("featureDefinitions") or []
    matrix = bundle.get("featureMatrix") or []
    masks = bundle.get("presenceMask") or []
    n = len(ordinal_map)
    d = len(feat_defs)
    if n == 0 or d == 0 or len(matrix) != n or len(masks) != n:
        raise ValueError("REPLAY_INVALID_MASK:shape_mismatch")

    seen_chunks: set[str] = set()
    verified_spans: dict[str, tuple[str, int, int]] = {}
    for idx, entry in enumerate(ordinal_map):
        if entry.get("candidateOrdinal") != idx:
            raise ValueError(f"REPLAY_ROW_SUBSTITUTION_DETECTED:ordinal={idx}")
        cid = str(entry.get("chunkId") or "")
        sref = str(entry.get("sourceRef") or "")
        srev = str(entry.get("sourceRevision") or "")
        chash = str(entry.get("chunkSha256") or "")
        if not cid or cid in seen_chunks:
            raise ValueError(f"REPLAY_ROW_SUBSTITUTION_DETECTED:duplicate_or_empty_chunk={cid}")
        seen_chunks.add(cid)

        if sref not in expected_source_revisions:
            raise ValueError(f"REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:source_revision={sref}")
        if srev != expected_source_revisions[sref]:
            raise ValueError(f"REPLAY_STALE_SOURCE_REVISION:{sref}")

        if cid not in expected_chunk_hashes:
            raise ValueError(f"REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:chunk_hash={cid}")
        if chash != expected_chunk_hashes[cid]:
            raise ValueError(f"REPLAY_ROW_SUBSTITUTION_DETECTED:hash={cid}")

        if sref not in source_bytes_by_ref:
            raise ValueError(f"REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:source_bytes={sref}")
        if cid not in expected_chunk_spans:
            raise ValueError(f"REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:chunk_span={cid}")
        raw = source_bytes_by_ref[sref]
        start, end = expected_chunk_spans[cid]
        if not isinstance(raw, bytes) or type(start) is not int or type(end) is not int or not 0 <= start < end <= len(raw):
            raise ValueError(f"REPLAY_CHUNK_SPAN_INVALID:{cid}")
        if _sha256_bytes(raw[start:end]) != chash:
            raise ValueError(f"REPLAY_CHUNK_BYTES_MISMATCH:{cid}")
        raw[start:end].decode("utf-8", errors="strict")
        verified_spans[cid] = (sref, start, end)

        row_vals = matrix[idx]
        row_mask = masks[idx]
        if len(row_vals) != d or len(row_mask) != d:
            raise ValueError(f"REPLAY_INVALID_MASK:width_row={idx}")
        for col_i, (val, m) in enumerate(zip(row_vals, row_mask)):
            if type(m) is not int or m not in (0, 1):
                raise ValueError(f"REPLAY_INVALID_MASK:non_binary_row={idx},col={col_i}")
            if m == 1 and (val is None or not isinstance(val, (int, float)) or not math.isfinite(float(val))):
                raise ValueError(f"REPLAY_INVALID_MASK:masked_active_nonfinite_row={idx},col={col_i}")

    grades = bundle.get("relevanceGrades") or []
    if require_reviewed_grades:
        if len(grades) != n:
            raise ValueError("REPLAY_DUPLICATE_OR_MISSING_GRADE:count_mismatch")
        graded_chunks: set[str] = set()
        for g in grades:
            gcid = str(g.get("chunkId") or "")
            if not gcid or gcid not in seen_chunks or gcid in graded_chunks:
                raise ValueError(f"REPLAY_DUPLICATE_OR_MISSING_GRADE:chunk={gcid}")
            graded_chunks.add(gcid)
            grade = g.get("reviewedGrade")
            reviewer = g.get("reviewerRef")
            if type(grade) is not int or grade not in (0, 1, 2, 3) or not isinstance(reviewer, str) or not reviewer.strip():
                raise ValueError(f"REPLAY_UNREVIEWED_GRADE:chunk={gcid}")

    quote_checks = bundle.get("quoteChecks") or []
    if not quote_checks:
        raise ValueError("REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:quote_checks_empty")
    for qc in quote_checks:
        sref = str(qc.get("sourceRef") or "")
        if sref not in source_bytes_by_ref:
            raise ValueError(f"REPLAY_MISSING_AUTHORITATIVE_EVIDENCE:quote_source={sref}")
        raw = source_bytes_by_ref[sref]
        start_b, end_b = qc.get("startByte"), qc.get("endByte")
        if type(start_b) is not int or type(end_b) is not int or sum(
            ref == sref and start <= start_b < end_b <= end and qc.get("chunkId") in (None, cid)
            for cid, (ref, start, end) in verified_spans.items()
        ) != 1:
            raise ValueError(f"REPLAY_QUOTE_MISMATCH:bounds={sref}:{start_b}:{end_b}")
        extracted = raw[start_b:end_b].decode("utf-8", errors="strict")
        if extracted != qc.get("quote") or _sha256_bytes(raw[start_b:end_b]) != qc.get("quoteSha256"):
            raise ValueError(f"REPLAY_QUOTE_MISMATCH:{sref}:{start_b}:{end_b}")

    return {
        "schema": "atlas.doc14-replay-verification.v1",
        "status": "REPLAY_VERIFIED",
        "canonicalAuthority": False,
        "writesPerformed": False,
        "candidateCount": n,
        "featureCount": d,
        "bundleChecksum": actual_sum,
    }
