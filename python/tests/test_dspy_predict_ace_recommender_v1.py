from __future__ import annotations

import dspy
import pytest

from atlas_graph_runtime.dspy_predict_ace_recommender_v1 import (
    build_bounded_rlm_tools_v1,
    create_bounded_dspy_rlm_v1,
    doc14_gepa_metric_v1,
    evaluate_gepa_offline_promotion_gate_v1,
    run_bounded_dspy_rlm_v1,
    run_dspy_predict_ace_recommender_v1,
)
from atlas_graph_runtime.doc14_bounded_rlm_recommender_v1 import _canonical_sha256_v1


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
    rows = [{"pgReadbackStatus": "PROVEN", "lineageMembershipStatus": "EXACT_SINGLE_MEMBER", "lineageRevisionStatus": "PROVEN"}]
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


def _make_verified_rlm_fixture(text: str = "export const guard = 'ContextManifest é';", token_budget: int = 4096):
    import hashlib

    src_rev = "sha256:" + "e" * 64
    ws_rev = "sha256:" + "f" * 64
    chunk_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
    src_rev_set = _canonical_sha256_v1({"schema": "atlas.ace-context-source-revision-set.v1", "revisions": [src_rev]})
    v1 = {
        "schema": "atlas.context-manifest.v1",
        "requestId": "req-rlm-1",
        "snapshotId": "snap-1",
        "query": "How does ContextManifest guard work?",
        "candidateBucket": 1,
        "candidateCount": 1,
        "tokenBudget": token_budget,
        "selectedNodeKeys": ["chunk-1"],
        "evidenceRefs": ["src/guard.ts"],
        "producerRevision": "ace-producer-v1",
        "workspaceRevision": ws_rev,
    }
    identity_input = {
        "selectedOrdinalSetChecksum": "1" * 64,
        "ordinalMapChecksum": "2" * 64,
        "retrievalPolicyRevision": "policy-v1",
        "acePlaybookRevision": "playbook-v1",
        "evidenceRevisions": {
            "sourceRevision": src_rev_set,
            "representationRevision": "rep-v1",
            "featureRevision": "feat-v1",
            "ontologyRevision": "onto-v1",
            "modelRevision": "gemma4-legal-iq4xs-direct.gguf",
            "promptTemplateRevision": "tmpl-v1",
        },
    }
    identity_checksum = _canonical_sha256_v1({
        "schema": "atlas.context-manifest-v2-identity.v1",
        "v1RequestId": v1["requestId"],
        "v1SnapshotId": v1["snapshotId"],
        "v1CandidateBucket": v1["candidateBucket"],
        **identity_input,
    })
    manifest = {
        "schema": "atlas.context-manifest.v2",
        "identityChecksum": identity_checksum,
        "identityInput": identity_input,
        "v1": v1,
    }
    rows = [
        {
            "chunkId": "chunk-1",
            "manifestNodeKey": "chunk-1",
            "sourceRef": "src/guard.ts",
            "sourceRevision": src_rev,
            "workspaceRevision": ws_rev,
            "text": text,
            "chunkSha256": chunk_sha,
            "pgReadbackStatus": "PROVEN",
            "lineageMembershipStatus": "EXACT_SINGLE_MEMBER",
            "lineageRevisionStatus": "PROVEN",
            "evidenceRefs": ["src/guard.ts"],
        }
    ]
    return manifest, rows, identity_checksum


