from __future__ import annotations

import dspy
import pytest

from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (
    create_bounded_dspy_rlm_v1,
    doc14_gepa_metric_v1,
    evaluate_gepa_offline_promotion_gate_v1,
    run_dspy_predict_ace_recommender_v1,
)


def test_dspy_predict_rejects_caller_boolean_and_requires_verified_ace_rows():
    raw_rejected = run_dspy_predict_ace_recommender_v1(
        task_query="How is VRAM checked?",
        context_manifest={"canonicalized": True, "chunks": [{"chunkId": "forged"}]},
    )
    assert raw_rejected["status"] == "REJECTED_RAW_CONTEXT"
    assert raw_rejected["citationVerified"] is False

    v2_without_rows = run_dspy_predict_ace_recommender_v1(
        task_query="How is VRAM checked?",
        context_manifest={"schema": "atlas.context-manifest.v2"},
    )
    assert v2_without_rows["status"] == "ACE_VERIFIED_READBACK_ROWS_REQUIRED"
    assert v2_without_rows["citationVerified"] is False


def test_predict_uses_only_scoped_readback_and_rejects_before_model_resolution(monkeypatch):
    from atlas_graph_runtime import dspy_predict_ace_recommender_v1 as adapter

    def unexpected_call(*args, **kwargs):
        pytest.fail("rejected inputs must not reach the next boundary")

    monkeypatch.setattr(adapter, "build_native_dspy_lm_v1", unexpected_call)
    monkeypatch.setattr(adapter, "run_bounded_dspy_recommendation_with_ace_manifest_v1", unexpected_call)
    checksum = "a" * 64
    request = {"schema": "atlas.context-manifest.v2", "identityChecksum": checksum}
    rows = [{"pgReadbackStatus": "PROVEN", "admissionStatus": "INDEX_ELIGIBLE"}]
    options = {"task_query": "question", "context_manifest": request}
    assert adapter.run_dspy_predict_ace_recommender_v1(
        **options, records=rows, scoped_readback=unexpected_call,
    )["status"] == "ACE_CALLER_READBACK_ROWS_FORBIDDEN"
    assert adapter.run_dspy_predict_ace_recommender_v1(
        **options, scoped_readback=lambda key: None,
    )["status"] == "CANONICAL_ADMISSION_UNVERIFIED"
    assert adapter.run_dspy_predict_ace_recommender_v1(
        **options, scoped_readback=lambda key: ({**request, "identityChecksum": "b" * 64}, rows),
    )["status"] == "ACE_CONTEXT_READBACK_MISMATCH"

    owner_manifest = {**request, "v1": {"selectedNodeKeys": ["node-1"]}}

    def readback(key):
        assert key == checksum
        return owner_manifest, rows

    def verify_handoff(**kwargs):
        assert kwargs["context_manifest"] is owner_manifest
        assert kwargs["records"] is rows
        return {"status": "HANDOFF_OBSERVED"}

    monkeypatch.setattr(adapter, "run_bounded_dspy_recommendation_with_ace_manifest_v1", verify_handoff)
    assert adapter.run_dspy_predict_ace_recommender_v1(
        **options, scoped_readback=readback, token_counter=len, model_revision="test-model",
    )["status"] == "HANDOFF_OBSERVED"


def test_gepa_offline_promotion_gate_requires_held_out_gain_and_independent_approval():
    unapproved = evaluate_gepa_offline_promotion_gate_v1(
        dataset_checksum="sha256:" + "b" * 64,
        program_version="dspy-predict-v1",
        metric_version="citation-ndcg-v1",
        train_count=24,
        held_out_count=12,
        before_held_out_score=0.70,
        after_held_out_score=0.82,
        approved_by=None,
    )
    assert unapproved["promotionAllowed"] is False
    assert unapproved["reasons"] == ["AWAITING_INDEPENDENT_PROMOTION_APPROVAL"]
    assert unapproved["canPromoteOntologyRelations"] is False

    approved = evaluate_gepa_offline_promotion_gate_v1(
        dataset_checksum="sha256:" + "b" * 64,
        program_version="dspy-predict-v1",
        metric_version="citation-ndcg-v1",
        train_count=24,
        held_out_count=12,
        before_held_out_score=0.70,
        after_held_out_score=0.82,
        approved_by="operator:james",
    )
    assert approved["promotionAllowed"] is True
    assert approved["delta"] == 0.12


def test_bounded_dspy_rlm_scaffold_rejects_unverified_context_until_tools_are_bound():
    manifest = {
        "canonicalized": True,
        "chunks": [
            {
                "chunkId": "c1",
                "sourceRef": "src/a.ts",
                "sourceRevision": "sha256:" + "a" * 64,
                "text": "export const guard = 'ContextManifest';",
            }
        ],
    }
    with pytest.raises(ValueError, match="ACE_CONTEXT_MANIFEST_V2_REQUIRED"):
        create_bounded_dspy_rlm_v1(context_manifest=manifest)


def test_doc14_gepa_metric_emits_actionable_feedback_and_scores_grounded_citations():
    ex = dspy.Example(
        task_query="How does it guard?",
        context_manifest_json='[{"chunkId":"c1","text":"export const guard = 1;"}]',
    )
    bad_id = doc14_gepa_metric_v1(
        ex,
        dspy.Prediction(recommendation="Use guard", cited_chunk_id="wrong", exact_quote="guard"),
    )
    assert bad_id.score == 0.0
    assert "not in context_manifest_json" in bad_id.feedback

    bad_quote = doc14_gepa_metric_v1(
        ex,
        dspy.Prediction(recommendation="Use guard", cited_chunk_id="c1", exact_quote="invented quote"),
    )
    assert bad_quote.score == 0.25
    assert "verbatim" in bad_quote.feedback

    good = doc14_gepa_metric_v1(
        ex,
        dspy.Prediction(recommendation="Use guard", cited_chunk_id="c1", exact_quote="export const guard = 1;"),
    )
    assert good.score == 1.0
    assert good.feedback is None
