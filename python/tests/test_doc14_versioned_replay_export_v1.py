"""Tests for versioned query-candidate replay export and fail-closed GAN verification."""
from __future__ import annotations

import copy
import hashlib

import pytest

from atlas_graph_runtime.doc14_versioned_replay_export_v1 import (
    build_versioned_replay_bundle_v1,
    replay_and_verify_bundle_v1,
)


def _sample_bundle() -> tuple[dict, dict[str, bytes], dict[str, str], dict[str, str], dict[str, tuple[int, int]]]:
    c0_bytes = b"Read-only audit of concept_records table."
    c1_bytes = b"const pool = createPool();"
    src = c0_bytes + b"\n" + c1_bytes
    c0_sha = "sha256:" + hashlib.sha256(c0_bytes).hexdigest()
    c1_sha = "sha256:" + hashlib.sha256(c1_bytes).hexdigest()
    sref = "scripts/atlas/audit-concept-evidence-spine.mjs"
    c1_start = len(c0_bytes) + 1
    c1_end = c1_start + len(c1_bytes)
    bundle = build_versioned_replay_bundle_v1(
        query_id="doc14-draft-001",
        query_text="Which PostgreSQL table does the concept evidence spine audit inspect?",
        feature_definitions=["authority_norm", "domain_fit", "ast_signal", "execution_utility"],
        candidates=[
            {"chunkId": "chunk:0", "sourceRef": sref, "sourceRevision": "sha256:rev1", "chunkSha256": c0_sha},
            {"chunkId": "chunk:1", "sourceRef": sref, "sourceRevision": "sha256:rev1", "chunkSha256": c1_sha},
        ],
        feature_matrix=[[0.9, 0.8, 1.0, None], [0.2, 0.3, 0.5, None]],
        presence_mask=[[1, 1, 1, 0], [1, 1, 1, 0]],
        tuple_provenance=[
            {
                "subject": "audit-concept-evidence-spine.mjs",
                "predicate": "INSPECTS_TABLE",
                "object": "concept_records",
                "sourceRef": sref,
                "sourceRevision": "sha256:rev1",
                "startByte": 0,
                "endByte": len(c0_bytes),
                "quoteSha256": c0_sha,
            }
        ],
        relevance_grades=[
            {"chunkId": "chunk:0", "reviewedGrade": 3, "reviewerRef": "human-op"},
            {"chunkId": "chunk:1", "reviewedGrade": 0, "reviewerRef": "human-op"},
        ],
        quote_checks=[
            {"sourceRef": sref, "startByte": 0, "endByte": len(c0_bytes), "quote": c0_bytes.decode("utf-8"), "quoteSha256": c0_sha}
        ],
    )
    spans = {"chunk:0": (0, len(c0_bytes)), "chunk:1": (c1_start, c1_end)}
    return bundle, {sref: src}, {sref: "sha256:rev1"}, {"chunk:0": c0_sha, "chunk:1": c1_sha}, spans


def test_replay_verifies_valid_bundle() -> None:
    bundle, sources, revs, hashes, spans = _sample_bundle()
    res = replay_and_verify_bundle_v1(
        bundle,
        expected_source_revisions=revs,
        expected_chunk_hashes=hashes,
        source_bytes_by_ref=sources,
        expected_chunk_spans=spans,
    )
    assert res["status"] == "REPLAY_VERIFIED"
    assert res["candidateCount"] == 2


def test_replay_rejects_missing_evidence_stale_substitution_invalid_mask_duplicate_grade_and_quote() -> None:
    bundle, sources, revs, hashes, spans = _sample_bundle()

    with pytest.raises(ValueError, match="REPLAY_MISSING_AUTHORITATIVE_EVIDENCE"):
        replay_and_verify_bundle_v1(
            bundle,
            expected_source_revisions={},
            expected_chunk_hashes=hashes,
            source_bytes_by_ref=sources,
            expected_chunk_spans=spans,
        )

    with pytest.raises(ValueError, match="REPLAY_STALE_SOURCE_REVISION"):
        replay_and_verify_bundle_v1(
            bundle,
            expected_source_revisions={"scripts/atlas/audit-concept-evidence-spine.mjs": "sha256:rev2"},
            expected_chunk_hashes=hashes,
            source_bytes_by_ref=sources,
            expected_chunk_spans=spans,
        )

    with pytest.raises(ValueError, match="REPLAY_ROW_SUBSTITUTION_DETECTED"):
        replay_and_verify_bundle_v1(
            bundle,
            expected_source_revisions=revs,
            expected_chunk_hashes={**hashes, "chunk:0": "sha256:DIFFERENT"},
            source_bytes_by_ref=sources,
            expected_chunk_spans=spans,
        )

    bad_mask = copy.deepcopy(bundle)
    bad_mask["presenceMask"][0][3] = 1
    bad_mask_sealed = build_versioned_replay_bundle_v1(
        query_id=bad_mask["queryId"],
        query_text=bad_mask["queryText"],
        feature_definitions=bad_mask["featureDefinitions"],
        candidates=bad_mask["ordinalMap"],
        feature_matrix=bad_mask["featureMatrix"],
        presence_mask=bad_mask["presenceMask"],
        tuple_provenance=bad_mask["tupleProvenance"],
        relevance_grades=bad_mask["relevanceGrades"],
        quote_checks=bad_mask["quoteChecks"],
    )
    with pytest.raises(ValueError, match="REPLAY_INVALID_MASK"):
        replay_and_verify_bundle_v1(
            bad_mask_sealed,
            expected_source_revisions=revs,
            expected_chunk_hashes=hashes,
            source_bytes_by_ref=sources,
            expected_chunk_spans=spans,
        )

    dup_grade = copy.deepcopy(bundle)
    dup_grade["relevanceGrades"][1]["chunkId"] = "chunk:0"
    dup_grade_sealed = build_versioned_replay_bundle_v1(
        query_id=dup_grade["queryId"],
        query_text=dup_grade["queryText"],
        feature_definitions=dup_grade["featureDefinitions"],
        candidates=dup_grade["ordinalMap"],
        feature_matrix=dup_grade["featureMatrix"],
        presence_mask=dup_grade["presenceMask"],
        tuple_provenance=dup_grade["tupleProvenance"],
        relevance_grades=dup_grade["relevanceGrades"],
        quote_checks=dup_grade["quoteChecks"],
    )
    with pytest.raises(ValueError, match="REPLAY_DUPLICATE_OR_MISSING_GRADE"):
        replay_and_verify_bundle_v1(
            dup_grade_sealed,
            expected_source_revisions=revs,
            expected_chunk_hashes=hashes,
            source_bytes_by_ref=sources,
            expected_chunk_spans=spans,
        )

    with pytest.raises(ValueError, match="REPLAY_CHUNK_BYTES_MISMATCH|REPLAY_QUOTE_MISMATCH"):
        replay_and_verify_bundle_v1(
            bundle,
            expected_source_revisions=revs,
            expected_chunk_hashes=hashes,
            source_bytes_by_ref={"scripts/atlas/audit-concept-evidence-spine.mjs": b"Tampered bytes! Wait, long enough for bounds check yes indeed."},
            expected_chunk_spans=spans,
        )
