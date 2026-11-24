"""Bind a reviewed DOC-14 proposal to independently read-back PG page/chunk bytes.

The receipt is a provenance crosswalk only. It does not admit ontology facts,
create graph edges, or claim ACE proof usability.
"""
from __future__ import annotations

import hashlib
from typing import Any, Mapping


def _hex_sha256(value: Any, code: str) -> str:
    text = str(value or "").removeprefix("sha256:")
    if len(text) != 64 or any(ch not in "0123456789abcdef" for ch in text):
        raise ValueError(code)
    return text


def build_doc14_canonical_source_binding_v1(
    *,
    proposal_envelope: Mapping[str, Any],
    proposal_file_sha256: str,
    review_receipt: Mapping[str, Any],
    page: Mapping[str, Any],
    chunk: Mapping[str, Any],
    normalized_source_bytes: bytes,
    graph_state: Mapping[str, Any],
) -> dict[str, Any]:
    """Verify review↔capture↔admitted-page↔admitted-chunk identity and exact spans."""
    candidate = (proposal_envelope.get("proposalVerification") or {}).get("proposal")
    capture = proposal_envelope.get("capture")
    ontology = proposal_envelope.get("ontologyReview")
    if not isinstance(candidate, Mapping) or not isinstance(capture, Mapping) or not isinstance(ontology, Mapping):
        raise ValueError("DOC14_PROPOSAL_ENVELOPE_INVALID")
    if review_receipt.get("schema") != "atlas.doc14-relation-human-review.v1":
        raise ValueError("DOC14_REVIEW_SCHEMA_INVALID")
    if review_receipt.get("decision") != "APPROVED_FOR_REVIEW_WORKFLOW":
        raise ValueError("DOC14_REVIEW_NOT_APPROVED_FOR_REVIEW_WORKFLOW")
    if review_receipt.get("authority", {}).get("admissionAuthorized") is not False:
        raise ValueError("DOC14_REVIEW_AUTHORITY_MUST_NOT_AUTHORIZE_ADMISSION")

    actual_proposal_sha = _hex_sha256(proposal_file_sha256, "DOC14_PROPOSAL_FILE_SHA_INVALID")
    review_binding = review_receipt.get("proposal")
    if not isinstance(review_binding, Mapping):
        raise ValueError("DOC14_REVIEW_PROPOSAL_BINDING_MISSING")
    if _hex_sha256(review_binding.get("sha256"), "DOC14_REVIEW_PROPOSAL_SHA_INVALID") != actual_proposal_sha:
        raise ValueError("DOC14_REVIEW_PROPOSAL_SHA_MISMATCH")

    source_ref = str(capture.get("sourceRef") or "")
    normalized_sha = hashlib.sha256(normalized_source_bytes).hexdigest()
    if not source_ref or source_ref != page.get("url") or source_ref != candidate.get("sourceRef"):
        raise ValueError("DOC14_SOURCE_REF_MISMATCH")
    if _hex_sha256(capture.get("normalizedTextSha256"), "DOC14_CAPTURE_HASH_INVALID") != normalized_sha:
        raise ValueError("DOC14_CAPTURE_HASH_MISMATCH")
    raw_html_sha = _hex_sha256(capture.get("rawHtmlSha256"), "DOC14_CAPTURE_RAW_HASH_INVALID")
    if (_hex_sha256(candidate.get("contentSha256"), "DOC14_PROPOSAL_RAW_HASH_INVALID") != raw_html_sha
            or _hex_sha256(review_binding.get("sourceContentSha256"), "DOC14_REVIEW_RAW_HASH_INVALID") != raw_html_sha):
        raise ValueError("DOC14_RAW_CAPTURE_HASH_MISMATCH")
    if _hex_sha256(page.get("content_hash"), "DOC14_PAGE_CONTENT_HASH_INVALID") != normalized_sha:
        raise ValueError("DOC14_PAGE_CONTENT_HASH_MISMATCH")
    if _hex_sha256(candidate.get("sourceRevision"), "DOC14_CANDIDATE_SOURCE_REVISION_INVALID") != normalized_sha:
        raise ValueError("DOC14_CANDIDATE_SOURCE_REVISION_MISMATCH")
    if _hex_sha256(review_binding.get("sourceRevision"), "DOC14_REVIEW_SOURCE_REVISION_INVALID") != normalized_sha:
        raise ValueError("DOC14_REVIEW_SOURCE_REVISION_MISMATCH")

    page_revision = _hex_sha256(page.get("evidence_revision"), "DOC14_PAGE_EVIDENCE_REVISION_INVALID")
    chunk_revision = _hex_sha256(chunk.get("evidence_revision"), "DOC14_CHUNK_EVIDENCE_REVISION_INVALID")
    if page_revision == normalized_sha or chunk_revision == normalized_sha:
        # The canonical evidence revisions are intentionally distinct from content hashes.
        raise ValueError("DOC14_EVIDENCE_REVISION_COLLAPSED_INTO_CONTENT_HASH")

    start, end = candidate.get("startByte"), candidate.get("endByte")
    chunk_start, chunk_end = chunk.get("start_byte"), chunk.get("end_byte")
    if any(not isinstance(n, int) or isinstance(n, bool) for n in (start, end, chunk_start, chunk_end)):
        raise ValueError("DOC14_BYTE_SPAN_INVALID")
    if start < 0 or end <= start or end > len(normalized_source_bytes):
        raise ValueError("DOC14_SOURCE_SPAN_OUT_OF_RANGE")
    chunk_bytes = str(chunk.get("text") or "").encode("utf-8")
    if chunk_start < 0 or chunk_end <= chunk_start or chunk_end > len(normalized_source_bytes):
        raise ValueError("DOC14_CHUNK_SPAN_OUT_OF_RANGE")
    if normalized_source_bytes[chunk_start:chunk_end] != chunk_bytes:
        raise ValueError("DOC14_CANONICAL_CHUNK_SOURCE_BYTES_MISMATCH")
    if _hex_sha256(chunk.get("chunk_checksum"), "DOC14_CHUNK_CHECKSUM_INVALID") != hashlib.sha256(chunk_bytes).hexdigest():
        raise ValueError("DOC14_CANONICAL_CHUNK_CHECKSUM_MISMATCH")
    if not (chunk_start <= start < end <= chunk_end):
        raise ValueError("DOC14_EVIDENCE_NOT_WITHIN_CANONICAL_CHUNK")

    exact_text = str(candidate.get("exactText") or "")
    evidence = normalized_source_bytes[start:end]
    if not exact_text or evidence.decode("utf-8", errors="strict") != exact_text:
        raise ValueError("DOC14_CANONICAL_EVIDENCE_TEXT_MISMATCH")
    if (review_binding.get("startByte") != start or review_binding.get("endByte") != end
            or review_binding.get("exactText") != exact_text):
        raise ValueError("DOC14_REVIEW_EVIDENCE_SPAN_MISMATCH")
    if hashlib.sha256(evidence).hexdigest() != _hex_sha256(candidate.get("chunkSha256"), "DOC14_PROPOSAL_EVIDENCE_HASH_INVALID"):
        raise ValueError("DOC14_PROPOSAL_EVIDENCE_HASH_MISMATCH")
    if (int(chunk.get("ordinal", -1)) < 0 or not str(chunk.get("chunk_id") or "")
            or not str(page.get("id") or "")):
        raise ValueError("DOC14_CANONICAL_PAGE_CHUNK_IDENTITY_MISSING")

    relation_ids = {
        "subjectId": str(review_binding.get("subjectId") or ""),
        "predicateId": str(review_binding.get("predicateId") or ""),
        "objectId": str(review_binding.get("objectId") or ""),
    }
    relation = next((
        item for item in (proposal_envelope.get("existingOntologyRelations") or {}).get("relations", [])
        if isinstance(item, Mapping)
        and item.get("subjectExternalId") == relation_ids["subjectId"]
        and item.get("predicateExternalId") == relation_ids["predicateId"]
        and item.get("objectExternalId") == relation_ids["objectId"]
    ), None)
    if not relation or relation.get("ontologyRevision") != review_binding.get("ontologyRevision"):
        raise ValueError("DOC14_REVIEW_ONTOLOGY_RELATION_MISMATCH")
    if relation_ids != {
        "subjectId": "ATLASLANG:cuda_cpp",
        "predicateId": "compiles_to",
        "objectId": "ATLASISA:ptx",
    }:
        raise ValueError("DOC14_REVIEWED_RELATION_IDENTITY_MISMATCH")

    graph_revision_count = int(graph_state.get("nonNullGraphRevisionCount", -1))
    ontology_tuple_rows = int(graph_state.get("ontologyTupleRows", -1))
    ontology_relation_rows = int(graph_state.get("ontologyRelationRows", -1))
    if graph_revision_count < 0 or ontology_tuple_rows < 0 or ontology_relation_rows < 0:
        raise ValueError("DOC14_GRAPH_STATE_READBACK_REQUIRED")
    graph_admission_ready = graph_revision_count > 0
    return {
        "schema": "atlas.doc14-canonical-source-binding.v1",
        "status": "CANONICAL_SOURCE_BINDING_VERIFIED",
        "review": {
            "reviewId": review_receipt.get("reviewId"),
            "decision": review_receipt.get("decision"),
            "proposalFileSha256": actual_proposal_sha,
            "admissionAuthorized": False,
            "semanticReviewDecisionBound": True,
        },
        "source": {
            "sourceRef": source_ref,
            "pageId": str(page["id"]),
            "contentSha256": normalized_sha,
            "pageEvidenceRevision": str(page["evidence_revision"]),
        },
        "chunk": {
            "chunkId": str(chunk["chunk_id"]),
            "ordinal": int(chunk["ordinal"]),
            "chunkSha256": hashlib.sha256(chunk_bytes).hexdigest(),
            "chunkEvidenceRevision": str(chunk["evidence_revision"]),
            "startByte": chunk_start,
            "endByte": chunk_end,
        },
        "evidence": {
            "exactText": exact_text,
            "startByte": start,
            "endByte": end,
            "chunkStartByte": start - chunk_start,
            "chunkEndByte": end - chunk_start,
            "spanSha256": hashlib.sha256(evidence).hexdigest(),
        },
        "relation": {
            **relation_ids,
            "ontologyRevision": str(relation.get("ontologyRevision")),
            "semanticReviewDecisionBound": True,
        },
        "graphReadback": {
            "nonNullGraphRevisionCount": graph_revision_count,
            "ontologyTupleRows": ontology_tuple_rows,
            "ontologyRelationRows": ontology_relation_rows,
            "anyGraphRevisionPresent": graph_admission_ready,
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
