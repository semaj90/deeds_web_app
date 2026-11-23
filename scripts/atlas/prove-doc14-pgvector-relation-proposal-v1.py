"""Rebuild one pgvector review proposal from pinned capture and PostgreSQL readback."""

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT), str(ROOT / "python")]

from atlas_external_docs import _normalize_ws  # noqa: E402
from python.atlas_external_doc_hypergraph import build_external_doc_relation_proposal_v1  # noqa: E402

CHUNK_ID = "doc:pgvector:fe883c75f323441d:24"
CAPTURE = "docs/.okf/pinned/pgvector/raw/github.com-pgvector-pgvector.md"
ENVELOPES = "docs/.okf/pinned/admission-envelopes-v1.json"
POOL = "docs/reports/doc14-official-gold-review-pool-v1.json"
SENTENCE = "Iterative scans can use strict or relaxed ordering."


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build():
    envelopes_bytes = (ROOT / ENVELOPES).read_bytes()
    pool_bytes = (ROOT / POOL).read_bytes()
    [(envelope, expected)] = [
        (envelope, row)
        for envelope in json.loads(envelopes_bytes)
        for row in envelope["chunks"]
        if row["chunkId"] == CHUNK_ID
    ]
    pool = json.loads(pool_bytes)
    observed = next(
        item["citation"] for query in pool["queries"] for item in query["candidates"]
        if item["citation"]["chunkId"] == CHUNK_ID
    )
    page = envelope["page"]
    if (observed["url"], observed["sourceRevision"], observed["chunkEvidenceRevision"],
        observed["chunkChecksum"], observed["startByte"], observed["endByte"], observed["verifiedText"]) != (
        page["url"], page["evidenceRevision"], expected["evidenceRevision"],
        expected["chunkChecksum"], expected["startByte"], expected["endByte"], expected["text"]
    ):
        raise ValueError("DOC14_PG_READBACK_ENVELOPE_MISMATCH")
    raw = (ROOT / CAPTURE).read_bytes()
    document = _normalize_ws(raw.decode("utf-8")).encode("utf-8")
    text = expected["text"]
    if text.count(SENTENCE) != 1:
        raise ValueError("DOC14_PROPOSAL_SENTENCE_NOT_UNIQUE")
    start = text.index(SENTENCE)
    end = start + len(SENTENCE)

    def chars(value):
        offset = text.index(value, start, end)
        return offset, offset + len(value)

    participants = [
        {"role": role, "text": label, "start_char": chars(label)[0], "end_char": chars(label)[1]}
        for role, label in (("subject", "Iterative scans"), ("object", "strict or relaxed ordering"))
    ]
    source = {
        "source_id": envelope["sourceId"], "source_revision": page["evidenceRevision"],
        "source_url": page["url"], "content_bytes": document, "content_sha256": page["contentHash"],
    }
    chunk = {
        "source_id": source["source_id"], "source_revision": source["source_revision"],
        "source_url": source["source_url"], "document_checksum": source["content_sha256"],
        "chunk_id": CHUNK_ID, "chunk_evidence_revision": expected["evidenceRevision"],
        "text": text, "start_byte": expected["startByte"], "end_byte": expected["endByte"],
    }
    evidence_start = chunk["start_byte"] + len(text[:start].encode("utf-8"))
    evidence_end = evidence_start + len(SENTENCE.encode("utf-8"))
    relation = {
        "tuple_id": f"{CHUNK_ID}:manual-use-v1", "predicate": "use",
        "predicate_span_chars": chars("use"), "evidence_span_chars": (start, end),
        "participants": participants, "subject_candidates": participants[:1], "object_candidates": participants[1:],
        "extractor_version": "manual-doc14-review-draft.v1",
        "producer_revision": "atlas.doc14-pgvector-relation-proposal.v1",
        "status": "PROPOSED", "canonical_authority": False,
        "evidence_binding": {
            "source_ref": chunk["source_id"], "source_url": chunk["source_url"],
            "source_revision": chunk["source_revision"], "document_checksum": chunk["document_checksum"],
            "chunk_id": CHUNK_ID, "chunk_evidence_revision": chunk["chunk_evidence_revision"],
            "coordinate_space": "NORMALIZED_DOCUMENT_UTF8_BYTES",
            "start_byte": evidence_start, "end_byte": evidence_end,
            "evidence_text": SENTENCE, "evidence_checksum": sha(SENTENCE.encode("utf-8")),
        },
    }
    row = {
        "schema": "atlas.external-doc-relation-candidate.v1",
        "span_validation": "SPAN_READBACK_VERIFIED", "admission_state": "PROPOSAL_ONLY",
        "canonical_authority": False, "candidate": relation,
        "source_id": chunk["source_id"], "source_revision": chunk["source_revision"],
        "chunk_id": CHUNK_ID, "chunk_evidence_revision": chunk["chunk_evidence_revision"],
        "chunk_checksum": expected["chunkChecksum"],
    }
    workspace = "sha256:" + sha(envelopes_bytes)
    proposal = build_external_doc_relation_proposal_v1(
        candidate_row=row, chunk=chunk, source_readback=source, workspace_revision=workspace,
    )
    try:
        build_external_doc_relation_proposal_v1(
            candidate_row=row, chunk=chunk, workspace_revision=workspace,
            source_readback={**source, "content_bytes": document + b" "},
        )
    except ValueError as error:
        if str(error) != "NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH":
            raise
    else:
        raise RuntimeError("DOC14_MUTATED_CAPTURE_ACCEPTED")
    return {
        "schema": "atlas.doc14-pgvector-relation-review.v1",
        "status": "PENDING_HUMAN_AND_ONTOLOGY_REVIEW",
        "capture": {"sourceRef": CAPTURE, "rawSha256": sha(raw), "normalizedSha256": sha(document)},
        "snapshot": {"kind": "PINNED_DOC_ADMISSION_ENVELOPES", "sha256": workspace,
                     "postgresReviewPoolSha256": "sha256:" + sha(pool_bytes)},
        "sourceCandidate": row,
        "proposal": proposal.to_dict(),
        "adversarialReadback": "NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH",
        "reviewDecision": None, "graphRevision": None, "writesPerformed": False,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    receipt = build()
    with args.output.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(receipt, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({
        "status": receipt["status"], "chunkId": CHUNK_ID,
        "adversarialReadback": receipt["adversarialReadback"],
    }))
