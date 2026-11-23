"""Canonical API documentation fact extraction & fail-closed citation verifier (`atlas.api-document-fact.v1`).

Reuses `python.atlas_external_docs.extract_code_blocks_and_signatures` to extract
API symbols with exact UTF-8 byte spans, builds `EXTRACTED_PROPOSAL` fact records,
and fails closed on uncaptured pages, stale hashes, nonexistent symbols, unsupported
version assertions, unapproved ontology mappings, or unsupported citations.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from typing import Any, Mapping, Sequence

from python.atlas_external_docs import extract_code_blocks_and_signatures

_SHA256 = re.compile(r"^sha256:[0-9a-f]{64}$")
_DOC14_FACT_PREDICATES = frozenset({"DOCUMENTED_BY", "REQUIRES", "USES"})


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_source_span(
    markdown_bytes: bytes,
    start_byte: int,
    end_byte: int,
    expected_text: str,
) -> bool:
    """Verify exact UTF-8 byte slice matches `expected_text`."""
    if not (0 <= start_byte < end_byte <= len(markdown_bytes)):
        return False
    return markdown_bytes[start_byte:end_byte] == expected_text.encode("utf-8")


def extract_api_document_facts_v1(
    *,
    document_id: str,
    chunk_id: str,
    source_url: str,
    source_revision: str,
    markdown_text: str,
    heading: str,
    expected_content_sha256: str,
    extractor_revision: str = "source-span-extractor/v1",
) -> list[dict[str, Any]]:
    """Extract `atlas.api-document-fact.v1` proposals with verified UTF-8 byte spans."""
    if not document_id or not chunk_id or not source_url:
        raise ValueError("UNCAPTURED_PAGE_IDENTITY_REQUIRED")
    if not _SHA256.fullmatch(source_revision):
        raise ValueError("INVALID_SOURCE_REVISION")

    raw_bytes = markdown_text.encode("utf-8")
    actual_sha = f"sha256:{hashlib.sha256(raw_bytes).hexdigest()}"
    if actual_sha != expected_content_sha256:
        raise ValueError("STALE_DOCUMENT_CONTENT_SHA256")

    _, signatures = extract_code_blocks_and_signatures(markdown_text)
    if not signatures:
        raise ValueError("NO_API_SYMBOL_FOUND")

    facts: list[dict[str, Any]] = []
    search_from = 0
    for sig in signatures:
        sig_bytes = sig.encode("utf-8")
        idx = raw_bytes.find(sig_bytes, search_from)
        if idx < 0:
            idx = raw_bytes.find(sig_bytes)
        if idx < 0:
            continue
        start_byte = idx
        end_byte = idx + len(sig_bytes)
        search_from = end_byte
        if not verify_source_span(raw_bytes, start_byte, end_byte, sig):
            continue
        facts.append({
            "schema": "atlas.api-document-fact.v1",
            "authority": "EXTRACTED_PROPOSAL",
            "document": {
                "documentId": document_id,
                "chunkId": chunk_id,
                "sourceUrl": source_url,
                "sourceRevision": source_revision,
                "contentSha256": actual_sha,
                "heading": heading,
            },
            "mention": {
                "kind": "API_SYMBOL",
                "text": sig,
                "startByte": start_byte,
                "endByte": end_byte,
                "offsetSpace": "document-markdown-utf8",
            },
            "context": {
                "apiVersion": None,
                "signature": sig,
                "deprecation": None,
            },
            "relationProposal": {
                "predicate": "DOCUMENTED_BY",
                "subjectRef": sig,
                "objectRef": None,
                "ontologyRevision": None,
                "status": "PENDING",
            },
            "extraction": {
                "method": "source-span-extractor",
                "revision": extractor_revision,
            },
        })

    if not facts:
        raise ValueError("NO_VERIFIABLE_SOURCE_SPAN_FOUND")
    return facts


def verify_cited_api_recommendation_v1(
    *,
    question: str,
    answer: str,
    cited_fact: Mapping[str, Any],
    markdown_bytes: bytes,
    expected_content_sha256: str,
    require_approved_ontology: bool = True,
    asserted_version_requirement: str | None = None,
) -> dict[str, Any]:
    """Fail-closed gate for cited API recommendations & DOC-14 relation admission."""
    doc = cited_fact.get("document") or {}
    mention = cited_fact.get("mention") or {}
    rel = cited_fact.get("relationProposal") or {}

    actual_sha = f"sha256:{hashlib.sha256(markdown_bytes).hexdigest()}"
    if actual_sha != expected_content_sha256 or doc.get("contentSha256") != expected_content_sha256:
        raise ValueError("STALE_DOCUMENT_CONTENT_SHA256")

    start_b = int(mention.get("startByte", -1))
    end_b = int(mention.get("endByte", -1))
    sym_text = str(mention.get("text") or "")
    if not verify_source_span(markdown_bytes, start_b, end_b, sym_text):
        raise ValueError("UNSUPPORTED_SOURCE_SPAN_CITATION")

    if sym_text not in answer:
        raise ValueError("UNSUPPORTED_CITATION_NOT_IN_ANSWER")

    predicate = str(rel.get("predicate") or "")
    if predicate not in _DOC14_FACT_PREDICATES:
        raise ValueError("UNSUPPORTED_DOC14_PREDICATE")

    if require_approved_ontology:
        if rel.get("status") != "APPROVED" or not rel.get("ontologyRevision") or not rel.get("objectRef"):
            raise ValueError("UNAPPROVED_ONTOLOGY_MAPPING")

    if asserted_version_requirement:
        span_window = markdown_bytes[max(0, start_b - 64):min(len(markdown_bytes), end_b + 64)].decode(
            "utf-8", errors="replace"
        )
        if asserted_version_requirement not in span_window:
            raise ValueError("UNSUPPORTED_VERSION_ASSERTION")

    return {
        "schema": "atlas.cited-api-recommendation-receipt.v1",
        "question": question,
        "answer": answer,
        "verifiedSymbol": sym_text,
        "chunkId": doc.get("chunkId"),
        "sourceRevision": doc.get("sourceRevision"),
        "contentSha256": actual_sha,
        "evidenceSpan": {"startByte": start_b, "endByte": end_b},
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def build_doc14_oak_mapping_review_v1(
    *,
    fact: Mapping[str, Any],
    markdown_bytes: bytes,
    expected_content_sha256: str,
    oak_candidate_bundle: Mapping[str, Any],
) -> dict[str, Any]:
    """Join a verified API-symbol fact to bounded OAK suggestions for review.

    OAK results remain suggestions: this function never fills ontology IDs,
    approves a mapping, creates a graph edge, or writes to a store.
    """
    if fact.get("schema") != "atlas.api-document-fact.v1" or fact.get("authority") != "EXTRACTED_PROPOSAL":
        raise ValueError("DOC14_API_FACT_PROPOSAL_REQUIRED")
    document = fact.get("document")
    mention = fact.get("mention")
    relation = fact.get("relationProposal")
    if not isinstance(document, Mapping) or not isinstance(mention, Mapping) or not isinstance(relation, Mapping):
        raise ValueError("DOC14_API_FACT_BINDING_REQUIRED")
    if not _SHA256.fullmatch(expected_content_sha256 or ""):
        raise ValueError("DOC14_EXPECTED_CONTENT_SHA256_REQUIRED")
    if f"sha256:{_sha256_hex(markdown_bytes)}" != expected_content_sha256:
        raise ValueError("DOC14_SOURCE_CONTENT_HASH_MISMATCH")
    if document.get("contentSha256") != expected_content_sha256:
        raise ValueError("DOC14_FACT_CONTENT_HASH_MISMATCH")
    source_revision = document.get("sourceRevision")
    if not isinstance(source_revision, str) or not _SHA256.fullmatch(source_revision):
        raise ValueError("DOC14_SOURCE_REVISION_UNQUALIFIED")
    if not all(str(document.get(key) or "").strip() for key in ("documentId", "chunkId", "sourceUrl")):
        raise ValueError("DOC14_DOCUMENT_IDENTITY_REQUIRED")
    if relation.get("predicate") != "DOCUMENTED_BY" or relation.get("status") != "PENDING":
        raise ValueError("DOC14_RELATION_NOT_PENDING_DOCUMENTED_BY")
    if relation.get("subjectRef") != mention.get("text") or relation.get("objectRef") is not None:
        raise ValueError("DOC14_RELATION_ENDPOINT_SHAPE_MISMATCH")
    if mention.get("kind") != "API_SYMBOL" or mention.get("offsetSpace") != "document-markdown-utf8":
        raise ValueError("DOC14_API_SYMBOL_SPAN_REQUIRED")
    try:
        start_byte, end_byte = int(mention["startByte"]), int(mention["endByte"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValueError("DOC14_API_SYMBOL_SPAN_INVALID") from exc
    evidence_text = mention.get("text")
    if not isinstance(evidence_text, str) or not verify_source_span(markdown_bytes, start_byte, end_byte, evidence_text):
        raise ValueError("DOC14_API_SYMBOL_SPAN_READBACK_MISMATCH")

    bundle: Mapping[str, Any] = oak_candidate_bundle
    service_source = "DIRECT_ADAPTER"
    if bundle.get("schema") == "atlas.oaklib-label-search-response.v1":
        if (
            bundle.get("status") != "PROPOSAL_ONLY"
            or bundle.get("canonicalAuthority") is not False
            or bundle.get("writesPerformed") is not False
        ):
            raise ValueError("DOC14_OAK_SERVICE_RESPONSE_AUTHORITY_INVALID")
        nested = bundle.get("candidateBundle")
        matches_from_service = bundle.get("matches")
        if not isinstance(nested, Mapping) or not isinstance(matches_from_service, list):
            raise ValueError("DOC14_OAK_SERVICE_RESPONSE_SHAPE_INVALID")
        if (
            nested.get("ontologyRevision") != bundle.get("ontologyRevision")
            or nested.get("producerRevision") != bundle.get("producerRevision")
        ):
            raise ValueError("DOC14_OAK_SERVICE_RESPONSE_REVISION_MISMATCH")
        bundle = {**nested, "matches": matches_from_service}
        service_source = "SIDECAR_LABEL_SEARCH"
    ontology_revision = bundle.get("ontologyRevision")
    producer_revision = bundle.get("producerRevision")
    source_selector = bundle.get("sourceSelector")
    if bundle.get("schema") != "atlas.oaklib-candidate-bundle.v1" or bundle.get("canonicalAuthority") is not False:
        raise ValueError("DOC14_OAK_PROPOSAL_BUNDLE_REQUIRED")
    if not isinstance(ontology_revision, str) or not _SHA256.fullmatch(ontology_revision):
        raise ValueError("DOC14_OAK_ONTOLOGY_REVISION_UNQUALIFIED")
    if not isinstance(producer_revision, str) or not producer_revision.strip() or not isinstance(source_selector, str) or not source_selector.strip():
        raise ValueError("DOC14_OAK_PRODUCER_IDENTITY_REQUIRED")

    normalized_mention = unicodedata.normalize("NFC", evidence_text).strip().casefold()
    matches = bundle.get("matches")
    concepts = bundle.get("concepts")
    if not isinstance(matches, list) or not isinstance(concepts, list):
        raise ValueError("DOC14_OAK_SEARCH_RESULT_SHAPE_INVALID")
    matched_ids: set[str] = set()
    for match in matches:
        if not isinstance(match, Mapping):
            raise ValueError("DOC14_OAK_SEARCH_MATCH_INVALID")
        term = unicodedata.normalize("NFC", str(match.get("searchText") or "")).strip().casefold()
        if term != normalized_mention:
            continue
        ids = match.get("externalIds")
        if not isinstance(ids, list) or len(ids) > 16:
            raise ValueError("DOC14_OAK_SEARCH_CANDIDATE_LIMIT_INVALID")
        matched_ids.update(str(item) for item in ids if isinstance(item, str) and item.strip())

    concepts_by_id: dict[str, Mapping[str, Any]] = {}
    for candidate in concepts:
        if not isinstance(candidate, Mapping):
            raise ValueError("DOC14_OAK_CONCEPT_CANDIDATE_INVALID")
        external_id = candidate.get("externalId")
        if not isinstance(external_id, str) or not external_id.strip() or external_id in concepts_by_id:
            raise ValueError("DOC14_OAK_CONCEPT_CANDIDATE_ID_INVALID")
        if candidate.get("ontologyRevision") != ontology_revision or candidate.get("producerRevision") != producer_revision:
            raise ValueError("DOC14_OAK_CANDIDATE_REVISION_MISMATCH")
        if candidate.get("canonicalAuthority") is not False or candidate.get("status") != "PROPOSED":
            raise ValueError("DOC14_OAK_CANDIDATE_AUTHORITY_INVALID")
        if not isinstance(candidate.get("label"), str) or not isinstance(candidate.get("evidenceRefs"), (list, tuple)):
            raise ValueError("DOC14_OAK_CANDIDATE_EVIDENCE_INVALID")
        concepts_by_id[external_id] = candidate
    if not matched_ids.issubset(concepts_by_id):
        raise ValueError("DOC14_OAK_MATCH_WITHOUT_CONCEPT_CANDIDATE")

    source_selector_checksum = f"sha256:{_sha256_hex(source_selector.encode('utf-8'))}"
    candidates = [
        {
            "externalId": external_id,
            "label": str(concepts_by_id[external_id]["label"]),
            "ontologyRevision": ontology_revision,
            "producerRevision": producer_revision,
            "evidenceRefs": [
                str(ref).replace(source_selector, source_selector_checksum)
                for ref in (concepts_by_id[external_id].get("evidenceRefs") or [])
                if isinstance(ref, str)
            ],
            "mappingStatus": "SUGGESTED_REQUIRES_REVIEW",
        }
        for external_id in sorted(matched_ids)
    ]
    status = "NO_OAK_CANDIDATE" if not candidates else ("AMBIGUOUS_REVIEW_REQUIRED" if len(candidates) > 1 else "SINGLE_CANDIDATE_REVIEW_REQUIRED")
    evidence_checksum = _sha256_hex(markdown_bytes[start_byte:end_byte])
    body = {
        "schema": "atlas.doc14-oak-mapping-review.v1",
        "source": {
            "documentId": document["documentId"],
            "chunkId": document["chunkId"],
            "sourceUrl": document["sourceUrl"],
            "sourceRevision": source_revision,
            "contentSha256": expected_content_sha256,
            "evidenceSpan": {"startByte": start_byte, "endByte": end_byte},
            "evidenceText": evidence_text,
            "evidenceChecksum": evidence_checksum,
        },
        "relationProposal": {"predicate": "DOCUMENTED_BY", "status": "PENDING", "ontologyIds": []},
        "oak": {
            "sourceSelectorKind": "SERVER_PINNED_OAK_SOURCE",
            "sourceSelectorChecksum": source_selector_checksum,
            "responseSource": service_source,
            "ontologyRevision": ontology_revision,
            "producerRevision": producer_revision,
        },
        "candidates": candidates,
        "status": status,
        "reviewRequired": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {**body, "proposalChecksum": f"sha256:{_sha256_hex(_canonical_json(body).encode('utf-8'))}"}
