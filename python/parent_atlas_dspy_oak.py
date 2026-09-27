#!/usr/bin/env python3
"""OaK-bound DSPy/GEPA contracts for Parent Atlas.

This module deliberately does not implement a free-form ReAct loop. OaK owns
the bounded reasoning surface: DSPy receives a frozen kernel/function catalog
and may only select functions declared by that catalog. GEPA may optimize the
program text that performs selection/binding, but it may not invent functions,
operators, evidence references, or canonical identity.

The module is import-safe when DSPy is unavailable so contract tests can run
without installing or invoking an LM runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any, Mapping, Sequence

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover
    dspy = None


OAK_FAILURE_CLASSES = frozenset({
    "SCHEMA_MISSING_CONCEPT",
    "SCHEMA_WRONG_RELATION",
    "SCHEMA_CONTRADICTION",
    "FUNCTION_MISSING",
    "FUNCTION_BAD_PRECONDITION",
    "FUNCTION_BAD_COMPOSITION",
    "GRAPH_EXTRACTION_FAILURE",
    "EVIDENCE_MISSING",
    "AGENT_TOOL_SELECTION_ERROR",
    "AGENT_ARGUMENT_BINDING_ERROR",
    "EXECUTOR_FAILURE",
    "VALIDATOR_FAILURE",
})

# Failures that GEPA/DSPy is allowed to learn from directly. Kernel/schema
# failures must be repaired through the OaK construction loop instead of
# teaching the prompt to work around a broken kernel.
PROGRAM_OPTIMIZABLE_FAILURES = frozenset({
    "AGENT_TOOL_SELECTION_ERROR",
    "AGENT_ARGUMENT_BINDING_ERROR",
})


@dataclass(frozen=True, slots=True)
class OakFunctionViewV1:
    function_id: str
    kernel_revision: str
    mutation_policy: str
    required_evidence_kinds: tuple[str, ...] = ()
    allowed_evidence_classes: tuple[str, ...] = ()
    required_feature_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class OakBoundProgramRequestV1:
    task_class: str
    kernel_revision: str
    catalog_revision: str
    context_manifest_checksum: str
    allowed_evidence_refs: tuple[str, ...]
    functions: tuple[OakFunctionViewV1, ...]
    failure: str
    constraints: str


@dataclass(frozen=True, slots=True)
class OakBoundProgramOutputV1:
    selected_function_ids: tuple[str, ...]
    cited_evidence_refs: tuple[str, ...]
    diagnosis: str
    patch_plan: str
    validation_plan: str


@dataclass(frozen=True, slots=True)
class OakGepaFeedbackV1:
    score: float
    feedback: str
    optimization_scope: str
    hard_fail: bool


def _nonblank(value: str, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-blank string")
    return value.strip()


def validate_oak_bound_request_v1(request: OakBoundProgramRequestV1) -> OakBoundProgramRequestV1:
    _nonblank(request.task_class, "task_class")
    _nonblank(request.kernel_revision, "kernel_revision")
    _nonblank(request.catalog_revision, "catalog_revision")
    _nonblank(request.context_manifest_checksum, "context_manifest_checksum")

    seen: set[str] = set()
    for fn in request.functions:
        fid = _nonblank(fn.function_id, "function_id")
        if fid in seen:
            raise ValueError(f"duplicate function_id: {fid}")
        seen.add(fid)
        if fn.kernel_revision != request.kernel_revision:
            raise ValueError(
                f"function {fid} kernel revision {fn.kernel_revision} "
                f"does not match request {request.kernel_revision}"
            )
    return request


def validate_oak_bound_output_v1(
    request: OakBoundProgramRequestV1,
    output: OakBoundProgramOutputV1,
) -> OakBoundProgramOutputV1:
    """Fail closed if DSPy invents kernel functions or evidence references."""
    validate_oak_bound_request_v1(request)
    allowed_functions = {fn.function_id for fn in request.functions}
    selected = tuple(dict.fromkeys(output.selected_function_ids))
    unknown_functions = [fid for fid in selected if fid not in allowed_functions]
    if unknown_functions:
        raise ValueError(
            "OAK_UNDECLARED_FUNCTION:" + ",".join(sorted(unknown_functions))
        )

    allowed_evidence = set(request.allowed_evidence_refs)
    cited = tuple(dict.fromkeys(output.cited_evidence_refs))
    unknown_evidence = [ref for ref in cited if ref not in allowed_evidence]
    if unknown_evidence:
        raise ValueError(
            "OAK_UNDECLARED_EVIDENCE:" + ",".join(sorted(unknown_evidence))
        )

    if not selected:
        raise ValueError("OAK_EMPTY_FUNCTION_PLAN")
    _nonblank(output.diagnosis, "diagnosis")
    _nonblank(output.patch_plan, "patch_plan")
    _nonblank(output.validation_plan, "validation_plan")
    return OakBoundProgramOutputV1(
        selected_function_ids=selected,
        cited_evidence_refs=cited,
        diagnosis=output.diagnosis,
        patch_plan=output.patch_plan,
        validation_plan=output.validation_plan,
    )


def derive_oak_gepa_feedback_v1(
    *,
    base_score: float,
    failure_class: str | None,
    exact_evidence_coverage: float,
    validation_passed: bool,
    invented_function: bool = False,
    invented_evidence: bool = False,
) -> OakGepaFeedbackV1:
    """Route failures to the layer that is actually allowed to repair them.

    GEPA receives rich textual feedback only for program-level selection or
    argument-binding failures. Schema/function/kernel defects remain OaK work.
    Fabricated function/evidence references and validator failure hard-fail.
    """
    score = float(base_score)
    if score != score or score in (float("inf"), float("-inf")):
        raise ValueError("base_score must be finite")
    score = max(0.0, min(1.0, score))
    coverage = max(0.0, min(1.0, float(exact_evidence_coverage)))

    if invented_function or invented_evidence:
        reasons = []
        if invented_function:
            reasons.append("invented undeclared OaK function")
        if invented_evidence:
            reasons.append("cited evidence absent from ContextManifest")
        return OakGepaFeedbackV1(
            score=0.0,
            feedback="; ".join(reasons),
            optimization_scope="REJECT_OUTPUT",
            hard_fail=True,
        )

    if failure_class is not None and failure_class not in OAK_FAILURE_CLASSES:
        raise ValueError(f"unknown OaK failure class: {failure_class}")

    if not validation_passed:
        return OakGepaFeedbackV1(
            score=0.0,
            feedback="deterministic validation failed; do not optimize around validator failure",
            optimization_scope="VALIDATOR",
            hard_fail=True,
        )

    if failure_class in PROGRAM_OPTIMIZABLE_FAILURES:
        detail = (
            "select only functions declared by the active OaK catalog"
            if failure_class == "AGENT_TOOL_SELECTION_ERROR"
            else "bind arguments from typed kernel inputs and exact evidence only"
        )
        return OakGepaFeedbackV1(
            score=round(score * coverage, 6),
            feedback=f"{failure_class}: {detail}",
            optimization_scope="DSPY_GEPA",
            hard_fail=False,
        )

    if failure_class is not None:
        return OakGepaFeedbackV1(
            score=round(score * coverage, 6),
            feedback=(
                f"{failure_class}: route to OaK schema/function/kernel repair; "
                "GEPA must not learn a prompt workaround"
            ),
            optimization_scope="OAK",
            hard_fail=False,
        )

    return OakGepaFeedbackV1(
        score=round(score * coverage, 6),
        feedback="program satisfied OaK bounds and deterministic validation",
        optimization_scope="DSPY_GEPA",
        hard_fail=False,
    )


def serialize_oak_program_context_v1(request: OakBoundProgramRequestV1) -> str:
    """Deterministic compact context passed to DSPy; no store access occurs here."""
    validate_oak_bound_request_v1(request)
    body = {
        "taskClass": request.task_class,
        "kernelRevision": request.kernel_revision,
        "catalogRevision": request.catalog_revision,
        "contextManifestChecksum": request.context_manifest_checksum,
        "allowedEvidenceRefs": sorted(set(request.allowed_evidence_refs)),
        "functions": [
            {
                "functionId": fn.function_id,
                "kernelRevision": fn.kernel_revision,
                "mutationPolicy": fn.mutation_policy,
                "requiredEvidenceKinds": sorted(fn.required_evidence_kinds),
                "allowedEvidenceClasses": sorted(fn.allowed_evidence_classes),
                "requiredFeatureIds": sorted(fn.required_feature_ids),
            }
            for fn in sorted(request.functions, key=lambda item: item.function_id)
        ],
    }
    return json.dumps(body, sort_keys=True, separators=(",", ":"))


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def build_oak_bound_repair_program_v2() -> Any:
    """Create a DSPy program that plans over a frozen OaK function surface.

    This intentionally uses Predict rather than ReAct. Execution of the selected
    functions belongs to the Parent Atlas DAG/executor after output validation.
    """
    dp = require_dspy()

    class SelectOakFunctions(dp.Signature):
        """Select only legal OaK functions needed to diagnose and repair the task."""

        failure = dp.InputField(desc="Failure fingerprint and deterministic diagnostics")
        oak_context = dp.InputField(
            desc="Frozen OaK kernel/function catalog, allowed evidence refs, and manifest checksum"
        )
        constraints = dp.InputField(desc="Permissions, mutation scope, and do-not-do constraints")
        selected_function_ids = dp.OutputField(
            desc="JSON array containing only functionId values declared in oak_context"
        )
        cited_evidence_refs = dp.OutputField(
            desc="JSON array containing only evidence refs declared in oak_context"
        )
        diagnosis = dp.OutputField(desc="Diagnosis grounded in the selected functions/evidence")

    class ProposeBoundedRepair(dp.Signature):
        """Propose a patch plan after OaK-bounded function selection."""

        failure = dp.InputField()
        oak_context = dp.InputField()
        constraints = dp.InputField()
        diagnosis = dp.InputField()
        selected_function_ids = dp.InputField()
        cited_evidence_refs = dp.InputField()
        patch_plan = dp.OutputField(desc="Minimal proposed edit plan; proposal only")
        validation_plan = dp.OutputField(desc="Deterministic validation commands/criteria")

    class OakBoundRepairProgramV2(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.select = dp.Predict(SelectOakFunctions)
            self.propose = dp.Predict(ProposeBoundedRepair)

        def forward(self, failure: str, oak_context: str, constraints: str) -> Any:
            selected = self.select(
                failure=failure,
                oak_context=oak_context,
                constraints=constraints,
            )
            proposal = self.propose(
                failure=failure,
                oak_context=oak_context,
                constraints=constraints,
                diagnosis=selected.diagnosis,
                selected_function_ids=selected.selected_function_ids,
                cited_evidence_refs=selected.cited_evidence_refs,
            )
            return dp.Prediction(
                selected_function_ids=selected.selected_function_ids,
                cited_evidence_refs=selected.cited_evidence_refs,
                diagnosis=selected.diagnosis,
                patch_plan=proposal.patch_plan,
                validation_plan=proposal.validation_plan,
            )

    return OakBoundRepairProgramV2()
