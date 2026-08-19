"""EXPERIMENT ONLY: DSPy + GEPA program-level routing optimization.

This module is intentionally offline/shadow-only. Production routing remains owned
by the deterministic Parent Atlas TypeScript/HMM/Viterbi/DAG policy stack.

The GEPA integration follows DSPy's official API:
- the feedback metric accepts (gold, pred, trace, pred_name, pred_trace)
- textual feedback is returned as dspy.Prediction(score=..., feedback=...)
- GEPA.compile() receives a non-empty trainset and a separate valset
- exactly one budget mode (auto, max_full_evals, max_metric_calls) is selected
- a reflection LM is injected by the caller

The optimized DSPy program may be saved and evaluated, but it must remain shadow
until Parent Atlas emits a promotion receipt from held-out execution evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


class DspyUnavailableError(RuntimeError):
    pass


def _require_dspy():
    try:
        import dspy  # type: ignore
    except ImportError as exc:  # pragma: no cover - workstation dependency gate
        raise DspyUnavailableError(
            "Install DSPy only in the experiment environment: pip install -U dspy"
        ) from exc
    return dspy


def build_route_program():
    """Build the Parent Atlas DSPy routing program lazily.

    Lazy construction keeps importing this module safe when DSPy is intentionally
    absent from the production runtime environment.
    """
    dspy = _require_dspy()

    class RouteDecision(dspy.Signature):
        """Choose one allowed Parent Atlas action from finite state, evidence, and budget.

        The action must be selected from allowed_actions. Prefer the least-expensive
        action that preserves exact evidence, authorization, dependency, and
        validation constraints. Never invent a tool/action outside the allowed set.
        """

        state: str = dspy.InputField(desc="Revisioned Parent Atlas policy state")
        allowed_actions: list[str] = dspy.InputField(desc="Finite legal action set")
        evidence_summary: str = dspy.InputField(desc="Grounded evidence and budget summary")
        action: str = dspy.OutputField(desc="Exactly one member of allowed_actions")

    return dspy.Predict(RouteDecision)


@dataclass(frozen=True)
class ParentAtlasTrajectory:
    state: str
    allowed_actions: tuple[str, ...]
    evidence_summary: str
    expected_action: str
    receipt_id: str
    validation_passed: bool
    exact_promotion_required: bool
    exact_promotion_satisfied: bool
    latency_ms: float | None = None
    latency_budget_ms: float | None = None
    tool_calls: int | None = None
    tool_call_budget: int | None = None
    feedback_context: str = ""


def trajectory_from_mapping(row: Mapping[str, Any]) -> ParentAtlasTrajectory:
    """Normalize a validated execution-learning record for DSPy/GEPA.

    Expected input rows should be derived from immutable Parent Atlas execution
    receipts, not from mutable live tool state.
    """
    allowed = tuple(str(v) for v in row.get("allowed_actions", ()))
    expected = str(row.get("expected_action") or row.get("action") or "").strip()
    if not allowed:
        raise ValueError("allowed_actions must be non-empty")
    if expected not in allowed:
        raise ValueError("expected_action must be a member of allowed_actions")

    return ParentAtlasTrajectory(
        state=str(row.get("state", "")),
        allowed_actions=allowed,
        evidence_summary=str(row.get("evidence_summary", "")),
        expected_action=expected,
        receipt_id=str(row.get("receipt_id", row.get("execution_receipt_id", "unknown"))),
        validation_passed=bool(row.get("validation_passed", False)),
        exact_promotion_required=bool(row.get("exact_promotion_required", False)),
        exact_promotion_satisfied=bool(row.get("exact_promotion_satisfied", False)),
        latency_ms=_optional_float(row.get("latency_ms")),
        latency_budget_ms=_optional_float(row.get("latency_budget_ms")),
        tool_calls=_optional_int(row.get("tool_calls")),
        tool_call_budget=_optional_int(row.get("tool_call_budget")),
        feedback_context=str(row.get("feedback_context", row.get("failure_feedback", ""))),
    )


def _optional_float(value: Any) -> float | None:
    return None if value is None else float(value)


def _optional_int(value: Any) -> int | None:
    return None if value is None else int(value)


def to_dspy_example(trajectory: ParentAtlasTrajectory):
    dspy = _require_dspy()
    return dspy.Example(
        state=trajectory.state,
        allowed_actions=list(trajectory.allowed_actions),
        evidence_summary=trajectory.evidence_summary,
        action=trajectory.expected_action,
        receipt_id=trajectory.receipt_id,
        validation_passed=trajectory.validation_passed,
        exact_promotion_required=trajectory.exact_promotion_required,
        exact_promotion_satisfied=trajectory.exact_promotion_satisfied,
        latency_ms=trajectory.latency_ms,
        latency_budget_ms=trajectory.latency_budget_ms,
        tool_calls=trajectory.tool_calls,
        tool_call_budget=trajectory.tool_call_budget,
        feedback_context=trajectory.feedback_context,
    ).with_inputs("state", "allowed_actions", "evidence_summary")


def build_dspy_examples(rows: Iterable[Mapping[str, Any]]) -> list[Any]:
    return [to_dspy_example(trajectory_from_mapping(row)) for row in rows]


def parent_atlas_gepa_metric(gold, pred, trace, pred_name, pred_trace):
    """GEPA feedback metric over immutable validated Parent Atlas trajectories.

    This deliberately rewards *validated route agreement*, not free-form generation.
    A different allowed action is not assumed correct simply because it is legal;
    offline replay cannot prove that unexecuted alternative's downstream outcome.
    """
    dspy = _require_dspy()

    allowed = [str(v) for v in getattr(gold, "allowed_actions", [])]
    expected = str(getattr(gold, "action", "")).strip()
    actual = str(getattr(pred, "action", "")).strip()
    receipt_id = str(getattr(gold, "receipt_id", "unknown"))

    feedback: list[str] = [f"Execution receipt: {receipt_id}."]

    if actual not in allowed:
        feedback.append(
            f"Invalid action '{actual}'. Choose exactly one allowed action: {allowed}."
        )
        return dspy.Prediction(score=0.0, feedback=" ".join(feedback))

    if actual != expected:
        feedback.append(
            f"Action '{actual}' is legal but differs from the validated historical action "
            f"'{expected}'. Offline replay cannot assume the unexecuted alternative would pass."
        )
        context = str(getattr(gold, "feedback_context", "")).strip()
        if context:
            feedback.append(f"Recorded diagnostic: {context}")
        return dspy.Prediction(score=0.15, feedback=" ".join(feedback))

    score = 0.70
    feedback.append(f"Matched validated action '{expected}'.")

    validation_passed = bool(getattr(gold, "validation_passed", False))
    if validation_passed:
        score += 0.15
        feedback.append("Executable validation passed.")
    else:
        feedback.append("Historical validation did not pass; do not treat this as SFT-quality success.")

    exact_required = bool(getattr(gold, "exact_promotion_required", False))
    exact_satisfied = bool(getattr(gold, "exact_promotion_satisfied", False))
    if not exact_required or exact_satisfied:
        score += 0.10
        feedback.append("Exact-promotion requirement was satisfied or not required.")
    else:
        feedback.append("Exact promotion was required but not satisfied.")

    latency_ms = getattr(gold, "latency_ms", None)
    latency_budget_ms = getattr(gold, "latency_budget_ms", None)
    tool_calls = getattr(gold, "tool_calls", None)
    tool_call_budget = getattr(gold, "tool_call_budget", None)

    cost_ok = True
    if latency_ms is not None and latency_budget_ms is not None:
        cost_ok = cost_ok and float(latency_ms) <= float(latency_budget_ms)
    if tool_calls is not None and tool_call_budget is not None:
        cost_ok = cost_ok and int(tool_calls) <= int(tool_call_budget)
    if cost_ok:
        score += 0.05
        feedback.append("Recorded latency/tool cost stayed inside the supplied budget.")
    else:
        feedback.append("Correct action exceeded at least one recorded resource budget.")

    context = str(getattr(gold, "feedback_context", "")).strip()
    if context:
        feedback.append(f"Recorded diagnostic: {context}")

    # GEPA's default perfect_score is 1.0, so clamp our composite into [0, 1].
    score = min(1.0, max(0.0, score))
    if pred_name:
        feedback.append(f"Predictor under optimization: {pred_name}.")
    return dspy.Prediction(score=score, feedback=" ".join(feedback))


def build_gepa_optimizer(
    *,
    reflection_lm,
    auto: str | None = "light",
    max_full_evals: int | None = None,
    max_metric_calls: int | None = None,
    reflection_minibatch_size: int = 3,
    candidate_selection_strategy: str = "pareto",
    num_threads: int | None = None,
    log_dir: str | None = None,
    seed: int = 0,
):
    """Build official dspy.GEPA with fail-closed budget validation."""
    dspy = _require_dspy()

    supplied = sum(v is not None for v in (auto, max_full_evals, max_metric_calls))
    if supplied != 1:
        raise ValueError("Exactly one of auto, max_full_evals, max_metric_calls must be set")
    if candidate_selection_strategy not in {"pareto", "current_best"}:
        raise ValueError("candidate_selection_strategy must be 'pareto' or 'current_best'")

    return dspy.GEPA(
        metric=parent_atlas_gepa_metric,
        auto=auto,
        max_full_evals=max_full_evals,
        max_metric_calls=max_metric_calls,
        reflection_minibatch_size=reflection_minibatch_size,
        candidate_selection_strategy=candidate_selection_strategy,
        reflection_lm=reflection_lm,
        component_selector="round_robin",
        use_merge=True,
        num_threads=num_threads,
        failure_score=0.0,
        perfect_score=1.0,
        log_dir=log_dir,
        track_stats=True,
        seed=seed,
    )


def compile_parent_atlas_gepa(
    *,
    trainset: Sequence[Any],
    valset: Sequence[Any],
    reflection_lm,
    student=None,
    auto: str | None = "light",
    max_full_evals: int | None = None,
    max_metric_calls: int | None = None,
    num_threads: int | None = None,
    log_dir: str | None = None,
    seed: int = 0,
):
    """Compile a shadow Parent Atlas routing program with DSPy's GEPA wrapper."""
    if not trainset:
        raise ValueError("GEPA trainset must be non-empty")
    if not valset:
        raise ValueError("GEPA valset must be non-empty and separate for promotion-quality evaluation")

    optimizer = build_gepa_optimizer(
        reflection_lm=reflection_lm,
        auto=auto,
        max_full_evals=max_full_evals,
        max_metric_calls=max_metric_calls,
        num_threads=num_threads,
        log_dir=log_dir,
        seed=seed,
    )
    return optimizer.compile(
        student or build_route_program(),
        trainset=list(trainset),
        valset=list(valset),
    )
