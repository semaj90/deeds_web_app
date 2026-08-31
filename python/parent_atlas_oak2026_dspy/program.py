from __future__ import annotations

from typing import Any, Mapping, Sequence

from .contracts import (
    Oak2026CritiqueV1,
    Oak2026DiagnosisV1,
    Oak2026TaskClassificationV1,
    build_kernel_function_proposal_v1,
)

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover - optional experiment/runtime dependency
    dspy = None


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def _as_text(value: Any) -> str:
    return str(value if value is not None else "").strip()


def _as_string_list(value: Any) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        return tuple(item.strip() for item in value.split(",") if item.strip())
    if isinstance(value, Sequence):
        return tuple(str(item).strip() for item in value if str(item).strip())
    return (str(value).strip(),) if str(value).strip() else ()


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return dict(value)
    raise ValueError("OAK_2026_DSPY_BOUND_ARGUMENTS_MUST_BE_MAPPING")


def build_oak2026_typed_dag_program_v1() -> Any:
    """Build a bounded DSPy program that proposes typed kernel choices.

    The returned program never executes tools. Its function proposal must pass
    Parent Atlas allowlist/evidence validation and then be lowered by
    KernelBoundDagPlannerV1 on the TypeScript side.
    """
    dp = require_dspy()

    class ClassifyTask(dp.Signature):
        """Classify a Parent Atlas task without inventing capabilities."""

        task = dp.InputField(desc="Task/failure description")
        evidence_manifest = dp.InputField(desc="Promoted evidence summary only")
        allowed_functions = dp.InputField(desc="Exact frozen OaK F function IDs")

        task_class = dp.OutputField(desc="Bounded task family")
        failure_class = dp.OutputField(desc="Typed failure class")
        required_evidence_kinds = dp.OutputField(desc="Evidence classes needed")
        required_functions = dp.OutputField(desc="Subset of allowed function IDs")
        confidence = dp.OutputField(desc="0..1 confidence")

    class DiagnoseEvidence(dp.Signature):
        """Diagnose using only evidence supplied by Parent Atlas."""

        task = dp.InputField()
        task_class = dp.InputField()
        failure_class = dp.InputField()
        evidence_manifest = dp.InputField()
        allowed_evidence_refs = dp.InputField()

        diagnosis = dp.OutputField(desc="Grounded diagnosis")
        evidence_refs = dp.OutputField(desc="Subset of supplied evidence refs")
        enough_evidence = dp.OutputField(desc="Boolean sufficiency decision")
        missing_evidence_kinds = dp.OutputField(desc="Bounded missing evidence classes")

    class SelectKernelFunction(dp.Signature):
        """Select one function from the frozen OaK function set and bind arguments."""

        task = dp.InputField()
        diagnosis = dp.InputField()
        allowed_functions = dp.InputField(desc="Exact legal function IDs; choose only from this set")
        allowed_evidence_refs = dp.InputField()

        function_id = dp.OutputField(desc="Exactly one allowed function ID")
        bound_arguments = dp.OutputField(desc="Structured argument mapping for the selected function")
        evidence_refs = dp.OutputField(desc="Subset of supplied evidence refs")
        confidence = dp.OutputField(desc="0..1 confidence")

    class CritiqueExecution(dp.Signature):
        """Critique a deterministic execution receipt; never alter the kernel directly."""

        task = dp.InputField()
        execution_receipt = dp.InputField()
        validator_receipts = dp.InputField()
        allowed_evidence_refs = dp.InputField()

        accepted = dp.OutputField(desc="True only when hard validators pass")
        failure_class = dp.OutputField(desc="Typed program/executor/evidence failure class")
        feedback = dp.OutputField(desc="Concise receipt-grounded feedback")
        evidence_refs = dp.OutputField(desc="Subset of supplied evidence refs")

    class Oak2026TypedDagProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.classifier = dp.Predict(ClassifyTask)
            self.diagnoser = dp.Predict(DiagnoseEvidence)
            self.selector = dp.Predict(SelectKernelFunction)
            self.critic = dp.Predict(CritiqueExecution)

        def classify(
            self,
            *,
            task: str,
            evidence_manifest: str,
            allowed_functions: Sequence[str],
        ) -> Oak2026TaskClassificationV1:
            prediction = self.classifier(
                task=task,
                evidence_manifest=evidence_manifest,
                allowed_functions=list(allowed_functions),
            )
            required = _as_string_list(prediction.required_functions)
            unknown = [item for item in required if item not in set(allowed_functions)]
            if unknown:
                raise ValueError(f"OAK_2026_DSPY_CLASSIFIER_UNDECLARED_FUNCTIONS:{','.join(unknown)}")
            return Oak2026TaskClassificationV1(
                task_class=_as_text(prediction.task_class),
                failure_class=_as_text(prediction.failure_class),
                required_evidence_kinds=_as_string_list(prediction.required_evidence_kinds),
                required_functions=required,
                confidence=max(0.0, min(1.0, float(prediction.confidence))),
            )

        def diagnose(
            self,
            *,
            task: str,
            classification: Oak2026TaskClassificationV1,
            evidence_manifest: str,
            allowed_evidence_refs: Sequence[str],
        ) -> Oak2026DiagnosisV1:
            prediction = self.diagnoser(
                task=task,
                task_class=classification.task_class,
                failure_class=classification.failure_class,
                evidence_manifest=evidence_manifest,
                allowed_evidence_refs=list(allowed_evidence_refs),
            )
            refs = _as_string_list(prediction.evidence_refs)
            unknown = [ref for ref in refs if ref not in set(allowed_evidence_refs)]
            if unknown:
                raise ValueError(f"OAK_2026_DSPY_DIAGNOSIS_UNKNOWN_EVIDENCE:{','.join(unknown)}")
            return Oak2026DiagnosisV1(
                diagnosis=_as_text(prediction.diagnosis),
                evidence_refs=refs,
                enough_evidence=bool(prediction.enough_evidence),
                missing_evidence_kinds=_as_string_list(prediction.missing_evidence_kinds),
            )

        def propose(
            self,
            *,
            kernel_revision: str,
            program_revision: str,
            query_id: str,
            task: str,
            diagnosis: Oak2026DiagnosisV1,
            allowed_functions: Sequence[str],
            allowed_evidence_refs: Sequence[str],
        ) -> Any:
            if not diagnosis.enough_evidence:
                raise ValueError("OAK_2026_DSPY_PROPOSAL_REQUIRES_SUFFICIENT_EVIDENCE")
            prediction = self.selector(
                task=task,
                diagnosis=diagnosis.diagnosis,
                allowed_functions=list(allowed_functions),
                allowed_evidence_refs=list(allowed_evidence_refs),
            )
            return build_kernel_function_proposal_v1(
                kernel_revision=kernel_revision,
                program_revision=program_revision,
                query_id=query_id,
                function_id=_as_text(prediction.function_id),
                bound_arguments=_as_mapping(prediction.bound_arguments),
                evidence_refs=_as_string_list(prediction.evidence_refs),
                allowed_functions=allowed_functions,
                allowed_evidence_refs=allowed_evidence_refs,
                confidence=float(prediction.confidence),
            )

        def critique(
            self,
            *,
            task: str,
            execution_receipt: str,
            validator_receipts: str,
            allowed_evidence_refs: Sequence[str],
        ) -> Oak2026CritiqueV1:
            prediction = self.critic(
                task=task,
                execution_receipt=execution_receipt,
                validator_receipts=validator_receipts,
                allowed_evidence_refs=list(allowed_evidence_refs),
            )
            refs = _as_string_list(prediction.evidence_refs)
            unknown = [ref for ref in refs if ref not in set(allowed_evidence_refs)]
            if unknown:
                raise ValueError(f"OAK_2026_DSPY_CRITIQUE_UNKNOWN_EVIDENCE:{','.join(unknown)}")
            return Oak2026CritiqueV1(
                accepted=bool(prediction.accepted),
                failure_class=_as_text(prediction.failure_class),
                feedback=_as_text(prediction.feedback),
                evidence_refs=refs,
            )

    return Oak2026TypedDagProgramV1()
