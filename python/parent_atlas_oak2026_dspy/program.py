"""DSPy program helpers for replacing OaK 2026's ReAct runtime policy.

This program deliberately does not execute tools. It proposes typed semantic
choices which must be admitted by the Parent Atlas kernel registry, planner,
authorization layer, and deterministic executor.
"""

from __future__ import annotations

import json
import math
from typing import Any, Sequence

from .contracts import (
    Oak2026ActionProposalV1,
    Oak2026KernelBindingV1,
    validate_action_proposal_v1,
    validate_evidence_classes_v1,
    validate_evidence_refs_v1,
)
from .runtime import require_dspy


def build_oak2026_kernel_program_v1(binding: Oak2026KernelBindingV1) -> Any:
    """Build a DSPy module without a free-running ReAct loop.

    The normal ``forward`` path is pre-execution only: classify + propose.
    Post-execution diagnosis and synthesis are explicit methods and require a
    non-empty deterministic execution receipt.
    """
    dp = require_dspy()

    class ClassifyTask(dp.Signature):
        """Classify evidence needs for a task already bound to one frozen OaK kernel."""

        task: str = dp.InputField()
        kernel_revision: str = dp.InputField()
        bound_task_class: str = dp.InputField()
        allowed_evidence_classes: list[str] = dp.InputField()
        task_class: str = dp.OutputField(desc="Must equal bound_task_class")
        required_evidence_classes: list[str] = dp.OutputField()
        confidence: float = dp.OutputField()

    class SelectKernelFunction(dp.Signature):
        """Choose one declared kernel function; never invent a function name."""

        task: str = dp.InputField()
        task_class: str = dp.InputField()
        allowed_functions: list[str] = dp.InputField()
        evidence_manifest: str = dp.InputField()
        function_name: str = dp.OutputField()
        arguments_json: str = dp.OutputField()
        evidence_refs: list[str] = dp.OutputField()

    class DiagnoseExecution(dp.Signature):
        """Diagnose a deterministic execution receipt without changing authority."""

        task: str = dp.InputField()
        execution_receipt: str = dp.InputField()
        evidence_manifest: str = dp.InputField()
        diagnosis: str = dp.OutputField()
        enough_evidence: bool = dp.OutputField()
        requested_evidence_classes: list[str] = dp.OutputField()

    class SynthesizeResult(dp.Signature):
        """Synthesize the final result using admitted evidence and execution receipts."""

        task: str = dp.InputField()
        evidence_manifest: str = dp.InputField()
        execution_receipt: str = dp.InputField()
        diagnosis: str = dp.InputField()
        answer: str = dp.OutputField()
        cited_evidence_refs: list[str] = dp.OutputField()

    class Oak2026KernelProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.classify = dp.Predict(ClassifyTask)
            self.select = dp.Predict(SelectKernelFunction)
            self.diagnose = dp.Predict(DiagnoseExecution)
            self.synthesize = dp.Predict(SynthesizeResult)

        def classify_task(self, *, task: str) -> Any:
            result = self.classify(
                task=task,
                kernel_revision=binding.kernel_revision,
                bound_task_class=binding.task_class,
                allowed_evidence_classes=list(binding.allowed_evidence_classes),
            )
            task_class = str(result.task_class).strip()
            if task_class != binding.task_class:
                raise ValueError(
                    f"OAK2026_TASK_CLASS_MISMATCH:{task_class}:{binding.task_class}"
                )
            confidence = float(result.confidence)
            if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
                raise ValueError("OAK2026_INVALID_CLASSIFICATION_CONFIDENCE")
            required = validate_evidence_classes_v1(
                binding,
                result.required_evidence_classes,
                field_name="classification.required_evidence_classes",
            )
            return dp.Prediction(
                task_class=binding.task_class,
                required_evidence_classes=list(required),
                confidence=confidence,
            )

        def propose_kernel_action(
            self,
            *,
            task: str,
            task_class: str,
            evidence_manifest: str,
            allowed_evidence_refs: Sequence[str],
        ) -> Oak2026ActionProposalV1:
            if task_class != binding.task_class:
                raise ValueError(
                    f"OAK2026_TASK_CLASS_MISMATCH:{task_class}:{binding.task_class}"
                )
            result = self.select(
                task=task,
                task_class=binding.task_class,
                allowed_functions=list(binding.allowed_functions),
                evidence_manifest=evidence_manifest,
            )
            proposal = Oak2026ActionProposalV1.build(
                function_name=result.function_name,
                arguments=decode_oak2026_arguments_v1(result.arguments_json),
                evidence_refs=result.evidence_refs,
            )
            validate_action_proposal_v1(
                binding,
                proposal,
                allowed_evidence_refs=allowed_evidence_refs,
            )
            return proposal

        def diagnose_execution(
            self,
            *,
            task: str,
            execution_receipt: str,
            evidence_manifest: str,
        ) -> Any:
            if not execution_receipt.strip():
                raise ValueError("OAK2026_EXECUTION_RECEIPT_REQUIRED")
            result = self.diagnose(
                task=task,
                execution_receipt=execution_receipt,
                evidence_manifest=evidence_manifest,
            )
            requested = validate_evidence_classes_v1(
                binding,
                result.requested_evidence_classes,
                field_name="diagnosis.requested_evidence_classes",
            )
            return dp.Prediction(
                diagnosis=str(result.diagnosis),
                enough_evidence=bool(result.enough_evidence),
                requested_evidence_classes=list(requested),
            )

        def synthesize_result(
            self,
            *,
            task: str,
            evidence_manifest: str,
            execution_receipt: str,
            diagnosis: str,
            allowed_evidence_refs: Sequence[str],
        ) -> Any:
            if not execution_receipt.strip():
                raise ValueError("OAK2026_EXECUTION_RECEIPT_REQUIRED")
            result = self.synthesize(
                task=task,
                evidence_manifest=evidence_manifest,
                execution_receipt=execution_receipt,
                diagnosis=diagnosis,
            )
            cited = validate_evidence_refs_v1(
                result.cited_evidence_refs,
                allowed_evidence_refs=allowed_evidence_refs,
                field_name="synthesis.cited_evidence_refs",
            )
            return dp.Prediction(answer=str(result.answer), cited_evidence_refs=list(cited))

        def forward(
            self,
            task: str,
            evidence_manifest: str,
            allowed_evidence_refs: Sequence[str],
        ) -> Any:
            """Pre-execution phase: classify and return one admitted action proposal."""
            classified = self.classify_task(task=task)
            proposal = self.propose_kernel_action(
                task=task,
                task_class=classified.task_class,
                evidence_manifest=evidence_manifest,
                allowed_evidence_refs=allowed_evidence_refs,
            )
            return dp.Prediction(
                task_class=binding.task_class,
                classification_confidence=classified.confidence,
                required_evidence_classes=classified.required_evidence_classes,
                function_name=proposal.function_name,
                arguments=dict(proposal.arguments),
                evidence_refs=list(proposal.evidence_refs),
            )

    return Oak2026KernelProgramV1()


def _reject_nonfinite_constant(value: str) -> None:
    raise ValueError(f"OAK2026_ACTION_ARGUMENTS_NONFINITE:{value}")


def decode_oak2026_arguments_v1(arguments_json: str) -> dict[str, Any]:
    try:
        value = json.loads(arguments_json, parse_constant=_reject_nonfinite_constant)
    except json.JSONDecodeError as error:
        raise ValueError("OAK2026_ACTION_ARGUMENTS_INVALID_JSON") from error
    if not isinstance(value, dict):
        raise ValueError("OAK2026_ACTION_ARGUMENTS_MUST_BE_OBJECT")
    return value
