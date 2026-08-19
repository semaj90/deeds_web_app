#!/usr/bin/env python3
"""Freeze semantic_768 NDJSON input and compare PyTorch/Triton backends.

Example:
  python python/prove_frozen_semantic_kernel.py \
    --input .tmp/atlas-vector-snapshots/vector-snapshot-5k-turbovec-input.ndjson \
    --snapshot-revision workspace:742 \
    --representation-revision semantic_768:r109

The runner writes only derived artifacts under the requested output directory.
It never mutates Postgres, Qdrant, Neo4j, Redis/Valkey, or canonical relationships.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import platform
import sys
from typing import Any

from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot, load_and_verify_frozen_snapshot
from atlas_compute.torch_kernel_experiment import run_torch_kernel_experiment


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--snapshot-revision", required=True)
    parser.add_argument("--representation-revision", required=True)
    parser.add_argument("--producer-revision", default="frozen-semantic-kernel-proof:v1")
    parser.add_argument("--output-dir", default=".tmp/atlas-frozen-semantic-proof")
    parser.add_argument("--device", default=None)
    parser.add_argument("--scale", type=float, default=0.5)
    parser.add_argument("--force-dynamic", action="store_true")
    parser.add_argument("--force-static", action="store_true")
    args = parser.parse_args()

    if args.force_dynamic and args.force_static:
        raise SystemExit("choose at most one of --force-dynamic/--force-static")
    compile_dynamic = True if args.force_dynamic else False if args.force_static else None

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    tensor_path = out / "semantic_768.npy"
    manifest_path = out / "semantic_768.snapshot.json"
    receipt_path = out / "torch-kernel-experiment.json"
    proof_path = out / "frozen-semantic-kernel-proof.json"

    frozen = freeze_semantic_snapshot(
        args.input,
        tensor_path=tensor_path,
        manifest_path=manifest_path,
        snapshot_revision=args.snapshot_revision,
        representation_revision=args.representation_revision,
        producer_revision=args.producer_revision,
    )
    matrix, manifest = load_and_verify_frozen_snapshot(manifest_path)
    kernel = run_torch_kernel_experiment(
        input_matrix=matrix,
        scale=args.scale,
        device=args.device,
        compile_dynamic=compile_dynamic,
    )
    receipt_path.write_text(json.dumps(kernel.to_dict(), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    backend_results = {measurement.backend: measurement for measurement in kernel.measurements}
    eager = backend_results["pytorch_eager"]
    required = ["pytorch_eager", "torch_compile_inductor"]
    cuda_challengers = [name for name in ("triton_jit", "torch_library_triton_op") if name in backend_results]
    parity_failures = [
        name for name in required + cuda_challengers
        if not backend_results[name].available or not backend_results[name].passed_parity
    ]

    proof: dict[str, Any] = {
        "schema": "atlas.frozen-semantic-kernel-proof.v1",
        "status": "PASS" if not parity_failures else "DEGRADED",
        "snapshot": {
            "snapshot_revision": manifest["snapshot_revision"],
            "representation_revision": manifest["representation_revision"],
            "representation": manifest["representation"],
            "dimensions": manifest["dimensions"],
            "row_count": manifest["row_count"],
            "tensor_checksum": manifest["tensor_checksum"],
            "row_identity_checksum": manifest["row_identity_checksum"],
        },
        "execution": {
            "operation": kernel.operation,
            "shape": kernel.shape,
            "shape_policy": kernel.shape_policy,
            "source_tensor_checksum": kernel.source_tensor_checksum,
            "reference_checksum": kernel.reference_checksum,
            "backends": [asdict(measurement) for measurement in kernel.measurements],
        },
        "gates": {
            "FROZEN_SNAPSHOT_VERIFIED": "PASS",
            "SOURCE_CHECKSUM_MATCHES_EXECUTION": "PASS" if kernel.source_tensor_checksum == manifest["tensor_checksum"] else "FAIL",
            "PYTORCH_EAGER_REFERENCE": "PASS" if eager.passed_parity else "FAIL",
            "INDUCTOR_PARITY": "PASS" if backend_results["torch_compile_inductor"].available and backend_results["torch_compile_inductor"].passed_parity else "FAIL",
            "TRITON_JIT_PARITY": (
                "PASS" if backend_results.get("triton_jit") and backend_results["triton_jit"].available and backend_results["triton_jit"].passed_parity
                else "NOT_AVAILABLE_OR_FAIL"
            ),
            "TRITON_OP_PARITY": (
                "PASS" if backend_results.get("torch_library_triton_op") and backend_results["torch_library_triton_op"].available and backend_results["torch_library_triton_op"].passed_parity
                else "NOT_AVAILABLE_OR_FAIL"
            ),
        },
        "environment": {
            "python": sys.version,
            "platform": platform.platform(),
        },
        "canonical_authority": False,
    }
    if proof["gates"]["SOURCE_CHECKSUM_MATCHES_EXECUTION"] != "PASS":
        proof["status"] = "FAIL"
    proof_path.write_text(json.dumps(proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2, sort_keys=True))
    return 0 if proof["status"] == "PASS" else 2


if __name__ == "__main__":
    raise SystemExit(main())
