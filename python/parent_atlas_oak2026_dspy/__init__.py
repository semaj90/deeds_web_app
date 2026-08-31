"""Parent Atlas OaK 2026 + DSPy helper library.

This package wraps DSPy's public programming/optimization APIs. It does not
vendor DSPy internals and it never owns canonical identity, authorization,
retrieval truth, or side effects.

Runtime split:
- OaK kernel K=(S,F): defines legal schema/functions.
- DSPy: proposes typed semantic choices over that frozen kernel.
- KernelBoundDagPlannerV1: lowers an accepted proposal to deterministic actions.
- Parent Atlas executor/validators: own effects and truth gates.
- GEPA: offline optimizer only.
"""

from .contracts import (
    OAK_2026_DSPY_CONTRACT_REVISION,
    Oak2026CritiqueV1,
    Oak2026DiagnosisV1,
    Oak2026KernelFunctionProposalV1,
    Oak2026TaskClassificationV1,
    build_kernel_function_proposal_v1,
    stable_checksum_v1,
    validate_evidence_subset_v1,
    validate_function_allowlist_v1,
)
from .program import build_oak2026_typed_dag_program_v1, require_dspy
from .gepa import build_oak2026_gepa_optimizer_v1

__all__ = [
    "OAK_2026_DSPY_CONTRACT_REVISION",
    "Oak2026CritiqueV1",
    "Oak2026DiagnosisV1",
    "Oak2026KernelFunctionProposalV1",
    "Oak2026TaskClassificationV1",
    "build_kernel_function_proposal_v1",
    "stable_checksum_v1",
    "validate_evidence_subset_v1",
    "validate_function_allowlist_v1",
    "build_oak2026_typed_dag_program_v1",
    "build_oak2026_gepa_optimizer_v1",
    "require_dspy",
]
