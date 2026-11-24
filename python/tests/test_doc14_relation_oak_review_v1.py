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
    raw = source["content_bytes"]
    for mapping in result["participantMappings"]:
        span = mapping["evidenceSpan"]
        assert raw[span["startByte"]:span["endByte"]].decode("utf-8") == mapping["sourceText"]
    predicate_span = result["relationProposal"]["predicateSpan"]
    assert raw[predicate_span["startByte"]:predicate_span["endByte"]].decode("utf-8") == "requires"
    assert result["relationProposal"]["extractorVersion"] == relation["extractor_version"]
    assert result["reviewRequired"] is True
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False
    assert "/private/" not in str(result)
    assert len(result["reviewChecksum"]) == 71


def test_oak_sssom_mapping_candidates_are_surfaced_only_as_review_suggestions():
    relation, source, chunk, oak = _inputs()
    oak["candidateBundle"]["mappingProviderStatus"] = "AVAILABLE"
    oak["candidateBundle"]["mappingCandidates"] = [{
        "schema": "atlas.oaklib-mapping-candidate.v1",
        "candidateId": "oaklib-mapping-candidate:fixture",
        "subjectId": "api:Foo",
        "predicateId": "skos:exactMatch",
        "objectId": "EXT:Foo",
        "mappingJustification": "semapv:ManualMappingCuration",
        "subjectSource": "api",
        "objectSource": "EXT",
        "subjectSourceVersion": "1",
        "objectSourceVersion": "2",
        "confidence": 0.9,
        "ontologyRevision": oak["ontologyRevision"],
        "producerRevision": oak["producerRevision"],
        "evidenceRefs": ["oaklib:sqlite:/private/parent-atlas.obo:sssom:api:Foo|skos:exactMatch|EXT:Foo"],
        "status": "PROPOSED",
        "canonicalAuthority": False,
    }]

    result = build_doc14_relation_oak_review_v1(
        relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
    )

    assert result["oakMappingProviderStatus"] == "AVAILABLE"
    assert result["existingOAKMappings"] == [{
        "candidateId": "oaklib-mapping-candidate:fixture",
        "subjectId": "api:Foo",
        "predicateId": "skos:exactMatch",
        "objectId": "EXT:Foo",
        "mappingJustification": "semapv:ManualMappingCuration",
        "subjectSource": "api",
        "objectSource": "EXT",
        "subjectSourceVersion": "1",
        "objectSourceVersion": "2",
        "confidence": 0.9,
        "evidenceRefs": [f"oaklib:sha256:{hashlib.sha256(b'sqlite:/private/parent-atlas.obo').hexdigest()}:sssom:api:Foo|skos:exactMatch|EXT:Foo"],
        "status": "SUGGESTED_REQUIRES_REVIEW",
        "canonicalAuthority": False,
    }]
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_oak_sssom_mapping_candidates_cannot_cross_ontology_revision():
    relation, source, chunk, oak = _inputs()
    oak["candidateBundle"]["mappingCandidates"] = [{
        "schema": "atlas.oaklib-mapping-candidate.v1",
        "candidateId": "mapping:stale",
        "subjectId": "api:Foo",
        "predicateId": "skos:exactMatch",
        "objectId": "EXT:Foo",
        "ontologyRevision": "sha256:stale",
        "producerRevision": oak["producerRevision"],
        "status": "PROPOSED",
        "canonicalAuthority": False,
    }]
    with pytest.raises(ValueError, match="DOC14_OAK_MAPPING_AUTHORITY_OR_REVISION_INVALID"):
        build_doc14_relation_oak_review_v1(
            relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
        )


def test_oak_sssom_mapping_confidence_must_be_finite_and_bounded():
    relation, source, chunk, oak = _inputs()
    oak["candidateBundle"]["mappingCandidates"] = [{
        "schema": "atlas.oaklib-mapping-candidate.v1",
        "candidateId": "mapping:bad-confidence",
        "subjectId": "api:Foo",
        "predicateId": "skos:exactMatch",
        "objectId": "EXT:Foo",
        "confidence": float("nan"),
        "ontologyRevision": oak["ontologyRevision"],
        "producerRevision": oak["producerRevision"],
        "status": "PROPOSED",
        "canonicalAuthority": False,
    }]
    with pytest.raises(ValueError, match="DOC14_OAK_MAPPING_CONFIDENCE_INVALID"):
        build_doc14_relation_oak_review_v1(
            relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
        )


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


