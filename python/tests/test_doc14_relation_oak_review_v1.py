from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import pytest
from types import SimpleNamespace

from python.atlas_graph_runtime.doc14_relation_oak_review_v1 import build_doc14_relation_oak_review_v1

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_okf_docs_pipeline import query_oak_review_for_chunks_v1


def _inputs():
    text = "Préface 🧭. API Foo requires CUDA 13.2."
    raw = text.encode("utf-8")
    doc_sha = hashlib.sha256(raw).hexdigest()
    start_char, end_char = text.index("API Foo"), text.rindex(".")
    start_byte = len(text[:start_char].encode("utf-8"))
    end_byte = len(text[:end_char].encode("utf-8"))
    subject_text, object_text = "Foo", "CUDA 13.2"
    subject_start = text.index(subject_text, start_char, end_char)
    object_start = text.index(object_text, start_char, end_char)
    chunk = {
        "chunk_id": "doc:fixture:chunk-1",
        "source_id": "official-doc:fixture",
        "source_revision": "sha256:" + "a" * 64,
        "source_url": "https://docs.example.test/api",
        "text": text,
        "start_byte": 0,
        "end_byte": len(raw),
        "document_checksum": doc_sha,
        "chunk_evidence_revision": "chunk-rev-1",
    }
    participants = [
        {"role": "subject", "text": subject_text, "start_char": subject_start, "end_char": subject_start + len(subject_text)},
        {"role": "object", "text": object_text, "start_char": object_start, "end_char": object_start + len(object_text)},
    ]
    relation = {
        "status": "PROPOSED",
        "canonical_authority": False,
        "extractor_version": "stanza-1.15.1",
        "predicate": "requires",
        "predicate_span_chars": [text.index("requires", start_char), text.index("requires", start_char) + len("requires")],
        "evidence_span_chars": [start_char, end_char],
        "participants": participants,
        "subject_candidates": [participants[0]],
        "object_candidates": [participants[1]],
        "evidence_binding": {
            "source_ref": chunk["source_id"],
            "source_url": chunk["source_url"],
            "source_revision": chunk["source_revision"],
            "document_checksum": doc_sha,
            "chunk_id": chunk["chunk_id"],
            "chunk_evidence_revision": chunk["chunk_evidence_revision"],
            "coordinate_space": "NORMALIZED_DOCUMENT_UTF8_BYTES",
            "start_byte": start_byte,
            "end_byte": end_byte,
            "evidence_text": raw[start_byte:end_byte].decode("utf-8"),
            "evidence_checksum": hashlib.sha256(raw[start_byte:end_byte]).hexdigest(),
        },
    }
    source = {
        "source_id": chunk["source_id"],
        "source_revision": chunk["source_revision"],
        "source_url": chunk["source_url"],
        "content_bytes": raw,
        "content_sha256": doc_sha,
    }
    revision = "sha256:" + "b" * 64
    producer = "oak-sidecar/v1"
    concepts = [
        {"externalId": "api:Foo", "label": "Foo API", "evidenceRefs": ["oak-private:entity:api:Foo"], "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": revision, "producerRevision": producer},
        {"externalId": "cuda:13.2", "label": "CUDA 13.2", "evidenceRefs": ["oak-private:entity:cuda:13.2"], "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": revision, "producerRevision": producer},
    ]
    response = {
        "schema": "atlas.oaklib-label-search-response.v1",
        "status": "PROPOSAL_ONLY",
        "ontologyRevision": revision,
        "producerRevision": producer,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "matches": [
            {"searchText": "Foo", "externalIds": ["api:Foo"]},
            {"searchText": "CUDA 13.2", "externalIds": ["cuda:13.2"]},
        ],
        "candidateBundle": {
            "schema": "atlas.oaklib-candidate-bundle.v1",
            "sourceSelector": "sqlite:/private/parent-atlas.obo",
            "ontologyRevision": revision,
            "producerRevision": producer,
            "concepts": concepts,
            "relations": [{"subjectExternalId": "api:Foo", "predicateExternalId": "requiresVersion", "objectExternalId": "cuda:13.2", "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": revision, "producerRevision": producer}],
            "canonicalAuthority": False,
        },
    }
    return relation, source, chunk, response


def test_verified_mentions_join_to_oak_suggestions_without_promotion_or_path_leak():
    relation, source, chunk, oak = _inputs()
    result = build_doc14_relation_oak_review_v1(
        relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
    )

    assert result["schema"] == "atlas.doc14-relation-oak-review.v1"
    assert [row["status"] for row in result["participantMappings"]] == [
        "SINGLE_CANDIDATE_REVIEW_REQUIRED", "SINGLE_CANDIDATE_REVIEW_REQUIRED",
    ]
    assert result["participantMappings"][0]["candidates"][0]["externalId"] == "api:Foo"
    assert result["existingOntologyRelations"] == [{
        "subjectExternalId": "api:Foo",
        "predicateExternalId": "requiresVersion",
        "objectExternalId": "cuda:13.2",
    }]
    assert result["relationProposal"]["ontologyIds"] == []
    assert result["reviewRequired"] is True
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert "/private/" not in str(result)
    assert len(result["reviewChecksum"]) == 71


