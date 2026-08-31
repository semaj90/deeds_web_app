"""DSPy program helpers for replacing OaK 2026's ReAct runtime policy.

This program deliberately does not execute tools. It proposes typed semantic
choices which must be admitted by the Parent Atlas kernel registry, planner,
authorization layer, and deterministic executor.
"""

from __future__ import annotations

import json
from typing import Any

from .contracts import Oak2026KernelBindingV1
from .runtime import require_dspy


def build_oak2026_kernel_program_v1(binding: Oak2026KernelBindingV1) -> Any:
    """Build a DSPy module without a free-running ReAct loop."""
    dp = require_dspy()

    class ClassifyTask(dp.Signature):
        """Classify a Parent Atlas task using only the supplied frozen kernel context."""

        task: str = dp.InputField()
        kernel_revision: str = dp.InputField()
        allowed_evidence_classes: list[str] = dp.InputField()
        task_class: str = dp.OutputField()
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
            return self.classify(
                task=task,
                kernel_revision=binding.kernel_revision,
                allowed_evidence_classes=list(binding.allowed_evidence_classes),
            )

        def propose_kernel_action(
            self,
            *,
            task: str,
            task_class: str,
            evidence_manifest: str,
        ) -> Any:
            return self.select(
                task=task,
                task_class=task_class,
                allowed_functions=list(binding.allowed_functions),
                evidence_manifest=evidence_manifest,
            )

        def diagnose_execution(
            self,
            *,
            task: str,
            execution_receipt: str,
            evidence_manifest: str,
        ) -> Any:
            return self.diagnose(
                task=task,
                execution_receipt=execution_receipt,
                evidence_manifest=evidence_manifest,
            )

        def synthesize_result(
            self,
            *,
            task: str,
            evidence_manifest: str,
            execution_receipt: str,
            diagnosis: str,
        ) -> Any:
            return self.synthesize(
                task=task,
                evidence_manifest=evidence_manifest,
                execution_receipt=execution_receipt,
                diagnosis=diagnosis,
            )

        def forward(
            self,
            task: str,
            evidence_manifest: str,
            execution_receipt: str = "",
        ) -> Any:
            classified = self.classify_task(task=task)
            proposed = self.propose_kernel_action(
                task=task,
                task_class=classified.task_class,
                evidence_manifest=evidence_manifest,
            )
            diagnosed = self.diagnose_execution(
                task=task,
                execution_receipt=execution_receipt,
                evidence_manifest=evidence_manifest,
            )
            return dp.Prediction(
                task_class=classified.task_class,
                classification_confidence=classified.confidence,
                required_evidence_classes=classified.required_evidence_classes,
                function_name=proposed.function_name,
                arguments_json=proposed.arguments_json,
                evidence_refs=proposed.evidence_refs,
                diagnosis=diagnosed.diagnosis,
                enough_evidence=diagnosed.enough_evidence,
                requested_evidence_classes=diagnosed.requested_evidence_classes,
            )

    return Oak2026KernelProgramV1()


def decode_oak2026_arguments_v1(arguments_json: str) -> dict[str, Any]:
    value = json.loads(arguments_json)
    if not isinstance(value, dict):
        raise ValueError("OAK2026_ACTION_ARGUMENTS_MUST_BE_OBJECT")
    return value
