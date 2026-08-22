#!/usr/bin/env python3
"""FEAT-04 real PyTorch-CUDA parity proof for CandidateFeatureGpuPackV1.

Input is a JSON envelope containing:
  columnar: CandidateFeatureColumnarV1
  pack: CandidateFeatureGpuPackV1
  gather: CandidateFeatureGpuGatherReferenceV1

The script must actually allocate the physical feature/presence/valid-mask buffers
on CUDA, gather the requested CandidateOrdinal rows on-device, copy the gathered
result back, and compare exact float32 / uint8 values against the CPU reference.
It writes no Postgres/Qdrant/Valkey/Neo4j state and does not claim canonical
identity or GPU-residency ownership.

If PyTorch or CUDA is unavailable, it emits a typed blocker and exits non-zero.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

FEATURE_COUNT = 12


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parent Atlas CandidateFeature GPU parity proof")
    parser.add_argument("--input", required=True, help="JSON envelope with columnar/pack/gather")
    parser.add_argument("--output", help="Optional JSON receipt path")
    return parser.parse_args()


def emit(receipt: dict[str, Any], output: str | None, exit_code: int) -> int:
    text = json.dumps(receipt, indent=2)
    print(text)
    if output:
        path = Path(output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text + "\n", encoding="utf-8")
    return exit_code


def require_dict(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"CANDIDATE_FEATURE_GPU_PARITY_{name.upper()}_REQUIRED")
    return value


def main() -> int:
    args = parse_args()
    envelope = json.loads(Path(args.input).read_text(encoding="utf-8"))
    columnar = require_dict(envelope.get("columnar"), "columnar")
    pack = require_dict(envelope.get("pack"), "pack")
    gather = require_dict(envelope.get("gather"), "gather")

    if columnar.get("schema") != "atlas.candidate-feature-columnar.v1":
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_COLUMNAR_SCHEMA_MISMATCH")
    if pack.get("schema") != "atlas.candidate-feature-gpu-pack.v1":
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PACK_SCHEMA_MISMATCH")
    if gather.get("schema") != "atlas.candidate-feature-gpu-gather-reference.v1":
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_GATHER_SCHEMA_MISMATCH")
    if pack.get("columnarChecksum") != columnar.get("columnarChecksum"):
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_COLUMNAR_CHECKSUM_MISMATCH")
    if gather.get("gpuPackChecksum") != pack.get("gpuPackChecksum"):
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_GATHER_PACK_MISMATCH")

    logical_rows = int(pack["logicalRows"])
    physical_rows = int(pack["physicalRows"])
    feature_count = int(pack["featureCount"])
    if feature_count != FEATURE_COUNT:
        raise ValueError(f"CANDIDATE_FEATURE_GPU_PARITY_FEATURE_COUNT_MISMATCH:{feature_count}")
    if physical_rows < logical_rows:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PHYSICAL_ROWS_LT_LOGICAL")
    if len(pack["validMask"]) != physical_rows:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_VALID_MASK_LENGTH_MISMATCH")
    if len(pack["featureValues"]) != physical_rows * feature_count:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_FEATURE_VALUE_LENGTH_MISMATCH")
    if len(pack["featurePresence"]) != physical_rows * feature_count:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_FEATURE_PRESENCE_LENGTH_MISMATCH")

    selected = [int(value) for value in gather["selectedOrdinals"]]
    if len(set(selected)) != len(selected):
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_DUPLICATE_SELECTED_ORDINAL")
    if any(value < 0 or value >= logical_rows for value in selected):
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_SELECTED_ORDINAL_OUT_OF_RANGE")

    base = {
        "schema": "atlas.candidate-feature-gpu-cuda-proof.v1",
        "candidateSnapshotRevision": pack.get("candidateSnapshotRevision"),
        "ordinalMapChecksum": pack.get("ordinalMapChecksum"),
        "featureSnapshotChecksum": pack.get("featureSnapshotChecksum"),
        "columnarChecksum": pack.get("columnarChecksum"),
        "gpuPackChecksum": pack.get("gpuPackChecksum"),
        "gatherChecksum": gather.get("gatherChecksum"),
        "logicalRows": logical_rows,
        "physicalRows": physical_rows,
        "paddingRows": int(pack["paddingRows"]),
        "selectedOrdinals": selected,
        "selectedRowCount": len(selected),
        "featureCount": feature_count,
        "challenger": "PYTORCH_CUDA",
        "storeWrites": False,
        "identityAuthority": False,
        "canonicalOwnerChanged": False,
    }

    try:
        import torch  # type: ignore
    except Exception as exc:
        return emit(
            {
                **base,
                "status": "GPU_PARITY_BLOCKED",
                "gpuExecutionObserved": False,
                "blocker": "PYTORCH_IMPORT_FAILED",
                "detail": f"{type(exc).__name__}: {exc}",
            },
            args.output,
            3,
        )

    if not torch.cuda.is_available():
        return emit(
            {
                **base,
                "status": "GPU_PARITY_BLOCKED",
                "gpuExecutionObserved": False,
                "torchVersion": getattr(torch, "__version__", "unknown"),
                "blocker": "CUDA_NOT_AVAILABLE",
            },
            args.output,
            4,
        )

    device = torch.device("cuda")
    device_name = torch.cuda.get_device_name(device)

    # The physical buffers are constructed from the exact packed representation.
    cpu_values = torch.tensor(pack["featureValues"], dtype=torch.float32).reshape(physical_rows, feature_count)
    cpu_presence = torch.tensor(pack["featurePresence"], dtype=torch.uint8).reshape(physical_rows, feature_count)
    cpu_valid_mask = torch.tensor(pack["validMask"], dtype=torch.uint8)
    cpu_lane_mask = torch.tensor(pack["laneMaskU16"], dtype=torch.int32)
    cpu_degraded = torch.tensor(pack["degradedIdentity"], dtype=torch.uint8)

    torch.cuda.synchronize()
    gpu_values = cpu_values.to(device, non_blocking=False)
    gpu_presence = cpu_presence.to(device, non_blocking=False)
    gpu_valid_mask = cpu_valid_mask.to(device, non_blocking=False)
    gpu_lane_mask = cpu_lane_mask.to(device, non_blocking=False)
    gpu_degraded = cpu_degraded.to(device, non_blocking=False)
    gpu_ordinals = torch.tensor(selected, dtype=torch.int64, device=device)
    torch.cuda.synchronize()

    # Gather happens on CUDA, preserving the exact selected CandidateOrdinal order.
    gathered_values_gpu = torch.index_select(gpu_values, 0, gpu_ordinals)
    gathered_presence_gpu = torch.index_select(gpu_presence, 0, gpu_ordinals)
    gathered_lane_gpu = torch.index_select(gpu_lane_mask, 0, gpu_ordinals)
    gathered_degraded_gpu = torch.index_select(gpu_degraded, 0, gpu_ordinals)
    gathered_valid_gpu = torch.index_select(gpu_valid_mask, 0, gpu_ordinals)
    torch.cuda.synchronize()

    observed_values = gathered_values_gpu.cpu().reshape(-1).tolist()
    observed_presence = [int(value) for value in gathered_presence_gpu.cpu().reshape(-1).tolist()]
    observed_lane = [int(value) for value in gathered_lane_gpu.cpu().reshape(-1).tolist()]
    observed_degraded = [int(value) for value in gathered_degraded_gpu.cpu().reshape(-1).tolist()]
    observed_valid = [int(value) for value in gathered_valid_gpu.cpu().reshape(-1).tolist()]

    expected_values = [float(value) for value in gather["featureValues"]]
    expected_presence = [int(value) for value in gather["featurePresence"]]
    expected_lane = [int(value) for value in gather["laneMaskU16"]]
    expected_degraded = [int(value) for value in gather["degradedIdentity"]]

    if observed_presence != expected_presence:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PRESENCE_MISMATCH")
    if observed_lane != expected_lane:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_LANE_MASK_MISMATCH")
    if observed_degraded != expected_degraded:
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_DEGRADED_IDENTITY_MISMATCH")
    if any(value != 1 for value in observed_valid):
        raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_SELECTED_VALID_MASK_MISMATCH")

    deltas = [abs(float(actual) - float(expected)) for actual, expected in zip(observed_values, expected_values, strict=True)]
    max_abs_delta = max(deltas, default=0.0)
    if max_abs_delta != 0.0:
        raise ValueError(f"CANDIDATE_FEATURE_GPU_PARITY_VALUE_MISMATCH:{max_abs_delta}")

    # Prove padded physical rows are masked and zero on the CUDA copy as well.
    if physical_rows > logical_rows:
        padded_values = gpu_values[logical_rows:].cpu()
        padded_presence = gpu_presence[logical_rows:].cpu()
        padded_valid = gpu_valid_mask[logical_rows:].cpu()
        padded_lane = gpu_lane_mask[logical_rows:].cpu()
        padded_degraded = gpu_degraded[logical_rows:].cpu()
        if bool(torch.any(padded_values != 0)):
            raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PADDED_VALUE_NONZERO")
        if bool(torch.any(padded_presence != 0)):
            raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PADDED_PRESENCE_NONZERO")
        if bool(torch.any(padded_valid != 0)):
            raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PADDED_VALID_MASK_NONZERO")
        if bool(torch.any(padded_lane != 0)):
            raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PADDED_LANE_MASK_NONZERO")
        if bool(torch.any(padded_degraded != 0)):
            raise ValueError("CANDIDATE_FEATURE_GPU_PARITY_PADDED_DEGRADED_NONZERO")

    observed_payload = {
        "selectedOrdinals": selected,
        "featureValues": observed_values,
        "featurePresence": observed_presence,
        "laneMaskU16": observed_lane,
        "degradedIdentity": observed_degraded,
    }
    observed_checksum = hashlib.sha256(
        json.dumps(observed_payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).hexdigest()

    return emit(
        {
            **base,
            "status": "CANDIDATE_FEATURE_GPU_PARITY_PROVEN",
            "gpuExecutionObserved": True,
            "torchVersion": getattr(torch, "__version__", "unknown"),
            "cudaVersion": getattr(torch.version, "cuda", None),
            "deviceName": device_name,
            "ordinalParity": True,
            "featureValueParity": True,
            "featurePresenceParity": True,
            "laneMaskParity": True,
            "degradedIdentityParity": True,
            "paddingMaskParity": True,
            "paddingZeroParity": True,
            "maxAbsFeatureDelta": max_abs_delta,
            "observedChecksum": observed_checksum,
            "observed": observed_payload,
        },
        args.output,
        0,
    )


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
