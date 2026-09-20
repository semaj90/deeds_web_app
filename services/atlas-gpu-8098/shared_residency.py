"""Shared GPU residency lease validation for the Atlas execution sidecar.

This module validates a lease produced by the Parent Atlas budget owner. It
does not allocate memory, persist state, or contact a GPU. The sidecar can run
in compatibility mode while callers migrate; strict mode must be enabled by
the deployment when every request is expected to carry a lease.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SharedGpuResidencyLease(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema: Literal["atlas.gpu-execution-lease.v1"]
    leaseId: str = Field(min_length=1)
    leaseEpoch: int = Field(ge=1)
    budgetRevision: str = Field(min_length=1)
    executor: Literal["pytorch_cuda", "cuvs", "tensorrt_rtx", "directml", "webgpu", "llm_runtime"]
    requestedBytes: int = Field(ge=0)
    activeReservedBytes: int = Field(ge=0)
    availableBytes: int = Field(ge=0)
    admission: Literal["ALLOW"]
    canonicalAuthority: Literal[False]
    writesPerformed: Literal[False]


def validate_shared_residency_lease(
    lease: SharedGpuResidencyLease | None,
    *,
    expected_executor: str,
    required: bool,
) -> dict[str, object]:
    if lease is None:
        if required:
            raise ValueError("GPU_RESIDENCY_LEASE_REQUIRED")
        return {
            "status": "UNBOUND_COMPATIBILITY_MODE",
            "leaseId": None,
            "budgetRevision": None,
            "executor": expected_executor,
        }
    if lease.executor != expected_executor:
        raise ValueError(f"GPU_RESIDENCY_EXECUTOR_MISMATCH:{lease.executor}:{expected_executor}")
    if lease.requestedBytes > max(0, lease.availableBytes - lease.activeReservedBytes):
        raise ValueError("GPU_RESIDENCY_BUDGET_EXCEEDED")
    return {
        "status": "SHARED_LEASE_ACCEPTED",
        "leaseId": lease.leaseId,
        "budgetRevision": lease.budgetRevision,
        "executor": lease.executor,
    }
