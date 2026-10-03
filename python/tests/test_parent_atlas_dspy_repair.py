from copy import deepcopy

import pytest

from python.parent_atlas_dspy_repair import (
    RepairMetricObservationV1,
    atlas_repair_score_v1,
    build_semantic_768_gepa_example_v1,
    compare_baseline_and_optimized_v1,
    validate_dspy_repair_output_v1,
)


def _semantic_768_example():
    digest = "sha256:" + "a" * 64
    return {
        "schema": "atlas.gepa-semantic-768-example.v1",
        "queryChecksum": digest,
        "identity": {
            "sourceRef": "src/example.ts#symbol:run",
            "sourceRevision": digest,
            "workspaceRevision": digest,
            "contentHash": digest,
            "packetKey": "packet:example",
            "canonicalId": "function:example.run",
        },
        "semanticRepresentation": {
            "kind": "semantic_768",
            "dimensions": 768,
            "representationRevision": "repr:embeddinggemma-pinned-policy-v1",
            "modelRevision": "model:sha256:artifact-revision",
            "vectorChecksum": digest,
        },
        "routing": {"logicalLane": "dense", "executor": "qdrant"},
        "outcome": {
            "recallAt10": 0.9,
            "mrr": 0.75,
            "validationPassed": True,
            "latencyMs": 12.5,
        },
        "evidenceRefs": ["src/example.ts#symbol:run"],
    }


def _repair_output():
    digest = "sha256:" + "a" * 64
    return {
        "schema": "atlas.dspy-repair-output.v1",
        "contextManifestChecksum": digest,
        "diagnosis": "The symbol uses an outdated cache key.",
        "targetCandidates": ["function:cache.lookup", "file:src/cache.ts"],
        "patchPlan": "Update the key derivation and preserve the prior read path.",
        "validationPlan": "Run the cache contract tests and typecheck.",
        "evidenceRefs": ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"],
    }


def test_semantic_768_gepa_example_is_metadata_only_and_deterministic():
    example = _semantic_768_example()
    normalized = build_semantic_768_gepa_example_v1(example)

    assert normalized == build_semantic_768_gepa_example_v1(example)
    assert normalized["semanticRepresentation"]["dimensions"] == 768
    assert normalized["identity"]["packetKey"] == "packet:example"
    assert normalized["evidenceIdentityChecksum"].startswith("sha256:")
    assert set(normalized["semanticRepresentation"]) == {
        "kind",
        "dimensions",
        "representationRevision",
        "modelRevision",
        "vectorChecksum",
    }
    changed = deepcopy(example)
    changed["identity"]["contentHash"] = "sha256:" + "b" * 64
    assert (
        build_semantic_768_gepa_example_v1(changed)["evidenceIdentityChecksum"]
        != normalized["evidenceIdentityChecksum"]
    )


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda x: x.update(queryChecksum="sha256:" + "g" * 64), "lowercase hex"),
        (lambda x: x["identity"].update(sourceRevision="unknown"), "placeholder"),
        (lambda x: x["identity"].pop("packetKey"), "exactly"),
        (lambda x: x["semanticRepresentation"].update(dimensions=384), "768 dimensions"),
        (lambda x: x["semanticRepresentation"].update(vector=[0.0] * 768), "exactly"),
        (lambda x: x["routing"].update(executor="dense"), "distinct"),
        (lambda x: x.update(evidenceRefs=["other.ts"]), "include identity.sourceRef"),
    ],
)
def test_semantic_768_gepa_example_fails_closed(mutate, message):
    example = deepcopy(_semantic_768_example())
    mutate(example)
    with pytest.raises(ValueError, match=message):
        build_semantic_768_gepa_example_v1(example)


