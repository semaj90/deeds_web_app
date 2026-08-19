#!/usr/bin/env python3
"""Run Parent Atlas aligned-snapshot experiment v2 and emit proof envelope.

When Qdrant is enabled, a preflight exact-store alignment gate compares Qdrant
`exact=true` Top-K against the frozen PyTorch FP32 exact oracle. HNSW evaluation
is not allowed to proceed when that gate fails, because excellent ANN-vs-local-
exact recall on a stale collection is not evidence that the service matches the
frozen experiment snapshot.
"""

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

from atlas_compute.aligned_snapshot_experiment_v2 import run_aligned_snapshot_experiment_v2
from atlas_compute.gpu_memory import GpuMemorySampler
from atlas_compute.qdrant_exact_alignment import compare_pytorch_and_qdrant_exact
from atlas_compute.semantic_snapshot_freeze import load_and_verify_frozen_snapshot


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def stable_checksum(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--semantic-manifest", required=True)
    parser.add_argument("--spec", required=True)
    parser.add_argument("--output", default="reports/aligned-snapshot-experiment-v2.json")
    parser.add_argument("--envelope", default="reports/aligned-snapshot-proof-envelope-v2.json")
    parser.add_argument("--qdrant-alignment", default="reports/qdrant-exact-alignment.json")
    parser.add_argument("--gpu-device", type=int, default=0)
    args = parser.parse_args()

    semantic_manifest = Path(args.semantic_manifest).resolve()
    spec_path = Path(args.spec).resolve()
    output = Path(args.output).resolve()
    envelope_path = Path(args.envelope).resolve()
    qdrant_alignment_path = Path(args.qdrant_alignment).resolve()

    semantic, manifest = load_and_verify_frozen_snapshot(semantic_manifest)
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    canonical_ids = [str(row["canonical_id"]) for row in manifest["rows"]]
    row_index = {value: index for index, value in enumerate(canonical_ids)}
    query_ids = [str(value) for value in (spec.get("query_canonical_ids") or canonical_ids[: min(32, len(canonical_ids))])]
    if not query_ids or any(value not in row_index for value in query_ids):
        raise ValueError("query IDs must belong to frozen semantic snapshot")
    query_ordinals = [row_index[value] for value in query_ids]
    metric = str(spec.get("metric") or "cosine")
    k = int(spec.get("k") or 10)
    torch_device = str(spec.get("torch_device") or "cpu")

    qdrant_alignment = None
    qdrant_cfg = spec.get("qdrant")
    if isinstance(qdrant_cfg, dict) and qdrant_cfg.get("enabled", False):
        qdrant_alignment = compare_pytorch_and_qdrant_exact(
            semantic,
            canonical_ids,
            query_ordinals,
            metric=metric,
            k=k,
            qdrant=qdrant_cfg,
            torch_device=torch_device,
        )
        qdrant_alignment_path.parent.mkdir(parents=True, exist_ok=True)
        qdrant_alignment_path.write_text(
            json.dumps(qdrant_alignment.to_dict(), indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        if qdrant_alignment.status != "ALIGNED":
            print(json.dumps({
                "status": "BLOCKED_QDRANT_EXACT_STORE_MISMATCH",
                "qdrant_exact_alignment": qdrant_alignment.to_dict(),
                "reason": "HNSW evaluation is blocked until Qdrant exact Top-K aligns with the frozen PyTorch exact oracle.",
            }, indent=2, sort_keys=True))
            return 3

    sampler = GpuMemorySampler(device_index=args.gpu_device).start()
    try:
        receipt = run_aligned_snapshot_experiment_v2(
            semantic_manifest_path=semantic_manifest,
            experiment_spec_path=spec_path,
            output_path=output,
        )
    finally:
        memory_receipt = sampler.stop()

    envelope_without_checksum = {
        "schema": "atlas.aligned-snapshot-proof-envelope.v2",
        "semantic_manifest_path": str(semantic_manifest),
        "semantic_manifest_file_checksum": sha256_file(semantic_manifest),
        "experiment_spec_path": str(spec_path),
        "experiment_spec_file_checksum": sha256_file(spec_path),
        "experiment_output_path": str(output),
        "experiment_output_file_checksum": sha256_file(output),
        "experiment_output_checksum": receipt.output_checksum,
        "qdrant_exact_alignment": qdrant_alignment.to_dict() if qdrant_alignment else None,
        "qdrant_exact_alignment_file": str(qdrant_alignment_path) if qdrant_alignment else None,
        "qdrant_exact_alignment_file_checksum": sha256_file(qdrant_alignment_path) if qdrant_alignment else None,
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
            "semantic_versioned_row_identity_checksum": receipt.semantic_versioned_row_identity_checksum,
            "semantic_canonical_order_checksum": receipt.semantic_canonical_order_checksum,
            "aligned_feature_row_identity_checksum": receipt.aligned_feature_row_identity_checksum,
            "row_count": receipt.row_count,
            "aligned_feature_columns": receipt.aligned_feature_columns,
            "pytorch_cuvs_exact_topk_overlap": receipt.pytorch_cuvs_exact_topk_overlap,
            "pytorch_qdrant_exact_topk_overlap": qdrant_alignment.mean_overlap_at_k if qdrant_alignment else None,
            "cagra_recall_at_k": receipt.cagra_recall_at_k,
            "qdrant_hnsw_best_recall_at_k": receipt.qdrant_hnsw_best_recall_at_k,
            "cuvs_cagra": receipt.stages.get("cuvs_exact_cagra", {}).get("status"),
            "qdrant_hnsw": receipt.stages.get("qdrant_hnsw", {}).get("status"),
            "soft_kmeans": receipt.stages.get("soft_kmeans", {}).get("status"),
            "som": receipt.stages.get("som", {}).get("status"),
            "nary_sparse": receipt.stages.get("nary_sparse", {}).get("status"),
            "ordered_context": receipt.stages.get("ordered_context", {}).get("status"),
            "context_retrieval": receipt.context_retrieval.get("status"),
            "nary_retrieval": receipt.nary_retrieval.get("status"),
        },
        "qdrant_exact_alignment": qdrant_alignment.to_dict() if qdrant_alignment else None,
        "gpu_memory": memory_receipt.to_dict(),
        "proof_envelope": str(envelope_path),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