def test_review_accepts_the_bounded_multi_batch_label_response():
    relation, source, chunk, oak = _inputs()
    oak["matches"].extend(
        {"searchText": f"Other mention {index}", "externalIds": []} for index in range(62)
    )
    result = build_doc14_relation_oak_review_v1(
        relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
    )
    assert len(result["participantMappings"]) == 2
    oak["matches"].append({"searchText": "One term too many", "externalIds": []})
    with pytest.raises(ValueError, match="DOC14_OAK_RESPONSE_LIMIT_EXCEEDED"):
        build_doc14_relation_oak_review_v1(
            relation=relation, source_readback=source, chunk=chunk, oak_response=oak,
        )


def test_real_oak_fixture_binds_subject_object_and_relationship(monkeypatch):
    pytest.importorskip("oaklib")
    import miniforge_nlp_sidecar_v2 as sidecar

    fixture = Path(__file__).parent / "fixtures" / "doc14-software-review-fixture.obo"
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_ROOT", str(fixture.parent))
    monkeypatch.setenv("ATLAS_OAKLIB_ONTOLOGY_FILE", fixture.name)
    relation, source, chunk, _ = _inputs()
    labels = sidecar.oaklib_label_search(sidecar.OaklibLabelSearchRequestV1(
        terms=["Foo", "CUDA 13.2"],
    )).model_dump(mode="json", by_alias=True)
    edges = sidecar.oaklib_candidates(sidecar.OaklibCandidateRequestV1(
        external_ids=["ATLASFIX:0001", "ATLASFIX:0002"],
    )).model_dump(mode="json", by_alias=True)
    labels["candidateBundle"]["relations"] = edges["candidates"]["relations"]
    review = build_doc14_relation_oak_review_v1(
        relation=relation, source_readback=source, chunk=chunk, oak_response=labels,
    )
    assert review["oak"]["ontologyRevision"] == "sha256:" + hashlib.sha256(fixture.read_bytes()).hexdigest()
    assert [row["candidates"][0]["externalId"] for row in review["participantMappings"]] == [
        "ATLASFIX:0001", "ATLASFIX:0002",
    ]
    assert review["existingOntologyRelations"] == [{
        "subjectExternalId": "ATLASFIX:0001",
        "predicateExternalId": "requires_version",
        "objectExternalId": "ATLASFIX:0002",
    }]
    assert review["relationProposal"]["ontologyIds"] == []
    assert review["canonicalAuthority"] is False


@pytest.mark.parametrize("mutation", ["stale-source", "authority", "unbound-id", "revision", "duplicate-id"])
def test_invalid_source_or_oak_candidate_is_rejected(mutation):
    relation, source, chunk, oak = _inputs()
    if mutation == "stale-source":
        source["content_bytes"] += b" changed"
    elif mutation == "authority":
        oak["canonicalAuthority"] = True
    elif mutation == "unbound-id":
        oak["matches"][0]["externalIds"] = ["missing:concept"]
    elif mutation == "duplicate-id":
        oak["candidateBundle"]["concepts"].append(dict(oak["candidateBundle"]["concepts"][0]))
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


def test_hypergraph_bridge_revalidates_participants_even_with_verified_status():
    from python.atlas_external_doc_hypergraph import build_external_doc_relation_proposal_v1

    relation, source, chunk, _ = _inputs()
    relation["tuple_id"] = "fixture-tuple"
    row = {
        "schema": "atlas.external-doc-relation-candidate.v1",
        "span_validation": "SPAN_READBACK_VERIFIED",
        "admission_state": "PROPOSAL_ONLY",
        "canonical_authority": False,
        "source_id": chunk["source_id"],
        "source_revision": chunk["source_revision"],
        "chunk_id": chunk["chunk_id"],
        "chunk_evidence_revision": chunk["chunk_evidence_revision"],
        "chunk_checksum": hashlib.sha256(chunk["text"].encode("utf-8")).hexdigest(),
        "candidate": relation,
    }
    kwargs = {"candidate_row": row, "chunk": chunk, "source_readback": source, "workspace_revision": "fixture"}
    assert build_external_doc_relation_proposal_v1(**kwargs).admission_state == "PROPOSAL_ONLY"
    relation["participants"][0]["text"] = "Bar"
    with pytest.raises(ValueError, match="PARTICIPANT_TEXT_SPAN_MISMATCH"):
        build_external_doc_relation_proposal_v1(**kwargs)


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
