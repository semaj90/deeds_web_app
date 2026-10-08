#!/usr/bin/env python3
"""Read-only CPU/GPU feature parity preflight. No CUDA allocation by default.

Exit 0 only when all requested gates pass. --device cuda requires a real CUDA
backend; never falls back to CPU. Synthetic fixtures are not retrieval proof.
"""
from __future__ import annotations
import argparse
import json
import platform
import sys
from pathlib import Path

def probe(device: str, *, max_gpu_mb: int) -> dict:
    import numpy as np
    from atlas_compute.ranking_alignment_v1 import align_rows, manifest_digest
    from atlas_compute.ranking_feature_layout_v2 import LAYOUT, encode_cpu
    fixture = []
    for i in range(4):
        fixture.append(dict(qid=f"fixture-q{i//2}", packet_key=f"fixture-{i}", label=float(i%2),
            source_revision="source-1",workspace_revision="workspace-1",
            representation_revision="rep-1",revision_status="PROVEN",
            exact_symbol_match=float(i % 2),semantic_similarity=float(i)/4,
            pagerank=0.1,hyperedge_overlap=None))
    rows = align_rows(fixture)
    vals, mask, x = encode_cpu(rows)
    result = dict(schema="atlas.ranking-cpu-gpu-parity.v2", fixture_only=True,
        authority="NON_AUTHORITATIVE", device_requested=device, checks=[],
        feature_count=len(LAYOUT.feature_names), scoring_width=LAYOUT.scoring_width,
        matrix_shape=list(x.shape), dataset_checksum=manifest_digest(rows),
        numpy_version=np.__version__, platform=platform.platform(),
        gpu_executed=False, writes_performed=False)
    assert x.shape == (4, 16)
    assert np.array_equal(mask[:, 5], np.ones(4, dtype=np.uint8))
    assert np.array_equal(x[:, 8:], mask.astype(np.float32))
    result["checks"].append("CPU_LAYOUT_PASS")
    if device == "cuda":
        import torch
        result["torch_version"] = torch.__version__
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA_DEVICE_UNAVAILABLE_NO_FALLBACK")
        free, total = torch.cuda.mem_get_info()
        result["gpu_free_bytes"] = int(free)
        result["gpu_total_bytes"] = int(total)
        # Reserve an explicit safety margin; never evict resident models.
        if free < (max_gpu_mb + 256) * 1024 * 1024:
            raise RuntimeError("CUDA_VRAM_BUDGET_UNAVAILABLE")
        if x.nbytes > max_gpu_mb * 1024 * 1024:
            raise RuntimeError("CUDA_MATRIX_OVER_BUDGET")
        before = torch.cuda.memory_allocated()
        try:
            gpu = torch.as_tensor(x, device="cuda:0")
            cpu_back = gpu.cpu().numpy()
            if not np.array_equal(cpu_back, x):
                raise RuntimeError("CUDA_FEATURE_PARITY_FAIL")
            result["gpu_executed"] = True
            result["checks"].append("CUDA_LAYOUT_COPY_PARITY_PASS")
            result["gpu_name"] = torch.cuda.get_device_name(0)
            result["allocated_delta_bytes"] = max(0,int(torch.cuda.memory_allocated()-before))
            del gpu
        finally:
            torch.cuda.empty_cache()
    else:
        result["checks"].append("GPU_NOT_REQUESTED")
    return result

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--device", choices=("cpu","cuda"), default="cpu")
    ap.add_argument("--max-gpu-mb",type=int,default=64)
    ap.add_argument("--output",type=Path)
    a=ap.parse_args()
    if not 1 <= a.max_gpu_mb <= 512:
        ap.error("max-gpu-mb must be 1..512")
    try:
        result=probe(a.device,max_gpu_mb=a.max_gpu_mb)
        result["status"]="PASS"
        code=0
    except Exception as exc:
        result=dict(schema="atlas.ranking-cpu-gpu-parity.v2",device_requested=a.device,
            status="FAIL",error=f"{type(exc).__name__}:{exc}",
            gpu_executed=False,writes_performed=False,fixture_only=True)
        code=1
    print(json.dumps(result,sort_keys=True))
    if a.output:
        a.output.parent.mkdir(parents=True,exist_ok=True)
        a.output.write_text(json.dumps(result,indent=2,sort_keys=True)+"\n",encoding="utf8")
    return code

if __name__=="__main__":
    sys.exit(main())
