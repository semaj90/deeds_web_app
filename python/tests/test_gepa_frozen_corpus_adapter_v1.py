"""Tests for DSPy GEPA frozen-corpus alignment adapter."""
from __future__ import annotations

import hashlib
import json

import pytest

from atlas_graph_runtime.doc14_versioned_replay_export_v1 import (
    build_versioned_replay_bundle_v1,
)
from atlas_graph_runtime.gepa_frozen_corpus_adapter_v1 import (
    build_frozen_gepa_corpus_from_replays_v1,
    check_gepa_corpus_and_promotion_ready_v1,
    to_dspy_examples_v1,
)


def _mk_bundle_and_env(
    qid: str,
    src_file: str,
) -> tuple[dict, dict[str, str], dict[str, str], dict[str, bytes], dict[str, tuple[int, int]]]:
    raw = f"hello {qid} source text".encode("utf-8")
    c0_sha = "sha256:" + hashlib.sha256(raw).hexdigest()
    q_sha = "sha256:" + hashlib.sha256(raw[:5]).hexdigest()
    alt_ref = f"scripts/atlas/other_{qid}.mjs"
    alt_raw = b"distractor text"
    alt_sha = "sha256:" + hashlib.sha256(alt_raw).hexdigest()
    bundle = build_versioned_replay_bundle_v1(
        query_id=qid,
        query_text=f"Question {qid}?",
        feature_definitions=["authority_norm", "domain_fit"],
        candidates=[
            {"chunkId": f"{qid}:c0", "sourceRef": src_file, "sourceRevision": "sha256:r1", "chunkSha256": c0_sha},
            {"chunkId": f"{qid}:c1", "sourceRef": alt_ref, "sourceRevision": "sha256:r1", "chunkSha256": alt_sha},
        ],
        feature_matrix=[[0.9, 0.8], [0.1, 0.2]],
        presence_mask=[[1, 1], [1, 1]],
        tuple_provenance=[],
        relevance_grades=[
            {"chunkId": f"{qid}:c0", "reviewedGrade": 3, "reviewerRef": "human-op"},
            {"chunkId": f"{qid}:c1", "reviewedGrade": 0, "reviewerRef": "human-op"},
        ],
        quote_checks=[
            {"sourceRef": src_file, "startByte": 0, "endByte": 5, "quote": "hello", "quoteSha256": q_sha}
        ],
    )
    revs = {src_file: "sha256:r1", alt_ref: "sha256:r1"}
    hashes = {f"{qid}:c0": c0_sha, f"{qid}:c1": alt_sha}
    bytes_map = {src_file: raw, alt_ref: alt_raw}
    spans = {f"{qid}:c0": (0, len(raw)), f"{qid}:c1": (0, len(alt_raw))}
    return bundle, revs, hashes, bytes_map, spans


def test_build_frozen_gepa_corpus_full_context_and_group_split() -> None:
    bundles, revs, hashes, bytes_map, spans = [], {}, {}, {}, {}
    for qid, sref in (("q1", "scripts/atlas/f1.mjs"), ("q2", "scripts/atlas/f2.mjs"), ("q3", "scripts/atlas/f3.mjs")):
        b, r, h, m, s = _mk_bundle_and_env(qid, sref)
        bundles.append(b)
        revs.update(r)
        hashes.update(h)
        bytes_map.update(m)
        spans.update(s)

    corpus = build_frozen_gepa_corpus_from_replays_v1(
        bundles,
        expected_source_revisions=revs,
        expected_chunk_hashes=hashes,
        source_bytes_by_ref=bytes_map,
        expected_chunk_spans=spans,
    )
    assert corpus["canonicalAuthority"] is False
    assert corpus["writesPerformed"] is False
    assert corpus["corpusChecksum"].startswith("sha256:")
    assert corpus["counts"]["train"] >= 1
    assert corpus["counts"]["held_out"] >= 1

    train_ex = to_dspy_examples_v1(corpus["splits"]["train"])
    ctx = json.loads(train_ex[0].ace_manifest_json)
    assert len(ctx) == 2

    gate_small = check_gepa_corpus_and_promotion_ready_v1(
        corpus,
        program_version="gepa-prog-v1",
        metric_version="doc14-gepa-metric-v1",
        before_held_out_score=0.5,
        after_held_out_score=0.8,
    )
    assert gate_small["promotionAllowed"] is False

    big_bundles, big_revs, big_hashes, big_bytes, big_spans = [], {}, {}, {}, {}
    for i in range(30):
        b, r, h, m, s = _mk_bundle_and_env(f"q{i:02d}", f"scripts/atlas/f{i:02d}.mjs")
        big_bundles.append(b)
        big_revs.update(r)
        big_hashes.update(h)
        big_bytes.update(m)
        big_spans.update(s)
    big_corpus = build_frozen_gepa_corpus_from_replays_v1(
        big_bundles,
        expected_source_revisions=big_revs,
        expected_chunk_hashes=big_hashes,
        source_bytes_by_ref=big_bytes,
        expected_chunk_spans=big_spans,
        train_ratio=0.5,
        val_ratio=0.1,
    )
    gate_ok = check_gepa_corpus_and_promotion_ready_v1(
        big_corpus,
        program_version="gepa-prog-v1",
        metric_version="doc14-gepa-metric-v1",
        before_held_out_score=0.5,
        after_held_out_score=0.8,
        approved_by="human-op",
    )
    assert gate_ok["promotionAllowed"] is True


def test_build_frozen_gepa_corpus_rejects_same_source_group_or_duplicate() -> None:
    b1, r1, h1, m1, s1 = _mk_bundle_and_env("q1", "scripts/atlas/shared.mjs")
    with pytest.raises(ValueError, match="GEPA_DUPLICATE_QUERY_ID"):
        build_frozen_gepa_corpus_from_replays_v1(
            [b1, b1],
            expected_source_revisions=r1,
            expected_chunk_hashes=h1,
            source_bytes_by_ref=m1,
            expected_chunk_spans=s1,
        )
    b2 = copy.deepcopy(b1) if False else build_versioned_replay_bundle_v1(
        query_id="q2",
        query_text="Question q2?",
        feature_definitions=b1["featureDefinitions"],
        candidates=b1["ordinalMap"],
        feature_matrix=b1["featureMatrix"],
        presence_mask=b1["presenceMask"],
        tuple_provenance=b1["tupleProvenance"],
        relevance_grades=b1["relevanceGrades"],
        quote_checks=b1["quoteChecks"],
    )
    with pytest.raises(ValueError, match="GEPA_HELD_OUT_SPLIT_EMPTY"):
        build_frozen_gepa_corpus_from_replays_v1(
            [b1, b2],
            expected_source_revisions=r1,
            expected_chunk_hashes=h1,
            source_bytes_by_ref=m1,
            expected_chunk_spans=s1,
        )