def test_ambiguous_and_missing_oak_matches_remain_reviewable():
    relation, source, chunk, oak = _inputs()
    oak["candidateBundle"]["concepts"].append({
        "externalId": "api:FooAlt", "label": "Foo (alternate)", "evidenceRefs": [],
        "status": "PROPOSED", "canonicalAuthority": False,
        "ontologyRevision": oak["ontologyRevision"], "producerRevision": oak["producerRevision"],
    })
    oak["matches"][0]["externalIds"].append("api:FooAlt")
    oak["matches"].append({"searchText": "CUDA", "externalIds": []})
    result = build_doc14_relation_oak_review_v1(
        relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
    )
    assert result["participantMappings"][0]["status"] == "AMBIGUOUS_REVIEW_REQUIRED"
    assert result["participantMappings"][1]["status"] == "SINGLE_CANDIDATE_REVIEW_REQUIRED"


@pytest.mark.parametrize("mutation", ["stale-source", "authority", "unbound-id", "revision"])
def test_invalid_source_or_oak_candidate_is_rejected(mutation):
    relation, source, chunk, oak = _inputs()
    if mutation == "stale-source":
        source["content_bytes"] += b" changed"
    elif mutation == "authority":
        oak["canonicalAuthority"] = True
    elif mutation == "unbound-id":
        oak["matches"][0]["externalIds"] = ["missing:concept"]
    else:
        oak["candidateBundle"]["ontologyRevision"] = "sha256:" + "c" * 64
    with pytest.raises(ValueError):
        build_doc14_relation_oak_review_v1(
            relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
        )


def test_oak_relation_cannot_self_admit_or_cross_revisions():
    relation, source, chunk, oak = _inputs()
    oak["candidateBundle"]["relations"][0]["canonicalAuthority"] = True
    with pytest.raises(ValueError, match="DOC14_OAK_RELATION_AUTHORITY_OR_REVISION_INVALID"):
        build_doc14_relation_oak_review_v1(
            relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
        )


def test_pipeline_queries_both_read_only_oak_label_and_relation_endpoints():
    revision = "sha256:" + "d" * 64
    producer = "sidecar-fixture-v2"
    concepts = [
        {"externalId": "api:Foo", "label": "Foo", "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": revision, "producerRevision": producer, "evidenceRefs": []},
        {"externalId": "cuda:13.2", "label": "CUDA 13.2", "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": revision, "producerRevision": producer, "evidenceRefs": []},
    ]
    calls = []

    def fake_request(url, *, method, body, timeout_seconds):
        calls.append((url, body, timeout_seconds))
        base_bundle = {
            "schema": "atlas.oaklib-candidate-bundle.v1",
            "sourceSelector": "local-test-ontology",
            "ontologyRevision": revision,
            "producerRevision": producer,
            "concepts": concepts,
            "relations": [],
            "canonicalAuthority": False,
        }
        if url.endswith("/search"):
            return {
                "schema": "atlas.oaklib-label-search-response.v1",
                "status": "PROPOSAL_ONLY", "ontologyRevision": revision,
                "producerRevision": producer, "canonicalAuthority": False,
                "writesPerformed": False,
                "matches": [
                    {"searchText": "Foo", "externalIds": ["api:Foo"]},
                    {"searchText": "CUDA 13.2", "externalIds": ["cuda:13.2"]},
                ],
                "candidateBundle": base_bundle,
            }
        return {
            "schema": "atlas.oaklib-candidate-response.v1",
            "status": "PROPOSAL_ONLY", "ontologyRevision": revision,
            "producerRevision": producer, "canonicalAuthority": False,
            "writesPerformed": False,
            "candidates": {**base_bundle, "relations": [{
                "subjectExternalId": "api:Foo", "predicateExternalId": "requiresVersion",
                "objectExternalId": "cuda:13.2", "status": "PROPOSED",
                "canonicalAuthority": False, "ontologyRevision": revision,
                "producerRevision": producer,
            }]},
        }

    chunk = SimpleNamespace(
        chunk_id="chunk-1",
        ontology_tuples=({
            "subject_candidates": [{"text": "Foo"}],
            "object_candidates": [{"text": "CUDA 13.2"}],
        },),
    )
    responses, failures = query_oak_review_for_chunks_v1(
        [chunk], sidecar_url="http://sidecar.test", request_json=fake_request,
    )

    assert failures == {}
    assert len(calls) == 2
    assert calls[0][0].endswith("/ontology/oaklib/search")
    assert calls[1][0].endswith("/ontology/oaklib/candidates")
    assert calls[1][1] == {"external_ids": ["api:Foo", "cuda:13.2"]}
    assert responses["chunk-1"]["candidateBundle"]["relations"][0]["predicateExternalId"] == "requiresVersion"
    assert responses["chunk-1"]["canonicalAuthority"] is False


def test_pipeline_records_unavailable_oak_as_failure_not_empty_authority():
    chunk = SimpleNamespace(
        chunk_id="chunk-offline",
        ontology_tuples=({"subject_candidates": [{"text": "Foo"}], "object_candidates": []},),
    )

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("network detail must not leak")

    responses, failures = query_oak_review_for_chunks_v1(
        [chunk], sidecar_url="http://sidecar.test", request_json=unavailable,
    )
    assert responses == {}
    assert failures == {"chunk-offline": "OAK_REQUEST_FAILED"}
