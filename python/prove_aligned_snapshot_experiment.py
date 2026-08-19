#!/usr/bin/env python3
"""Run the single Parent Atlas aligned-snapshot experiment and emit proof envelope."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
PYTHON_ROOT = ROOT / "python"
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_compute.aligned_snapshot_experiment import run_aligned_snapshot_experiment
from atlas_compute.gpu_memory import GpuMemorySampler


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stable_checksum(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--semantic-manifest", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--output", default="reports/aligned-snapshot-experiment.json")
    parser.add_argument("--envelope", default="reports/aligned-snapshot-proof-envelope.json")
    parser.add_argument("--gpu-device", type=int, default=0)
    args = parser.parse_args()

    semantic_manifest = Path(args.semantic_manifest).resolve()
    spec = Path(args.spec).resolve()
    output = Path(args.output).resolve()
    envelope_path = Path(args.envelope).resolve()

    sampler = GpuMemorySampler(device_index=args.gpu_device).start()
    try:
        receipt = run_aligned_snapshot_experiment(
            semantic_manifest_path=semantic_manifest,
            experiment_spec_path=spec,
            output_path=output,
        )
    finally:
        memory_receipt = sampler.stop()

    experiment = receipt.to_dict()
    envelope_without_checksum = {
        "schema": "atlas.aligned-snapshot-proof-envelope.v1",
        "semantic_manifest_path": str(semantic_manifest),
        "semantic_manifest_file_checksum": sha256_file(semantic_manifest),
        "experiment_spec_path": str(spec),
        "experiment_spec_file_checksum": sha256_file(spec),
        "experiment_output_path": str(output),
        "experiment_output_file_checksum": sha256_file(output),
        "experiment_output_checksum": receipt.output_checksum,
        "gpu_memory": memory_receipt.to_dict(),
        "canonical_authority": False,
    }
    envelope = {
        **envelope_without_checksum,
        "envelope_checksum": stable_checksum(envelope_without_checksum),
    }
    envelope_path.parent.mkdir(parents=True, exist_ok=True)
    envelope_path.write_text(json.dumps(envelope, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    summary = {
        "experiment": {
            "output_checksum": receipt.output_checksum,
            "aligned_feature_matrix_checksum": receipt.aligned_feature_matrix_checksum,
            "row_count": receipt.row_count,
            "aligned_feature_columns": receipt.aligned_feature_columns,
            "cuvs_cagra": receipt.stages.get("cuvs_cagra", {}).get("status"),
            "qdrant_hnsw": receipt.stages.get("qdrant_hnsw", {}).get("status"),
            "soft_kmeans": receipt.stages.get("soft_kmeans", {}).get("status"),
            "som": receipt.stages.get("som", {}).get("status"),
            "nary_sparse": receipt.stages.get("nary_sparse", {}).get("status"),
            "context_retrieval": receipt.context_retrieval.get("status"),
            "nary_retrieval": receipt.nary_retrieval.get("status"),
        },
        "gpu_memory": memory_receipt.to_dict(),
        "proof_envelope": str(envelope_path),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
