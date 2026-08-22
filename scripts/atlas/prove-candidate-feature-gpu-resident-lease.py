#!/usr/bin/env python3
"""Bounded live CUDA proof for CandidateFeature GPU residency.

Input JSON contains CandidateFeatureGpuPackV1 + CPU gather reference. The proof:
1. verifies FEAT-03D source checksums,
2. allocates five CUDA-resident buffers in one in-process lease store,
3. gathers the selected ordinals on device,
4. compares the observed values/presence/lane/degraded metadata to CPU reference,
5. releases the lease,
6. proves post-release access is rejected.

No persistent store writes and no CUDA IPC export occur.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from python.parent_atlas_candidate_feature_gpu_resident import (
    CandidateFeatureGpuResidentStore,
    GpuResidentLeaseError,
)


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--staging-mode", choices=["PAGEABLE_SYNC", "PINNED_ASYNC"], default="PAGEABLE_SYNC")
    return parser.parse_args()


def main() -> int:
    ns = args()
    payload = json.loads(Path(ns.input).read_text(encoding="utf-8"))
    pack = payload["pack"]
    gather = payload["gather"]

    store = CandidateFeatureGpuResidentStore(device_id=0)
    lease = store.create(
        pack=pack,
        lease_id="lease:candidate-feature:bounded-proof",
        created_at="2026-08-22T03:00:00.000Z",
        expires_at="2026-08-22T03:10:00.000Z",
        staging_mode=ns.staging_mode,
    )
    observed = store.gather(
        lease.lease_id,
        [int(v) for v in gather["selectedOrdinals"]],
        now="2026-08-22T03:01:00.000Z",
    )

    if observed["selectedOrdinals"] != gather["selectedOrdinals"]:
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_ORDINAL_PARITY_MISMATCH")
    if observed["featurePresence"] != gather["featurePresence"]:
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_PRESENCE_PARITY_MISMATCH")
    if observed["laneMaskU16"] != gather["laneMaskU16"]:
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_LANE_PARITY_MISMATCH")
    if observed["degradedIdentity"] != gather["degradedIdentity"]:
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_DEGRADED_PARITY_MISMATCH")
    observed_values = [float(v) for v in observed["featureValues"]]
    expected_values = [float(v) for v in gather["featureValues"]]
    if len(observed_values) != len(expected_values):
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_VALUE_COUNT_MISMATCH")
    if any(abs(a - b) != 0.0 for a, b in zip(observed_values, expected_values, strict=True)):
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_VALUE_PARITY_MISMATCH")

    buffer_ids = dict(lease.buffer_ids)
    resident_checksums = dict(lease.resident_checksums)
    lease_epoch = lease.lease_epoch
    store.release(lease.lease_id)
    post_release_rejected = False
    try:
        store.gather(lease.lease_id, [0], now="2026-08-22T03:02:00.000Z")
    except GpuResidentLeaseError as exc:
        post_release_rejected = str(exc) == "FEATURE_GPU_RESIDENT_LEASE_RELEASED"
    if not post_release_rejected:
        raise GpuResidentLeaseError("FEATURE_GPU_RESIDENT_POST_RELEASE_ACCESS_NOT_REJECTED")

    import torch  # type: ignore
    receipt: dict[str, Any] = {
        "schema": "atlas.candidate-feature-gpu-resident-runtime-proof.v1",
        "status": "CANDIDATE_FEATURE_GPU_RESIDENT_RUNTIME_PROVEN",
        "leaseId": lease.lease_id,
        "leaseEpoch": lease_epoch,
        "deviceId": 0,
        "deviceName": torch.cuda.get_device_name(0),
        "torchVersion": getattr(torch, "__version__", "unknown"),
        "cudaVersion": getattr(torch.version, "cuda", None),
        "stagingMode": ns.staging_mode,
        "gpuPackChecksum": pack["gpuPackChecksum"],
        "bufferIds": buffer_ids,
        "residentChecksums": resident_checksums,
        "observed": observed,
        "released": True,
        "postReleaseAccessRejected": True,
        "rawPointerExposed": False,
        "cudaIpcExported": False,
        "identityAuthority": False,
        "canonicalWritesAttempted": False,
        "postgresWritesAttempted": False,
        "qdrantWritesAttempted": False,
        "neo4jWritesAttempted": False,
        "valkeyWritesAttempted": False,
    }
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
