"""Parent Atlas OaK 2026 × DSPy helper library.

OaK 2026 supplies the frozen ``K=(S,F)`` control model.
DSPy supplies typed LM programming primitives.
GEPA is used only for offline optimization.

This package is a Parent Atlas integration layer, not a fork of DSPy.
"""

from .contracts import (
    Oak2026ActionProposalV1,
    Oak2026KernelBindingV1,
    Oak2026ProgramBoundsV1,
    Oak2026RuntimeCountersV1,
    canonical_json_checksum_v1,
    validate_action_proposal_v1,
    validate_runtime_bounds_v1,
)
from .program import build_oak2026_kernel_program_v1, decode_oak2026_arguments_v1
from .runtime import build_oak2026_gepa_optimizer_v1, require_dspy

__all__ = [
    "Oak2026ActionProposalV1",
    "Oak2026KernelBindingV1",
    "Oak2026ProgramBoundsV1",
    "Oak2026RuntimeCountersV1",
    "build_oak2026_gepa_optimizer_v1",
    "build_oak2026_kernel_program_v1",
    "canonical_json_checksum_v1",
    "decode_oak2026_arguments_v1",
    "require_dspy",
    "validate_action_proposal_v1",
    "validate_runtime_bounds_v1",
]
