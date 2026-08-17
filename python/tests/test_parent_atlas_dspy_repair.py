from python.parent_atlas_dspy_repair import (
    RepairMetricObservationV1,
    RepairQualityObservationV1,
    SystemCostObservationV1,
    atlas_repair_score_v1,
    compare_baseline_and_optimized_v1,
)


def test_atlas_repair_score_v1_perfect_receipt():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            quality=RepairQualityObservationV1(
                retrieval_recall_at_5=1.0,
                localization_recall_at_5=1.0,
                exact_evidence_coverage=1.0,
                targeted_tests_passed=True,
                typecheck_passed=True,
                regression_free=True,
                patch_minimality=1.0,
                false_edit_rate=0.0,
            ),
            cost=SystemCostObservationV1(
                latency_budget_score=1.0,
                cache_reuse_rate=1.0,
                tool_call_budget_score=1.0,
                gpu_budget_score=1.0,
            ),
        )
    )
    assert score == 1.0
    assert feedback == "All hard repair quality gates passed."


def test_atlas_repair_score_v1_failure_cannot_be_rescued_by_efficiency():
    score, feedback = atlas_repair_score_v1(
        RepairMetricObservationV1(
            quality=RepairQualityObservationV1(
                retrieval_recall_at_5=1.0,
                localization_recall_at_5=1.0,
                exact_evidence_coverage=1.0,
                targeted_tests_passed=False,
                typecheck_passed=True,
                regression_free=True,
                patch_minimality=1.0,
                false_edit_rate=0.0,
            ),
            cost=SystemCostObservationV1(
                latency_budget_score=1.0,
                cache_reuse_rate=1.0,
                tool_call_budget_score=1.0,
                gpu_budget_score=1.0,
            ),
        )
    )
    assert score == 0.0
    assert "TARGETED_TESTS_FAILED" in feedback


def test_compare_baseline_and_optimized_v1_requires_real_lift():
    receipt = compare_baseline_and_optimized_v1([0.4, 0.6], [0.7, 0.8])
    assert receipt["baseline_mean"] == 0.5
    assert receipt["optimized_mean"] == 0.75
    assert receipt["absolute_lift"] == 0.25
    assert receipt["improved"] is True