def test_bounded_rlm_five_failure_modes_and_authorized_replay():
    manifest, rows, checksum = _make_verified_rlm_fixture()

    # 1. Stale revision: sourceRevision mismatch between manifest and readback row -> refuse
    stale_rows = [{**rows[0], "sourceRevision": "sha256:" + "0" * 64}]
    with pytest.raises(ValueError, match="ACE_CONTEXT_SOURCE_REVISION_SET_MISMATCH"):
        build_bounded_rlm_tools_v1(
            task_query=manifest["v1"]["query"],
            context_manifest=manifest,
            scoped_readback=lambda k: (manifest, stale_rows),
            token_counter=len,
        )

    # 2. Altered row: chunk bytes do not match chunkSha256 -> refuse
    altered_rows = [{**rows[0], "text": rows[0]["text"] + " tampered"}]
    with pytest.raises(ValueError, match="ACE_CONTEXT_ROW_CHECKSUM_MISMATCH"):
        build_bounded_rlm_tools_v1(
            task_query=manifest["v1"]["query"],
            context_manifest=manifest,
            scoped_readback=lambda k: (manifest, altered_rows),
            token_counter=len,
        )

    # 3. Bad UTF-8 span: out-of-bounds or mid-codepoint byte slice -> reject cleanly
    tools = build_bounded_rlm_tools_v1(
        task_query=manifest["v1"]["query"],
        context_manifest=manifest,
        scoped_readback=lambda k: (manifest, rows),
        token_counter=len,
    )
    with pytest.raises(ValueError, match="RLM_SPAN_BOUNDS_INVALID"):
        tools["verify_utf8_span"]("chunk-1", 0, 99999, "bad")
    raw_bytes = rows[0]["text"].encode("utf-8")
    e_acute_idx = raw_bytes.index("é".encode("utf-8"))
    with pytest.raises(ValueError):
        tools["verify_utf8_span"]("chunk-1", e_acute_idx, e_acute_idx + 1, "x")

    # 4. Citation mismatch: final RLM output cites a span/chunk not in admitted rows -> REFUSED
    runtime_bad_cite = create_bounded_dspy_rlm_v1(
        task_query=manifest["v1"]["query"],
        context_manifest=manifest,
        scoped_readback=lambda k: (manifest, rows),
        token_counter=len,
    )
    runtime_bad_cite["rlm"] = lambda **kw: dspy.Prediction(
        recommendation="Use guard", cited_chunk_id="forged-chunk", exact_quote="ContextManifest",
    )
    bad_res = run_bounded_dspy_rlm_v1(
        runtime=runtime_bad_cite,
        task_query=manifest["v1"]["query"],
        lm=object(),
        model_revision="gemma4-legal-iq4xs-direct.gguf",
    )
    assert bad_res["status"] == "REFUSED"
    assert bad_res["reason"] == "RLM_CITATION_OUTSIDE_ADMITTED_CONTEXT"
    assert bad_res["citationVerified"] is False

    # 5a. Budget exhaustion: hit evidence-token cap -> ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED
    tight_manifest, tight_rows, _ = _make_verified_rlm_fixture(token_budget=10)
    with pytest.raises(ValueError, match="ACE_CONTEXT_TOKEN_BUDGET_EXCEEDED"):
        build_bounded_rlm_tools_v1(
            task_query=tight_manifest["v1"]["query"],
            context_manifest=tight_manifest,
            scoped_readback=lambda k: (tight_manifest, tight_rows),
            token_counter=len,
        )

    # 5b. Wall-time / cancellation timeout inside rlm(...) -> abort cleanly without partial receipt
    runtime_timeout = create_bounded_dspy_rlm_v1(
        task_query=manifest["v1"]["query"],
        context_manifest=manifest,
        scoped_readback=lambda k: (manifest, rows),
        token_counter=len,
    )
    def _raise_timeout(**kw):
        raise TimeoutError("WALL_TIME_EXCEEDED")
    runtime_timeout["rlm"] = _raise_timeout
    timeout_res = run_bounded_dspy_rlm_v1(
        runtime=runtime_timeout,
        task_query=manifest["v1"]["query"],
        lm=object(),
        model_revision="gemma4-legal-iq4xs-direct.gguf",
    )
    assert timeout_res["status"] == "REFUSED"
    assert timeout_res["citationVerified"] is False

    # 2b. Swapped evidence bindings -> refuse
    swapped_rows = [{**rows[0], "evidenceRefs": ["src/other-file.ts"]}]
    with pytest.raises(ValueError, match="ACE_CONTEXT_EVIDENCE_OUTSIDE_MANIFEST"):
        build_bounded_rlm_tools_v1(
            task_query=manifest["v1"]["query"],
            context_manifest=manifest,
            scoped_readback=lambda k: (manifest, swapped_rows),
            token_counter=len,
        )

    # 2c. Extra/duplicate selected nodes -> refuse
    extra_rows = [rows[0], {**rows[0], "chunkId": "chunk-2", "manifestNodeKey": "chunk-2"}]
    with pytest.raises(ValueError, match="ACE_CONTEXT_ROW_OUTSIDE_SELECTION"):
        build_bounded_rlm_tools_v1(
            task_query=manifest["v1"]["query"],
            context_manifest=manifest,
            scoped_readback=lambda k: (manifest, extra_rows),
            token_counter=len,
        )

    # 5c. Iteration & sub-LLM-call ceiling enforcement -> INVALID_RLM_BUDGET
    with pytest.raises(ValueError, match="INVALID_RLM_BUDGET"):
        create_bounded_dspy_rlm_v1(
            task_query=manifest["v1"]["query"],
            context_manifest=manifest,
            scoped_readback=lambda k: (manifest, rows),
            token_counter=len,
            max_iterations=5,
            max_llm_calls=7,
        )

    # 6. Authorized replay -> CITATION_VERIFIED receipt with canonicalAuthority=False, writesPerformed=False
    runtime_ok = create_bounded_dspy_rlm_v1(
        task_query=manifest["v1"]["query"],
        context_manifest=manifest,
        scoped_readback=lambda k: (manifest, rows),
        token_counter=len,
    )
    runtime_ok["rlm"] = lambda **kw: dspy.Prediction(
        recommendation="Keep ContextManifest verification fail-closed.",
        cited_chunk_id="chunk-1",
        exact_quote="ContextManifest é",
    )
    ok_res = run_bounded_dspy_rlm_v1(
        runtime=runtime_ok,
        task_query=manifest["v1"]["query"],
        lm=object(),
        model_revision="gemma4-legal-iq4xs-direct.gguf",
    )
    assert ok_res["status"] == "CITATION_VERIFIED"
    assert ok_res["citationVerified"] is True
    assert ok_res["canonicalAuthority"] is False
    assert ok_res["writesPerformed"] is False
    assert ok_res["contextManifestChecksum"] == checksum
