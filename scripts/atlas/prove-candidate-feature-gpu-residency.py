#!/usr/bin/env python3
"""Bounded real-CUDA proof for CandidateFeature GPU residency.

Consumes the same FEAT-04 JSON envelope (pack + CPU gather reference), keeps the
physical buffers resident in one CUDA owner process, gathers the selected
CandidateOrdinals on-device, verifies parity, releases the lease, then proves
post-release access is blocked. No database/vector/graph store is mutated.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_ROOT = REPO_ROOT / "sveltekit-frontend" / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from parent_atlas_tensor.gpu_resident_executor import CandidateFeatureGpuExecutor  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prove Parent Atlas candidate-feature CUDA residency lifecycle")
    parser.add_argument("--input", required=True, help="FEAT-04 JSON envelope containing pack and gather")
    parser.add_argument("--output", help="Optional proof receipt JSON path")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--ttl-seconds", type=float, default=60.0)
    parser.add_argument("--pageable", action="store_true", help="Use synchronous pageable staging instead of pinned async staging")
    return parser.parse_args()


def emit(receipt: dict[str, Any], output: str | None, code: int) -> int:
    text = json.dumps(receipt, indent=2)
    print(text)
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n", encoding="utf-8")
    return code


def main() -> int:
    args = parse_args()
    envelope = json.loads(Path(args.input).read_text(encoding="utf-8"))
    pack = envelope.get("pack")
    gather_reference = envelope.get("gather")
    if not isinstance(pack, dict):
        raise ValueError("GPU_RESIDENCY_PROOF_PACK_REQUIRED")
    if not isinstance(gather_reference, dict):
        raise ValueError("GPU_RESIDENCY_PROOF_GATHER_REFERENCE_REQUIRED")
    selected = [int(value) for value in gather_reference.get("selectedOrdinals", [])]
    if not selected:
        raise ValueError("GPU_RESIDENCY_PROOF_SELECTED_ORDINALS_REQUIRED")

    try:
        executor = CandidateFeatureGpuExecutor(
            device_id=args.device,
            producer_revision="candidate-feature-gpu-residency-proof.v1",
        )
    except Exception as exc:
        return emit({
            "schema": "atlas.candidate-feature-gpu-residency-proof.v1",
            "status": "GPU_RESIDENCY_BLOCKED",
            "gpuExecutionObserved": False,
            "blocker": str(exc),
            "storeWrites": False,
        }, args.output, 3)

    lease_id = "proof:feat-gpu-residency:1"
    observation = executor.materialize(
        pack,
        lease_id=lease_id,
        ttl_seconds=args.ttl_seconds,
        pinned_host=not args.pageable,
    )
    gathered = executor.gather(lease_id, selected)

    expected_values = [float(value) for value in gather_reference.get("featureValues", [])]
    expected_presence = [int(value) for value in gather_reference.get("featurePresence", [])]
    expected_lane = [int(value) for value in gather_reference.get("laneMaskU16", [])]
    expected_degraded = [int(value) for value in gather_reference.get("degradedIdentity", [])]

    actual_values = [float(value) for value in gathered["featureValues"]]
    actual_presence = [int(value) for value in gathered["featurePresence"]]
    actual_lane = [int(value) for value in gathered["laneMaskI32"]]
    actual_degraded = [int(value) for value in gathered["degradedIdentity"]]

    parity = {
        "ordinalParity": gathered["selectedOrdinals"] == selected,
        "featureValueParity": actual_values == expected_values,
        "featurePresenceParity": actual_presence == expected_presence,
        "laneMaskParity": actual_lane == expected_lane,
        "degradedIdentityParity": actual_degraded == expected_degraded,
    }
    if not all(parity.values()):
        raise ValueError(f"GPU_RESIDENCY_GATHER_PARITY_FAILED:{parity}")

    release = executor.release(lease_id)
    post_release_active = executor.has_active_lease(lease_id)
    post_release_access_blocked = False
    try:
        executor.gather(lease_id, selected)
    except KeyError:
        post_release_access_blocked = True

    if post_release_active or not post_release_access_blocked:
        raise RuntimeError("GPU_RESIDENCY_RELEASE_NOT_ENFORCED")

    return emit({
        "schema": "atlas.candidate-feature-gpu-residency-proof.v1",
        "status": "CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN",
        "gpuExecutionObserved": True,
        "ownerProcessResident": True,
        "cudaIpcExported": False,
        "hostStagingMode": observation["hostStagingMode"],
        "sourceGpuPackChecksum": observation["sourceGpuPackChecksum"],
        "observation": observation,
        "gather": gathered,
        "release": release,
        "postReleaseAccessBlocked": post_release_access_blocked,
        "storeWrites": False,
        **parity,
    }, args.output, 0)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
