"""Join source-verified DOC-14 relation proposals to OAK suggestions for review only."""

from __future__ import annotations

import hashlib
import json
import unicodedata
from typing import Any, Mapping

from python.atlas_doc14_span_integrity_v1 import validate_stanza_relation_candidate_v1


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


def _sha256(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


def _normalize_label(value: str) -> str:
    return unicodedata.normalize("NFC", value).strip().casefold()


def _review_status(candidates: list[dict[str, Any]]) -> str:
    if not candidates:
        return "UNRESOLVED"
    if len(candidates) > 1:
        return "AMBIGUOUS_REVIEW_REQUIRED"
    return "SINGLE_CANDIDATE_REVIEW_REQUIRED"


def build_doc14_relation_oak_review_v1(
    *,
    relation: Mapping[str, Any],
    source_readback: Mapping[str, Any],
    chunk: Mapping[str, Any],
    oak_response: Mapping[str, Any],
) -> dict[str, Any]:
    """Attach bounded OAK concept and relation suggestions to verified mentions.

    All mappings remain suggestions. This function cannot create Parent Atlas IDs,
    approve the source predicate, admit a graph edge, or write to any store.
    """
    span = validate_stanza_relation_candidate_v1(
        relation=relation, source_readback=source_readback, chunk=chunk,
    )

    if oak_response.get("schema") != "atlas.oaklib-label-search-response.v1":
        raise ValueError("DOC14_OAK_LABEL_SEARCH_RESPONSE_REQUIRED")
    if (oak_response.get("status") != "PROPOSAL_ONLY"
            or oak_response.get("canonicalAuthority") is not False
            or oak_response.get("writesPerformed") is not False):
        raise ValueError("DOC14_OAK_RESPONSE_AUTHORITY_INVALID")
    ontology_revision = oak_response.get("ontologyRevision")
    producer_revision = oak_response.get("producerRevision")
    if not isinstance(ontology_revision, str) or not ontology_revision.strip():
        raise ValueError("DOC14_OAK_ONTOLOGY_REVISION_REQUIRED")
    if not isinstance(producer_revision, str) or not producer_revision.strip():
        raise ValueError("DOC14_OAK_PRODUCER_REVISION_REQUIRED")

    bundle = oak_response.get("candidateBundle")
    matches = oak_response.get("matches")
    if not isinstance(bundle, Mapping) or not isinstance(matches, list):
        raise ValueError("DOC14_OAK_RESPONSE_SHAPE_INVALID")
    if (bundle.get("schema") != "atlas.oaklib-candidate-bundle.v1"
            or bundle.get("canonicalAuthority") is not False
            or bundle.get("ontologyRevision") != ontology_revision
            or bundle.get("producerRevision") != producer_revision):
        raise ValueError("DOC14_OAK_BUNDLE_REVISION_OR_AUTHORITY_INVALID")
    source_selector = bundle.get("sourceSelector")
    if not isinstance(source_selector, str) or not source_selector.strip():
        raise ValueError("DOC14_OAK_SOURCE_SELECTOR_REQUIRED")

    concepts = bundle.get("concepts")
    relation_rows = bundle.get("relations", [])
    if not isinstance(concepts, list) or not isinstance(relation_rows, list):
        raise ValueError("DOC14_OAK_CANDIDATE_LISTS_INVALID")
    # The pipeline merges up to four bounded 16-term sidecar responses per chunk.
    if len(matches) > 64 or len(concepts) > 256 or len(relation_rows) > 4_096:
        raise ValueError("DOC14_OAK_RESPONSE_LIMIT_EXCEEDED")
    concepts_by_id: dict[str, Mapping[str, Any]] = {}
    for candidate in concepts:
        if not isinstance(candidate, Mapping):
            raise ValueError("DOC14_OAK_CONCEPT_CANDIDATE_INVALID")
        external_id = candidate.get("externalId")
        if (not isinstance(external_id, str) or not external_id.strip()
                or candidate.get("status") != "PROPOSED"
                or candidate.get("canonicalAuthority") is not False
                or candidate.get("ontologyRevision") != ontology_revision
                or candidate.get("producerRevision") != producer_revision):
            raise ValueError("DOC14_OAK_CONCEPT_CANDIDATE_INVALID")
        if external_id in concepts_by_id:
            raise ValueError("DOC14_OAK_CONCEPT_ID_DUPLICATE")
        concepts_by_id[external_id] = candidate

    normalized_matches: dict[str, set[str]] = {}
    for match in matches:
        if not isinstance(match, Mapping):
            raise ValueError("DOC14_OAK_MATCH_INVALID")
        search_text = match.get("searchText")
        external_ids = match.get("externalIds")
        if not isinstance(search_text, str) or not isinstance(external_ids, list):
            raise ValueError("DOC14_OAK_MATCH_INVALID")
        selected = {item for item in external_ids if isinstance(item, str) and item in concepts_by_id}
        if len(selected) != len(external_ids):
            raise ValueError("DOC14_OAK_MATCH_WITHOUT_CONCEPT_CANDIDATE")
        key = _normalize_label(search_text)
        normalized_matches.setdefault(key, set()).update(selected)

    source_selector_checksum = _sha256(source_selector.encode("utf-8"))
    chunk_text = chunk["text"]
    chunk_start = chunk["start_byte"]

    def document_byte_span(start: int, end: int) -> dict[str, int]:
        return {
            "startByte": chunk_start + len(chunk_text[:start].encode("utf-8")),
            "endByte": chunk_start + len(chunk_text[:end].encode("utf-8")),
        }

    mapping_rows: list[dict[str, Any]] = []
    for field, role in (("subject_candidates", "subject"), ("object_candidates", "object")):
        mentions = relation.get(field, [])
        if not isinstance(mentions, (list, tuple)) or len(mentions) > 32:
            raise ValueError("DOC14_RELATION_MENTION_LIMIT_INVALID")
        for mention in mentions:
            label = mention.get("text") if isinstance(mention, Mapping) else None
            if not isinstance(label, str) or not label.strip():
                raise ValueError("DOC14_RELATION_MENTION_LABEL_INVALID")
            ids = sorted(normalized_matches.get(_normalize_label(label), set()))
            suggested = []
            for external_id in ids:
                concept = concepts_by_id[external_id]
                evidence_refs = concept.get("evidenceRefs", [])
                if not isinstance(evidence_refs, (list, tuple)):
                    raise ValueError("DOC14_OAK_CANDIDATE_EVIDENCE_INVALID")
                suggested.append({
                    "externalId": external_id,
                    "label": str(concept.get("label") or external_id),
                    "evidenceRefs": [
                        str(ref).replace(source_selector, source_selector_checksum)
                        for ref in evidence_refs if isinstance(ref, str)
                    ],
                    "mappingStatus": "SUGGESTED_REQUIRES_REVIEW",
                })
            mapping_rows.append({
                "role": role,
                "sourceText": label,
                "evidenceSpan": document_byte_span(mention["start_char"], mention["end_char"]),
                "candidates": suggested,
                "status": _review_status(suggested),
            })

    # Surface existing OAK relations only when both endpoints are among the bounded
    # concept candidates. Do not translate external predicates into Atlas predicates.
    selected_ids = {candidate["externalId"] for row in mapping_rows for candidate in row["candidates"]}
    related_relations: list[dict[str, str]] = []
    for item in relation_rows:
        if not isinstance(item, Mapping):
            raise ValueError("DOC14_OAK_RELATION_CANDIDATE_INVALID")
        subject = item.get("subjectExternalId")
        predicate = item.get("predicateExternalId")
        obj = item.get("objectExternalId")
        if not all(isinstance(value, str) and value.strip() for value in (subject, predicate, obj)):
            raise ValueError("DOC14_OAK_RELATION_CANDIDATE_INVALID")
        if (item.get("status") != "PROPOSED"
                or item.get("canonicalAuthority") is not False
                or item.get("ontologyRevision") != ontology_revision
                or item.get("producerRevision") != producer_revision):
            raise ValueError("DOC14_OAK_RELATION_AUTHORITY_OR_REVISION_INVALID")
        if subject in selected_ids and obj in selected_ids:
            related_relations.append({
                "subjectExternalId": subject,
                "predicateExternalId": predicate,
                "objectExternalId": obj,
            })

    binding = relation["evidence_binding"]
    body = {
        "schema": "atlas.doc14-relation-oak-review.v1",
        "source": {
            "sourceId": source_readback["source_id"],
            "sourceUrl": source_readback["source_url"],
            "sourceRevision": source_readback["source_revision"],
            "documentSha256": span["sourceSha256"],
            "chunkId": chunk["chunk_id"],
            "chunkEvidenceRevision": chunk["chunk_evidence_revision"],
            "evidenceSpan": {"startByte": span["startByte"], "endByte": span["endByte"]},
            "evidenceText": binding["evidence_text"],
            "evidenceChecksum": binding["evidence_checksum"],
        },
        "relationProposal": {
            "predicateText": relation["predicate"],
            "predicateSpan": document_byte_span(*relation["predicate_span_chars"]),
            "extractorVersion": relation["extractor_version"],
            "status": "PROPOSED",
            "ontologyIds": [],
        },
        "oak": {
            "sourceSelectorChecksum": source_selector_checksum,
            "ontologyRevision": ontology_revision,
            "producerRevision": producer_revision,
        },
        "participantMappings": mapping_rows,
        "existingOntologyRelations": related_relations,
        "reviewRequired": True,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    return {**body, "reviewChecksum": _sha256(_canonical_json(body))}
