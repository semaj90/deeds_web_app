"""Source-backed Relation Proposal & UTF-8 Byte-Span Verifier (v1).

Keeps EXTRACTOR -> PROPOSED -> REVIEWED -> GRAPH_ADMITTED strictly distinct:
  - Validates exact UTF-8 byte spans against independently read source bytes.
  - Attaches OAKLib concept suggestions when available; retains UNRESOLVED mappings.
  - Rejects any extractor attempt to self-promote to REVIEWED or GRAPH_ADMITTED.
  - Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence

_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_SHA256_HEX_RE = re.compile(r"^[0-9a-f]{64}$")
ALLOWED_PREDICATES = frozenset({"IMPORTS", "CALLS", "EXTENDS", "USES_API", "CONFIGURES", "TESTS"})


def verify_relation_proposal_v1(
    proposal: Mapping[str, Any],
    *,
    source_bytes: bytes,
    source_content_bytes: bytes | None = None,
    chunk_bytes: bytes | None = None,
    oak_suggest_fn: Callable[[str], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    status = str(proposal.get("status") or "").strip()
    if status != "PROPOSED":
        return {
            "accepted": False,
            "failure": "EXTRACTOR_CANNOT_SELF_ADMIT" if status in ("REVIEWED", "GRAPH_ADMITTED") else "INVALID_PROPOSAL_STATUS",
            "proposal": None,
            "canonicalAuthority": False,
            "writesPerformed": False,
        }

    chunk_id = str(proposal.get("chunkId") or "").strip()
    source_ref = str(proposal.get("sourceRef") or "").strip()
    source_rev = str(proposal.get("sourceRevision") or "").strip()
    content_sha = str(proposal.get("contentSha256") or "").strip()
    chunk_sha = str(proposal.get("chunkSha256") or "").strip()
    predicate = str(proposal.get("predicate") or "").strip().upper()
    subject = str(proposal.get("subject") or "").strip()
    obj = str(proposal.get("object") or "").strip()
    extractor_ver = str(proposal.get("extractorVersion") or "").strip()
    exact_text = str(proposal.get("exactText") or "")

    if not all([chunk_id, source_ref, predicate, subject, obj, extractor_ver, exact_text, content_sha]):
        return {"accepted": False, "failure": "PROPOSAL_FIELDS_INCOMPLETE", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
    if not _SHA256_RE.fullmatch(source_rev):
        return {"accepted": False, "failure": "INVALID_SOURCE_REVISION", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
    if predicate not in ALLOWED_PREDICATES:
        return {"accepted": False, "failure": f"UNSUPPORTED_PREDICATE:{predicate}", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
    if not _SHA256_HEX_RE.fullmatch(content_sha):
        return {"accepted": False, "failure": "INVALID_CONTENT_SHA256", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}

    try:
        start_byte = int(proposal.get("startByte"))
        end_byte = int(proposal.get("endByte"))
    except (TypeError, ValueError):
        return {"accepted": False, "failure": "INVALID_BYTE_SPAN", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}

    if start_byte < 0 or end_byte <= start_byte or end_byte > len(source_bytes):
        return {"accepted": False, "failure": "BYTE_SPAN_OUT_OF_RANGE", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}

    actual_chunk_sha = hashlib.sha256(chunk_bytes if chunk_bytes is not None else source_bytes).hexdigest()
    if chunk_sha and chunk_sha != actual_chunk_sha:
        return {"accepted": False, "failure": "CHUNK_SHA256_MISMATCH", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
    source_hash_status = "CARRIED_NOT_REHASHED"
    if source_content_bytes is not None:
        actual_content_sha = hashlib.sha256(source_content_bytes).hexdigest()
        if content_sha != actual_content_sha:
            return {"accepted": False, "failure": "SOURCE_CONTENT_SHA256_MISMATCH", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
        source_hash_status = "REHASHED_MATCH"
    try:
        actual_slice = source_bytes[start_byte:end_byte].decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        return {"accepted": False, "failure": "SPAN_SOURCE_NOT_UTF8", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}
    if actual_slice != exact_text:
        return {"accepted": False, "failure": "SPAN_BYTE_MISMATCH", "proposal": None, "canonicalAuthority": False, "writesPerformed": False}

    suggestions: list[dict[str, Any]] = []
    if oak_suggest_fn is not None:
        suggestions = list(oak_suggest_fn(obj) or [])

    mapping_status = "OAK_SUGGESTED_PENDING_REVIEW" if suggestions else "UNRESOLVED"
    out_proposal = {
        "chunkId": chunk_id,
        "sourceRef": source_ref,
        "sourceRevision": source_rev,
        # This is the parent source hash from the admitted chunk record; the
        # status below says whether complete source bytes were independently read.
        "contentSha256": content_sha,
        "chunkSha256": actual_chunk_sha,
        "predicate": predicate,
        "subject": subject,
        "object": obj,
        "startByte": start_byte,
        "endByte": end_byte,
        "exactText": exact_text,
        "extractorVersion": extractor_ver,
        "status": "PROPOSED",
        "mappingStatus": mapping_status,
        "oakSuggestions": suggestions,
        "spanVerified": True,
        "spanVerificationBasis": "EXACT_CHUNK_BYTES",
        "sourceContentHashStatus": source_hash_status,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {
        "accepted": True,
        "failure": None,
        "proposal": out_proposal,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def extract_and_verify_import_proposals_from_chunks_v1(
    chunks: Sequence[Mapping[str, Any]],
    *,
    extractor_version: str = "import-regex-v1",
    source_readback_fn: Callable[[str], bytes | None] | None = None,
    require_source_readback: bool = False,
    oak_suggest_fn: Callable[[str], list[dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    import_re = re.compile(r"""import\s+[^\n;]+?\s+from\s+['"]([^'"]+)['"]""")
    verified: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []

    for chunk in chunks:
        text = str(chunk.get("text") or "")
        raw_bytes = text.encode("utf-8")
        expected_chunk_sha = str(chunk.get("chunkSha256") or "").strip()
        if not _SHA256_HEX_RE.fullmatch(expected_chunk_sha):
            rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "CHUNK_SHA256_REQUIRED"})
            continue
        content_bytes: bytes | None = None
        span_bytes = raw_bytes
        chunk_start = 0
        if require_source_readback and source_readback_fn is None:
            rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "SOURCE_READBACK_REQUIRED"})
            continue
        if source_readback_fn is not None:
            try:
                content_bytes = source_readback_fn(str(chunk.get("sourceRef") or ""))
            except Exception:
                content_bytes = None
            if content_bytes is None:
                rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "SOURCE_READBACK_MISSING"})
                continue
            if hashlib.sha256(content_bytes).hexdigest() != str(chunk.get("contentSha256") or ""):
                rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "SOURCE_CONTENT_SHA256_MISMATCH"})
                continue
            first = content_bytes.find(raw_bytes)
            if first < 0:
                rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "CHUNK_NOT_FOUND_IN_SOURCE"})
                continue
            if content_bytes.find(raw_bytes, first + 1) >= 0:
                rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": "CHUNK_SOURCE_MATCH_AMBIGUOUS"})
                continue
            span_bytes = content_bytes
            chunk_start = first
        for m in import_re.finditer(text):
            start_byte = chunk_start + len(text[: m.start()].encode("utf-8"))
            end_byte = chunk_start + len(text[: m.end()].encode("utf-8"))
            res = verify_relation_proposal_v1(
                {
                    "chunkId": chunk.get("chunkId"),
                    "sourceRef": chunk.get("sourceRef"),
                    "sourceRevision": chunk.get("sourceRevision"),
                    "contentSha256": chunk.get("contentSha256"),
                    "chunkSha256": expected_chunk_sha,
                    "predicate": "IMPORTS",
                    "subject": chunk.get("sourceRef"),
                    "object": m.group(1),
                    "startByte": start_byte,
                    "endByte": end_byte,
                    "exactText": m.group(0),
                    "extractorVersion": extractor_version,
                    "status": "PROPOSED",
                },
                source_bytes=span_bytes,
                source_content_bytes=content_bytes,
                chunk_bytes=raw_bytes,
                oak_suggest_fn=oak_suggest_fn,
            )
            if res["accepted"]:
                verified.append(res["proposal"])
            else:
                rejected.append({"chunkId": chunk.get("chunkId"), "sourceRef": chunk.get("sourceRef"), "failure": res["failure"]})

    return {
        "schema": "atlas.relation-proposals.v1",
        "verifiedCount": len(verified),
        "rejectedCount": len(rejected),
        "proposals": verified,
        "rejected": rejected,
        "sourceReadbackRequired": require_source_readback,
        "sourceReadbackConfigured": source_readback_fn is not None,
        "sourceContentHashVerifiedCount": sum(p["sourceContentHashStatus"] == "REHASHED_MATCH" for p in verified),
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
