from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "services" / "atlas-gpu-8098"))

from shared_residency import SharedGpuResidencyLease, validate_shared_residency_lease


def lease(**overrides):
    value = {
        "schema": "atlas.gpu-execution-lease.v1",
        "leaseId": "lease:test:1",
        "leaseEpoch": 1,
        "budgetRevision": "budget:test:v1",
        "executor": "cuvs",
        "requestedBytes": 1024,
        "activeReservedBytes": 0,
        "availableBytes": 4096,
        "admission": "ALLOW",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    value.update(overrides)
    return SharedGpuResidencyLease.model_validate(value)


def test_accepts_matching_noncanonical_lease():
    receipt = validate_shared_residency_lease(lease(), expected_executor="cuvs", required=True)
    assert receipt["status"] == "SHARED_LEASE_ACCEPTED"
    assert receipt["budgetRevision"] == "budget:test:v1"


def test_rejects_missing_lease_in_strict_mode():
    with pytest.raises(ValueError, match="GPU_RESIDENCY_LEASE_REQUIRED"):
        validate_shared_residency_lease(None, expected_executor="cuvs", required=True)


def test_rejects_executor_substitution_and_over_budget():
    with pytest.raises(ValueError, match="GPU_RESIDENCY_EXECUTOR_MISMATCH"):
        validate_shared_residency_lease(lease(executor="pytorch_cuda"), expected_executor="cuvs", required=True)
    with pytest.raises(ValueError, match="GPU_RESIDENCY_BUDGET_EXCEEDED"):
        validate_shared_residency_lease(lease(requestedBytes=5000), expected_executor="cuvs", required=True)


def test_compatibility_mode_is_explicitly_unbound():
    receipt = validate_shared_residency_lease(None, expected_executor="cuvs", required=False)
    assert receipt["status"] == "UNBOUND_COMPATIBILITY_MODE"
