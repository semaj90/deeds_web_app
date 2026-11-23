from __future__ import annotations

import hashlib
import json

import pytest

from python.atlas_doc14_span_integrity_v1 import (
    publish_validated_relation_candidates_jsonl_v1,
    validate_relation_candidate_batch_v1,
    validate_stanza_relation_candidate_v1,
)


def _fixture():
    text = "Préface 🧭. API Foo requires CUDA 13.2."
    source_bytes = text.encode("utf-8")
    document_sha = hashlib.sha256(source_bytes).hexdigest()
    start_char = text.index("API Foo")
    end_char = text.rindex(".")
    evidence_text = text[start_char:end_char]
    start_byte = len(text[:start_char].encode("utf-8"))
    end_byte = start_byte + len(evidence_text.encode("utf-8"))
    predicate = "requires"
    predicate_start = text.index(predicate, start_char, end_char)
    participants = [
        {"role": "subject", "text": "Foo", "start_char": text.index("Foo", start_char, end_char),
         "end_char": text.index("Foo", start_char, end_char) + len("Foo")},
        {"role": "object", "text": "CUDA 13.2", "start_char": text.index("CUDA 13.2", start_char, end_char),
         "end_char": text.index("CUDA 13.2", start_char, end_char) + len("CUDA 13.2")},
    ]
    chunk = {
        "chunk_id": "doc:fixture:chunk-1",
        "source_id": "official-doc:fixture",
        "source_revision": "sha256:" + "a" * 64,
        "source_url": "https://docs.example.test/api",
        "text": text,
        "start_byte": 0,
        "end_byte": len(source_bytes),
        "document_checksum": document_sha,
        "chunk_evidence_revision": "chunk-rev-1",
    }
    candidate = {
        "status": "PROPOSED",
        "canonical_authority": False,
        "extractor_version": "stanza-fixture-extractor-v1",
        "predicate": predicate,
        "predicate_span_chars": [predicate_start, predicate_start + len(predicate)],
        "evidence_span_chars": [start_char, end_char],
        "participants": participants,
        "subject_candidates": [item for item in participants if item["role"] == "subject"],
        "object_candidates": [item for item in participants if item["role"] == "object"],
        "evidence_binding": {
            "source_ref": chunk["source_id"],
            "source_url": chunk["source_url"],
            "source_revision": chunk["source_revision"],
            "document_checksum": document_sha,
            "chunk_id": chunk["chunk_id"],
            "chunk_evidence_revision": chunk["chunk_evidence_revision"],
            "coordinate_space": "NORMALIZED_DOCUMENT_UTF8_BYTES",
            "start_byte": start_byte,
            "end_byte": end_byte,
            "evidence_text": evidence_text,
            "evidence_checksum": hashlib.sha256(source_bytes[start_byte:end_byte]).hexdigest(),
        },
    }
    source = {
        "source_id": chunk["source_id"],
        "source_revision": chunk["source_revision"],
        "source_url": chunk["source_url"],
        "content_bytes": source_bytes,
        "content_sha256": document_sha,
    }
    row = {
        "source_id": chunk["source_id"],
        "source_revision": chunk["source_revision"],
        "chunk_id": chunk["chunk_id"],
        "chunk_checksum": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "span_validation": "SPAN_READBACK_VERIFIED",
        "candidate": candidate,
    }
    return source_bytes, source, chunk, candidate, row


def test_unicode_relation_spans_are_verified_against_capture_bytes():
    source_bytes, source, chunk, candidate, _row = _fixture()

    result = validate_stanza_relation_candidate_v1(
        relation=candidate, source_readback=source, chunk=chunk,
    )

    binding = candidate["evidence_binding"]
    assert result["status"] == "SPAN_READBACK_VERIFIED"
    assert source_bytes[binding["start_byte"]:binding["end_byte"]].decode("utf-8") == binding["evidence_text"]
    assert result["startByte"] == binding["start_byte"]
    assert result["endByte"] == binding["end_byte"]


def test_capture_checksum_mismatch_is_rejected():
    _source_bytes, source, chunk, candidate, _row = _fixture()
    source["content_bytes"] += b" changed"

    with pytest.raises(ValueError, match="NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH"):
        validate_stanza_relation_candidate_v1(
            relation=candidate, source_readback=source, chunk=chunk,
        )


@pytest.mark.parametrize(
    ("field", "value", "error"),
    [
        ("status", "GRAPH_ADMITTED", "RELATION_PROPOSAL_STATUS_INVALID"),
        ("canonical_authority", True, "RELATION_PROPOSAL_AUTHORITY_INVALID"),
        ("extractor_version", "", "RELATION_EXTRACTOR_VERSION_REQUIRED"),
        ("subject_candidates", [], "SUBJECT_CANDIDATES_PARTICIPANT_MISMATCH"),
    ],
)
def test_candidate_cannot_self_promote_or_omit_typed_proposal_fields(field, value, error):
    _source_bytes, source, chunk, candidate, _row = _fixture()
    candidate[field] = value

    with pytest.raises(ValueError, match=error):
        validate_stanza_relation_candidate_v1(
            relation=candidate, source_readback=source, chunk=chunk,
        )


def test_bad_utf8_byte_span_cannot_replace_previous_jsonl(tmp_path):
    _source_bytes, source, chunk, _candidate, row = _fixture()
    row["candidate"]["evidence_binding"]["end_byte"] += 1
    output = tmp_path / "relation-candidates.jsonl"
    output.write_bytes(b"previous-valid-generation\n")

    with pytest.raises(ValueError, match="DOC14_RELATION_CANDIDATE_BATCH_REJECTED"):
        publish_validated_relation_candidates_jsonl_v1(
            path=output,
            rows=[row],
            sources_by_identity={(source["source_id"], source["source_revision"], source["source_url"]): source},
            chunks_by_id={chunk["chunk_id"]: chunk},
        )

    assert output.read_bytes() == b"previous-valid-generation\n"


def test_missing_chunk_boundary_rejects_the_batch():
    _source_bytes, source, chunk, _candidate, row = _fixture()
    chunk["start_byte"] = 1

    with pytest.raises(ValueError, match="DOC14_RELATION_CANDIDATE_BATCH_REJECTED"):
        validate_relation_candidate_batch_v1(
            rows=[row],
            sources_by_identity={(source["source_id"], source["source_revision"], source["source_url"]): source},
            chunks_by_id={chunk["chunk_id"]: chunk},
        )


def test_valid_batch_publishes_atomically_and_reads_back_jsonl(tmp_path):
    _source_bytes, source, chunk, _candidate, row = _fixture()
    output = tmp_path / "relation-candidates.jsonl"

    receipt = publish_validated_relation_candidates_jsonl_v1(
        path=output,
        rows=[row],
        sources_by_identity={(source["source_id"], source["source_revision"], source["source_url"]): source},
        chunks_by_id={chunk["chunk_id"]: chunk},
    )

    stored = json.loads(output.read_text(encoding="utf-8"))
    assert receipt["validatedCount"] == 1
    assert receipt["canonicalAuthority"] is False
    assert receipt["writesPerformed"] is True
    assert stored["candidate"]["evidence_binding"]["source_revision"] == source["source_revision"]
