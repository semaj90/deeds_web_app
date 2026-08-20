#!/usr/bin/env python3
"""DSPy/GEPA bridge for Parent Atlas repair-program optimization.

DSPy owns prompt/program structure. GEPA optimizes that program against a
receipt-derived metric. Neither component owns retrieval truth, graph truth,
or canonical evidence identity.

The module is import-safe when DSPy is not installed so repository tests can
validate the metric and data contracts without forcing GPU/LLM dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Sequence

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover - runtime capability boundary
    dspy = None


@dataclass(frozen=True, slots=True)
class RepairMetricObservationV1:
    retrieval_recall_at_5: float
    localization_recall_at_5: float
    exact_evidence_coverage: float
    targeted_tests_passed: bool
    typecheck_passed: bool
    regression_free: bool
    patch_minimality: float
    false_edit_rate: float
    latency_budget_score: float
    cache_reuse_rate: float


def _p(value: float) -> float:
    value = float(value)
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError("metric values must be finite")
    return max(0.0, min(1.0, value))


def atlas_repair_score_v1(observation: RepairMetricObservationV1) -> tuple[float, str]:
    """Return a normalized 0..1 score plus textual feedback for GEPA."""
    score = (
        0.15 * _p(observation.retrieval_recall_at_5)
        + 0.15 * _p(observation.localization_recall_at_5)
        + 0.10 * _p(observation.exact_evidence_coverage)
        + 0.15 * float(observation.targeted_tests_passed)
        + 0.10 * float(observation.typecheck_passed)
        + 0.10 * float(observation.regression_free)
        + 0.08 * _p(observation.patch_minimality)
        + 0.07 * (1.0 - _p(observation.false_edit_rate))
        + 0.05 * _p(observation.latency_budget_score)
        + 0.05 * _p(observation.cache_reuse_rate)
    )

    failures: list[str] = []
    if not observation.targeted_tests_passed:
        failures.append("targeted tests failed")
    if not observation.typecheck_passed:
        failures.append("typecheck failed")
    if not observation.regression_free:
        failures.append("regression detected")
    if observation.exact_evidence_coverage < 0.8:
        failures.append("exact evidence coverage below 0.8")
    if observation.localization_recall_at_5 < 0.8:
        failures.append("localization recall@5 below 0.8")

    feedback = "All hard repair gates passed." if not failures else "; ".join(failures)
    return round(score, 6), feedback


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def build_repair_program_v1() -> Any:
    """Construct the DSPy program lazily using the installed DSPy API."""
    dp = require_dspy()

    class DiagnoseRepair(dp.Signature):
        """Diagnose a code failure using only the supplied exact evidence."""

        failure = dp.InputField(desc="Failure fingerprint, diagnostics, and failing validation output")
        context_manifest = dp.InputField(desc="Exact promoted evidence with canonical IDs and source references")
        constraints = dp.InputField(desc="Permissions, affected roots, and do-not-do constraints")
        diagnosis = dp.OutputField(desc="Grounded diagnosis tied to evidence references")
        target_candidates = dp.OutputField(desc="Ranked canonical target IDs/source refs; do not invent evidence")

    class ProposeRepair(dp.Signature):
        """Propose the smallest evidence-grounded repair and validation plan."""

        failure = dp.InputField()
        diagnosis = dp.InputField()
        context_manifest = dp.InputField()
        constraints = dp.InputField()
        patch_plan = dp.OutputField(desc="Minimal patch plan with target file paths and evidence refs")
        validation_plan = dp.OutputField(desc="Targeted commands/acceptance criteria that can prove the repair")

    class RepairProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.diagnose = dp.Predict(DiagnoseRepair)
            self.propose = dp.Predict(ProposeRepair)

        def forward(self, failure: str, context_manifest: str, constraints: str) -> Any:
            diagnosis = self.diagnose(
                failure=failure,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            proposal = self.propose(
                failure=failure,
                diagnosis=diagnosis.diagnosis,
                context_manifest=context_manifest,
                constraints=constraints,
            )
            return dp.Prediction(
                diagnosis=diagnosis.diagnosis,
                target_candidates=diagnosis.target_candidates,
                patch_plan=proposal.patch_plan,
                validation_plan=proposal.validation_plan,
            )

    return RepairProgramV1()


def build_gepa_optimizer_v1(metric: Any, *, reflection_lm: Any, log_dir: str, seed: int = 0) -> Any:
    """Create the current DSPy GEPA optimizer with resumable logs/checkpoints."""
    dp = require_dspy()
    return dp.GEPA(
        metric=metric,
        reflection_lm=reflection_lm,
        auto="light",
        log_dir=log_dir,
        track_stats=True,
        track_best_outputs=True,
        seed=seed,
    )


def compare_baseline_and_optimized_v1(
    baseline_scores: Sequence[float],
    optimized_scores: Sequence[float],
) -> Mapping[str, float | bool]:
    if not baseline_scores or len(baseline_scores) != len(optimized_scores):
        raise ValueError("baseline and optimized score lists must be non-empty and aligned")
    baseline = sum(map(float, baseline_scores)) / len(baseline_scores)
    optimized = sum(map(float, optimized_scores)) / len(optimized_scores)
    return {
        "baseline_mean": round(baseline, 6),
        "optimized_mean": round(optimized, 6),
        "absolute_lift": round(optimized - baseline, 6),
        "improved": optimized > baseline,
    }
