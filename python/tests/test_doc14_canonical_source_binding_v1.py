import hashlib

import pytest

from atlas_graph_runtime.doc14_canonical_source_binding_v1 import (
    build_doc14_canonical_source_binding_v1,
)


def _fixture():
    raw = b"<html>original capture</html>"
    text = "CUDA guide: NVRTC can be used to compile CUDA C++ device code to PTX at runtime."
    source = text.encode("utf-8")
    quote = "NVRTC can be used to compile CUDA C++ device code to PTX at runtime."
    start = source.index(quote.encode())
    end = start + len(quote.encode())
    content_sha = hashlib.sha256(source).hexdigest()
    raw_sha = hashlib.sha256(raw).hexdigest()
    evidence_sha = hashlib.sha256(source[start:end]).hexdigest()
    chunk_sha = hashlib.sha256(source).hexdigest()
    proposal_sha = hashlib.sha256(b"canonical proposal json").hexdigest()
    ontology_revision = "sha256:" + "c" * 64
    proposal = {
        "schema": "atlas.doc14-nvidia-cuda-ptx-relation-proposal.v1",
        "capture": {
            "sourceRef": "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html",
            "normalizedTextSha256": content_sha,
            "rawHtmlSha256": raw_sha,
        },
        "proposalVerification": {"proposal": {
            "chunkId": "external-capture:fixture",
            "chunkSha256": evidence_sha,
            "contentSha256": raw_sha,
            "sourceRef": "https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/cuda-platform.html",
            "sourceRevision": "sha256:" + content_sha,
            "predicate": "COMPILES_TO",
            "subject": "CUDA C++",
            "object": "PTX",
            "startByte": start,
            "endByte": end,
            "exactText": quote,
            "status": "PROPOSED",
        }},
        "ontologyReview": {"ontologyRevision": ontology_revision},
        "existingOntologyRelations": {"relations": [{
            "subjectExternalId": "ATLASLANG:cuda_cpp",
            "predicateExternalId": "compiles_to",
            "objectExternalId": "ATLASISA:ptx",
            "ontologyRevision": ontology_revision,
        }]},
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    review = {
        "schema": "atlas.doc14-relation-human-review.v1",
        "reviewId": "review-fixture",
        "decision": "APPROVED_FOR_REVIEW_WORKFLOW",
        "authority": {"admissionAuthorized": False},
        "proposal": {
            "sha256": proposal_sha,
            "sourceRef": proposal["capture"]["sourceRef"],
            "sourceRevision": "sha256:" + content_sha,
            "sourceContentSha256": raw_sha,
            "startByte": start,
            "endByte": end,
            "exactText": quote,
            "subjectId": "ATLASLANG:cuda_cpp",
            "predicateId": "compiles_to",
            "objectId": "ATLASISA:ptx",
            "ontologyRevision": ontology_revision,
        },
    }
    page = {
        "id": "page-1",
        "url": proposal["capture"]["sourceRef"],
        "content_hash": content_sha,
        "evidence_revision": "sha256:" + "a" * 64,
    }
    chunk = {
        "chunk_id": "doc:page-1:8",
        "ordinal": 8,
        "start_byte": 0,
        "end_byte": len(source),
        "chunk_checksum": chunk_sha,
        "evidence_revision": "sha256:" + "b" * 64,
        "text": text,
    }
    return proposal, proposal_sha, review, page, chunk, source


def test_binding_joins_approved_review_to_exact_canonical_page_and_chunk():
    proposal, proposal_sha, review, page, chunk, source = _fixture()
    result = build_doc14_canonical_source_binding_v1(
        proposal_envelope=proposal,
        proposal_file_sha256=proposal_sha,
        review_receipt=review,
        page=page,
        chunk=chunk,
        normalized_source_bytes=source,
        graph_state={
            "nonNullGraphRevisionCount": 0,
            "ontologyTupleRows": 0,
            "ontologyRelationRows": 0,
        },
    )
    assert result["status"] == "CANONICAL_SOURCE_BINDING_VERIFIED"
    assert result["evidence"]["chunkStartByte"] == result["evidence"]["startByte"]
    assert result["source"]["pageEvidenceRevision"] != result["source"]["contentSha256"]
    assert result["chunk"]["chunkEvidenceRevision"] != result["source"]["contentSha256"]
    assert result["review"]["admissionAuthorized"] is False
    assert result["canonicalAuthority"] is False
    assert result["writesPerformed"] is False


def test_binding_rejects_changed_canonical_chunk_bytes():
    proposal, proposal_sha, review, page, chunk, source = _fixture()
    chunk["text"] = chunk["text"] + " altered"
    with pytest.raises(ValueError, match="DOC14_CANONICAL_CHUNK_SOURCE_BYTES_MISMATCH"):
        build_doc14_canonical_source_binding_v1(
            proposal_envelope=proposal,
            proposal_file_sha256=proposal_sha,
            review_receipt=review,
            page=page,
            chunk=chunk,
            normalized_source_bytes=source,
            graph_state={
                "nonNullGraphRevisionCount": 0,
                "ontologyTupleRows": 0,
                "ontologyRelationRows": 0,
            },
        )


def test_binding_rejects_admission_authority_smuggled_into_review_receipt():
    proposal, proposal_sha, review, page, chunk, source = _fixture()
    review["authority"]["admissionAuthorized"] = True
    with pytest.raises(ValueError, match="DOC14_REVIEW_AUTHORITY_MUST_NOT_AUTHORIZE_ADMISSION"):
        build_doc14_canonical_source_binding_v1(
            proposal_envelope=proposal,
            proposal_file_sha256=proposal_sha,
            review_receipt=review,
            page=page,
            chunk=chunk,
            normalized_source_bytes=source,
            graph_state={
                "nonNullGraphRevisionCount": 0,
                "ontologyTupleRows": 0,
                "ontologyRelationRows": 0,
            },
        )
