from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
import json
from typing import Any, Iterable, Mapping

OAK_2026_DSPY_CONTRACT_REVISION = "parent-atlas-oak2026-dspy-contract-v1"


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def stable_checksum_v1(value: Any) -> str:
    return hashlib.sha256(_stable_json(value).encode("utf-8")).hexdigest()


def _tuple(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(dict.fromkeys(str(value) for value in values if str(value)))


def validate_function_allowlist_v1(function_id: str, allowed_functions: Iterable[str]) -> str:
    allowed = set(_tuple(allowed_functions))
    if not function_id or function_id not in allowed:
        raise ValueError(f"OAK_2026_DSPY_FUNCTION_NOT_ALLOWED:{function_id}")
    return function_id


def validate_evidence_subset_v1(evidence_refs: Iterable[str], allowed_evidence_refs: Iterable[str]) -> tuple[str, ...]:
    evidence = _tuple(evidence_refs)
    allowed = set(_tuple(allowed_evidence_refs))
    unknown = [ref for ref in evidence if ref not in allowed]
    if unknown:
        raise ValueError(f"OAK_2026_DSPY_UNKNOWN_EVIDENCE_REFS:{','.join(unknown)}")
    return evidence


@dataclass(frozen=True, slots=True)
class Oak2026TaskClassificationV1:
    task_class: str
    failure_class: str
    required_evidence_kinds: tuple[str, ...]
    required_functions: tuple[str, ...]
    confidence: float


@dataclass(frozen=True, slots=True)
class Oak2026DiagnosisV1:
    diagnosis: str
    evidence_refs: tuple[str, ...]
    enough_evidence: bool
    missing_evidence_kinds: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Oak2026CritiqueV1:
    accepted: bool
    failure_class: str
    feedback: str
    evidence_refs: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class Oak2026KernelFunctionProposalV1:
    schema: str
    contract_revision: str
    kernel_revision: str
    program_revision: str
    query_id: str
    function_id: str
    bound_arguments: Mapping[str, Any]
    evidence_refs: tuple[str, ...]
    confidence: float
    canonical_authority: bool
    proposal_checksum: str

    def unsigned_payload(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("proposal_checksum", None)
        return payload


def build_kernel_function_proposal_v1(
    *,
    kernel_revision: str,
    program_revision: str,
    query_id: str,
    function_id: str,
    bound_arguments: Mapping[str, Any],
    evidence_refs: Iterable[str],
    allowed_functions: Iterable[str],
    allowed_evidence_refs: Iterable[str],
    confidence: float,
) -> Oak2026KernelFunctionProposalV1:
    validate_function_allowlist_v1(function_id, allowed_functions)
    checked_evidence = validate_evidence_subset_v1(evidence_refs, allowed_evidence_refs)
    if not kernel_revision or not program_revision or not query_id:
        raise ValueError("OAK_2026_DSPY_REVISION_AND_QUERY_REQUIRED")
    confidence = float(confidence)
    if not 0.0 <= confidence <= 1.0:
        raise ValueError("OAK_2026_DSPY_CONFIDENCE_OUT_OF_RANGE")

    body: dict[str, Any] = {
        "schema": "atlas.oak2026-dspy-kernel-function-proposal.v1",
        "contract_revision": OAK_2026_DSPY_CONTRACT_REVISION,
        "kernel_revision": kernel_revision,
        "program_revision": program_revision,
        "query_id": query_id,
        "function_id": function_id,
        "bound_arguments": dict(bound_arguments),
        "evidence_refs": checked_evidence,
        "confidence": confidence,
        "canonical_authority": False,
    }
    return Oak2026KernelFunctionProposalV1(
        **body,
        proposal_checksum=stable_checksum_v1(body),
    )