def test_dspy_repair_output_accepts_only_manifest_bound_refs_and_preserves_rank_order():
    digest = "sha256:" + "a" * 64
    output = _repair_output()
    validated = validate_dspy_repair_output_v1(
        output,
        context_manifest_checksum=digest,
        allowed_evidence_refs=["tests/cache.test.ts", "src/cache.ts#symbol:lookup"],
        allowed_target_ids=["file:src/cache.ts", "function:cache.lookup"],
    )
    assert validated["targetCandidates"] == ["function:cache.lookup", "file:src/cache.ts"]
    assert validated["evidenceRefs"] == ["src/cache.ts#symbol:lookup", "tests/cache.test.ts"]


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda x: x.update(evidenceRefs=["src/cache.ts#symbol:lookup", "invented.ts"]), "UNAUTHORIZED_EVIDENCE_REF"),
        (lambda x: x.update(targetCandidates=["function:invented"]), "UNAUTHORIZED_TARGET_ID"),
        (lambda x: x.update(contextManifestChecksum="sha256:" + "b" * 64), "CONTEXT_MANIFEST_CHECKSUM_MISMATCH"),
        (lambda x: x.update(unexpected="not allowed"), "exactly"),
        (lambda x: x.update(evidenceRefs=["tests/cache.test.ts", "tests/cache.test.ts"]), "duplicate identifiers"),
    ],
)
def test_dspy_repair_output_rejects_fabricated_or_unbound_refs(mutate, message):
    digest = "sha256:" + "a" * 64
    output = deepcopy(_repair_output())
    mutate(output)
    with pytest.raises(ValueError, match=message):
        validate_dspy_repair_output_v1(
            output,
            context_manifest_checksum=digest,
            allowed_evidence_refs=["src/cache.ts#symbol:lookup", "tests/cache.test.ts"],
            allowed_target_ids=["function:cache.lookup", "file:src/cache.ts"],
        )


def test_atlas_repair_score_v1_perfect_receipt():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=1.0,
            localization_recall_at_5=1.0,
            exact_evidence_coverage=1.0,
            targeted_tests_passed=True,
            typecheck_passed=True,
            regression_free=True,
            patch_minimality=1.0,
            false_edit_rate=0.0,
            latency_budget_score=1.0,
            cache_reuse_rate=1.0,
        )
    )
    assert score == 1.0
    assert feedback == "All hard repair gates passed."


def test_atlas_repair_score_v1_failure_feedback():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=0.7,
            localization_recall_at_5=0.4,
            exact_evidence_coverage=0.5,
            targeted_tests_passed=False,
            typecheck_passed=False,
            regression_free=True,
            patch_minimality=0.8,
            false_edit_rate=0.2,
            latency_budget_score=0.5,
            cache_reuse_rate=0.5,
        )
    )
    assert score < 0.7
    assert "TARGETED_TEST_FAILURE" in feedback
    assert "TYPECHECK_FAILURE" in feedback
    assert score == 0.0


@pytest.mark.parametrize(
    "failure",
    ["FABRICATED_EVIDENCE", "PERMISSION_VIOLATION", "UNSAFE_MUTATION"],
)
def test_atlas_repair_score_v1_hard_safety_failures_are_zero(failure):
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            retrieval_recall_at_5=1.0,
            localization_recall_at_5=1.0,
            exact_evidence_coverage=1.0,
            targeted_tests_passed=True,
            typecheck_passed=True,
            regression_free=True,
            patch_minimality=1.0,
            false_edit_rate=0.0,
            latency_budget_score=1.0,
            cache_reuse_rate=1.0,
            hard_gate_failures=(failure,),
        )
    )
    assert score == 0.0
    assert failure in feedback


def test_atlas_repair_score_v1_rejects_unknown_hard_gate_codes():
    observation = RepairMetricObservationV1(
        retrieval_recall_at_5=1.0,
        localization_recall_at_5=1.0,
        exact_evidence_coverage=1.0,
        targeted_tests_passed=True,
        typecheck_passed=True,
        regression_free=True,
        patch_minimality=1.0,
        false_edit_rate=0.0,
        latency_budget_score=1.0,
        cache_reuse_rate=1.0,
        hard_gate_failures=("MODEL_SAYS_BAD",),
    )
    with pytest.raises(ValueError, match="unknown hard gate failure codes"):
        atlas_repair_score_v1(observation)


def test_compare_baseline_and_optimized_v1_requires_real_lift():
    receipt = compare_baseline_and_optimized_v1([0.4, 0.6], [0.7, 0.8])
    assert receipt["baseline_mean"] == 0.5
    assert receipt["optimized_mean"] == 0.75
    assert receipt["absolute_lift"] == 0.25
    assert receipt["improved"] is True
