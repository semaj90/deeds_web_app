"""Parent Atlas OaK 2026 DSPy contracts.

This module is a clean-room Parent Atlas integration inspired by the public DSPy
programming model and the OaK 2026 paper. It does not vendor DSPy internals.

Authority boundary:
- OaK/DSPy may propose semantic choices.
- Parent Atlas owns identity, revisions, authorization, execution, and promotion.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import math
import re
from typing import Any, Iterable, Mapping, Sequence

_SHA256_RE = re.compile(r"^[a-f0-9]{64}$")


def _require_nonempty(name: str, value: str) -> str:
    value = str(value).strip()
    if not value:
        raise ValueError(f"{name} is required")
    return value


def _require_sha256(name: str, value: str) -> str:
    value = str(value).strip()
    if not _SHA256_RE.fullmatch(value):
        raise ValueError(f"{name} must be a lowercase SHA-256 hex digest")
    return value


def _sorted_unique(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(sorted({str(value).strip() for value in values if str(value).strip()}))


def canonical_json_checksum_v1(value: Any) -> str:
    """Return a stable SHA-256 over JSON-compatible data."""
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return sha256(encoded).hexdigest()


@dataclass(frozen=True, slots=True)
class Oak2026ProgramBoundsV1:
    max_evidence_rounds: int = 3
    max_dag_actions: int = 24
    max_tool_calls: int = 16
    max_graph_depth: int = 3
    max_tokens: int = 16_384
    max_cost_usd: float = 5.0
    max_wall_clock_ms: int = 120_000

    def __post_init__(self) -> None:
        integer_fields = (
            "max_evidence_rounds",
            "max_dag_actions",
            "max_tool_calls",
            "max_graph_depth",
            "max_tokens",
            "max_wall_clock_ms",
        )
        for field_name in integer_fields:
            if int(getattr(self, field_name)) <= 0:
                raise ValueError(f"{field_name} must be > 0")
        if not math.isfinite(float(self.max_cost_usd)) or float(self.max_cost_usd) < 0:
            raise ValueError("max_cost_usd must be finite and >= 0")


@dataclass(frozen=True, slots=True)
class Oak2026KernelBindingV1:
    kernel_revision: str
    task_class: str
    schema_checksum: str
    function_catalog_checksum: str
    allowed_functions: tuple[str, ...]
    allowed_evidence_classes: tuple[str, ...]
    canonical_authority: bool = False

    @classmethod
    def build(
        cls,
        *,
        kernel_revision: str,
        task_class: str,
        schema_checksum: str,
        function_catalog_checksum: str,
        allowed_functions: Iterable[str],
        allowed_evidence_classes: Iterable[str],
    ) -> "Oak2026KernelBindingV1":
        functions = _sorted_unique(allowed_functions)
        evidence_classes = _sorted_unique(allowed_evidence_classes)
        if not functions:
            raise ValueError("allowed_functions must not be empty")
        if not evidence_classes:
            raise ValueError("allowed_evidence_classes must not be empty")
        return cls(
            kernel_revision=_require_nonempty("kernel_revision", kernel_revision),
            task_class=_require_nonempty("task_class", task_class),
            schema_checksum=_require_sha256("schema_checksum", schema_checksum),
            function_catalog_checksum=_require_sha256(
                "function_catalog_checksum", function_catalog_checksum
            ),
            allowed_functions=functions,
            allowed_evidence_classes=evidence_classes,
            canonical_authority=False,
        )

    @property
    def binding_checksum(self) -> str:
        return canonical_json_checksum_v1(
            {
                "kernelRevision": self.kernel_revision,
                "taskClass": self.task_class,
                "schemaChecksum": self.schema_checksum,
                "functionCatalogChecksum": self.function_catalog_checksum,
                "allowedFunctions": list(self.allowed_functions),
                "allowedEvidenceClasses": list(self.allowed_evidence_classes),
                "canonicalAuthority": False,
            }
        )


@dataclass(frozen=True, slots=True)
class Oak2026ActionProposalV1:
    function_name: str
    arguments: Mapping[str, Any]
    evidence_refs: tuple[str, ...]
    rationale: str = ""

    @classmethod
    def build(
        cls,
        *,
        function_name: str,
        arguments: Mapping[str, Any],
        evidence_refs: Iterable[str],
        rationale: str = "",
    ) -> "Oak2026ActionProposalV1":
        arguments = dict(arguments)
        canonical_json_checksum_v1(arguments)
        return cls(
            function_name=_require_nonempty("function_name", function_name),
            arguments=arguments,
            evidence_refs=_sorted_unique(evidence_refs),
            rationale=str(rationale),
        )


@dataclass(frozen=True, slots=True)
class Oak2026RuntimeCountersV1:
    evidence_rounds: int = 0
    dag_actions: int = 0
    tool_calls: int = 0
    graph_depth: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    wall_clock_ms: int = 0


def validate_runtime_bounds_v1(
    bounds: Oak2026ProgramBoundsV1,
    counters: Oak2026RuntimeCountersV1,
) -> None:
    checks = {
        "max_evidence_rounds": counters.evidence_rounds,
        "max_dag_actions": counters.dag_actions,
        "max_tool_calls": counters.tool_calls,
        "max_graph_depth": counters.graph_depth,
        "max_tokens": counters.tokens,
        "max_wall_clock_ms": counters.wall_clock_ms,
    }
    for bound_name, actual in checks.items():
        if actual < 0:
            raise ValueError(f"{bound_name} counter must not be negative")
        if actual > int(getattr(bounds, bound_name)):
            raise ValueError(f"OAK2026_RUNTIME_BOUND_EXCEEDED:{bound_name}")
    if not math.isfinite(float(counters.cost_usd)) or counters.cost_usd < 0:
        raise ValueError("cost_usd counter must be finite and >= 0")
    if counters.cost_usd > bounds.max_cost_usd:
        raise ValueError("OAK2026_RUNTIME_BOUND_EXCEEDED:max_cost_usd")


def validate_evidence_classes_v1(
    binding: Oak2026KernelBindingV1,
    evidence_classes: Iterable[str],
    *,
    field_name: str = "evidence_classes",
) -> tuple[str, ...]:
    """Canonicalize and reject evidence classes outside frozen kernel S."""
    normalized = _sorted_unique(evidence_classes)
    allowed = set(binding.allowed_evidence_classes)
    unknown = [value for value in normalized if value not in allowed]
    if unknown:
        raise ValueError(
            f"OAK2026_UNKNOWN_EVIDENCE_CLASSES:{field_name}:{','.join(unknown)}"
        )
    return normalized


def validate_evidence_refs_v1(
    evidence_refs: Iterable[str],
    *,
    allowed_evidence_refs: Sequence[str],
    field_name: str = "evidence_refs",
) -> tuple[str, ...]:
    """Canonicalize and reject references outside the admitted evidence packet."""
    normalized = _sorted_unique(evidence_refs)
    allowed = set(allowed_evidence_refs)
    unknown = [ref for ref in normalized if ref not in allowed]
    if unknown:
        raise ValueError(f"OAK2026_UNKNOWN_EVIDENCE_REFS:{field_name}:{','.join(unknown)}")
    return normalized


def validate_action_proposal_v1(
    binding: Oak2026KernelBindingV1,
    proposal: Oak2026ActionProposalV1,
    *,
    allowed_evidence_refs: Sequence[str],
) -> None:
    if proposal.function_name not in binding.allowed_functions:
        raise ValueError(f"OAK2026_UNDECLARED_FUNCTION:{proposal.function_name}")
    validate_evidence_refs_v1(
        proposal.evidence_refs,
        allowed_evidence_refs=allowed_evidence_refs,
        field_name="action.evidence_refs",
    )


@dataclass(frozen=True, slots=True)
class Oak2026PreExecutionPacketV1:
    """Wire-safe proposal packet consumed by the TypeScript admission boundary."""

    kernel_revision: str
    task_class: str
    schema_checksum: str
    function_catalog_checksum: str
    binding_checksum: str
    program_revision: str
    required_evidence_classes: tuple[str, ...]
    classification_confidence: float
    function_name: str
    arguments: Mapping[str, Any]
    evidence_refs: tuple[str, ...]
    canonical_authority: bool = False

    @classmethod
    def build(
        cls,
        *,
        binding: Oak2026KernelBindingV1,
        program_revision: str,
        task_class: str,
        required_evidence_classes: Iterable[str],
        classification_confidence: float,
        proposal: Oak2026ActionProposalV1,
        allowed_evidence_refs: Sequence[str],
    ) -> "Oak2026PreExecutionPacketV1":
        confidence = float(classification_confidence)
        if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
            raise ValueError("OAK2026_INVALID_CLASSIFICATION_CONFIDENCE")
        task_class = _require_nonempty("task_class", task_class)
        if task_class != binding.task_class:
            raise ValueError(
                f"OAK2026_TASK_CLASS_MISMATCH:{task_class}:{binding.task_class}"
            )
        required = validate_evidence_classes_v1(
            binding,
            required_evidence_classes,
            field_name="packet.required_evidence_classes",
        )
        validate_action_proposal_v1(
            binding,
            proposal,
            allowed_evidence_refs=allowed_evidence_refs,
        )
        return cls(
            kernel_revision=binding.kernel_revision,
            task_class=binding.task_class,
            schema_checksum=binding.schema_checksum,
            function_catalog_checksum=binding.function_catalog_checksum,
            binding_checksum=binding.binding_checksum,
            program_revision=_require_nonempty("program_revision", program_revision),
            required_evidence_classes=required,
            classification_confidence=confidence,
            function_name=proposal.function_name,
            arguments=dict(proposal.arguments),
            evidence_refs=proposal.evidence_refs,
            canonical_authority=False,
        )

    def to_wire(self) -> dict[str, Any]:
        return {
            "schema": "atlas.oak2026-dspy-proposal.v1",
            "kernelRevision": self.kernel_revision,
            "taskClass": self.task_class,
            "schemaChecksum": self.schema_checksum,
            "functionCatalogChecksum": self.function_catalog_checksum,
            "bindingChecksum": self.binding_checksum,
            "programRevision": self.program_revision,
            "requiredEvidenceClasses": list(self.required_evidence_classes),
            "classificationConfidence": self.classification_confidence,
            "functionName": self.function_name,
            "arguments": dict(self.arguments),
            "evidenceRefs": list(self.evidence_refs),
            "canonicalAuthority": False,
        }
