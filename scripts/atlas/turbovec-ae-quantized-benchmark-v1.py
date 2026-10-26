#!/usr/bin/env python3
"""Quantized Challenger Comparison Benchmark (v1)

Compares retrieval recall@10, set overlap, MRR, and query latency across:
1. Exact 768-d cosine (ground truth)
2. MRL 128-d float32 baseline
3. TurboVec 128-d 4-bit AVX2 challenger
4. Latent Autoencoder 128-d bottleneck
5. MRL 64-d float32 baseline
6. TurboVec 64-d 4-bit AVX2 challenger
7. Live TurboVec Sidecar (:8791 HTTP) roundtrip latency

Safety & Invariants:
- Read-only, CPU-only (CUDA_VISIBLE_DEVICES="").
- Does not mutate databases, Qdrant, or files.
- Writes only the output JSON report receipt if requested.
- canonicalAuthority: false, diagnosticOnly: true.
"""

from __future__ import annotations

import os

os.environ["CUDA_VISIBLE_DEVICES"] = ""  # Force CPU; GPU reserved for active services

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import requests
import torch
import torch.nn as nn
import torch.nn.functional as F

try:
    import turbovec
    TURBOVEC_AVAILABLE = True
except ImportError:
    TURBOVEC_AVAILABLE = False

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MATRIX = ROOT / "docs" / "reports" / "semantic768" / "frozen_semantic_768_v4_matrix.f32bin"
DEFAULT_CHECKPOINT = ROOT / "models" / "nested-semantic-autoencoder" / "nested_semantic_autoencoder_v3_full01.pt"
DEFAULT_RECEIPT = ROOT / "docs" / "reports" / "turbovec-ae-quantized-benchmark-receipt-v1.json"


class LegacyV3AE(nn.Module):
    """Historical v3 AE architecture (768 -> 384 -> 256; 128 is prefix slice)."""
    def __init__(self) -> None:
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(768, 384), nn.GELU(), nn.Linear(384, 256), nn.LayerNorm(256)
        )

    def encode(self, x: torch.Tensor):
        l256 = F.normalize(self.encoder(x), p=2, dim=-1)
        l128 = F.normalize(l256[:, :128], p=2, dim=-1)
        l64 = F.normalize(l128[:, :64], p=2, dim=-1)
        return l256, l128, l64


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_matrix(path: Path) -> torch.Tensor:
    if not path.is_file():
        raise FileNotFoundError(f"Matrix file not found: {path}")
    raw = np.fromfile(path, dtype="<f4")
    if raw.size % 768 != 0:
        raise ValueError(f"Matrix size {raw.size} is not divisible by 768")
    return torch.from_numpy(raw.reshape(-1, 768).copy())


def benchmark_live_sidecar(url: str, queries_np: np.ndarray, k: int = 10) -> dict:
    try:
        health_resp = requests.get(f"{url}/health", timeout=3)
        if health_resp.status_code != 200:
            return {"status": "UNHEALTHY", "statusCode": health_resp.status_code}
        health = health_resp.json()
    except Exception as e:
        return {"status": "UNREACHABLE", "error": str(e)}

    # Benchmark 20 queries for HTTP latency
    latencies_ms = []
    sample_queries = queries_np[:20]
    for q in sample_queries:
        t0 = time.perf_counter()
        try:
            resp = requests.post(
                f"{url}/search",
                json={"vector": q.tolist(), "k": k},
                headers={"Content-Type": "application/json"},
                timeout=5,
            )
            dt = (time.perf_counter() - t0) * 1000.0
            if resp.status_code == 200:
                latencies_ms.append(dt)
        except Exception:
            pass

    return {
        "status": "HEALTHY",
        "health": health,
        "sampleQueriesTested": len(latencies_ms),
        "meanHttpLatencyMs": round(float(np.mean(latencies_ms)), 3) if latencies_ms else None,
        "medianHttpLatencyMs": round(float(np.median(latencies_ms)), 3) if latencies_ms else None,
        "p95HttpLatencyMs": round(float(np.percentile(latencies_ms, 95)), 3) if latencies_ms else None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--matrix", type=Path, default=DEFAULT_MATRIX)
    parser.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--queries", type=int, default=500)
    parser.add_argument("--seed", type=int, default=684453)
    parser.add_argument("--sidecar-url", type=str, default="http://127.0.0.1:8791")
    parser.add_argument("--out", type=Path, default=DEFAULT_RECEIPT)
    args = parser.parse_args()

    print(f"\n=======================================================")
    print(f"  QUANTIZED CHALLENGER COMPARISON BENCHMARK (v1)")
    print(f"=======================================================")
    print(f"Loading frozen matrix: {args.matrix} ...")
    x = load_matrix(args.matrix)
    n_rows = len(x)
    print(f"Matrix loaded: {n_rows} rows x 768 dims")

    # L2 normalize full 768 vectors
    xn = F.normalize(x, p=2, dim=-1)

    # Select evaluation query indices
    gen = torch.Generator().manual_seed(args.seed)
    query_indices = torch.randperm(n_rows, generator=gen)[: args.queries]
    q_rows = torch.arange(len(query_indices))

    print(f"Computing exact 768-d ground truth for {args.queries} queries...")
    t0 = time.perf_counter()
    exact_sims = xn[query_indices] @ xn.T
    exact_sims[q_rows, query_indices] = -2.0  # Exclude self
    exact_top_vals, exact_top_idx = exact_sims.topk(10, dim=1)
    exact_kth = exact_top_vals[:, -1]
    exact_duration = time.perf_counter() - t0
    exact_latency_us = (exact_duration / args.queries) * 1e6
    print(f"Exact 768-d ground truth computed in {exact_duration:.2f}s ({exact_latency_us:.1f} us/query)")

    results = {}

    # 1. Exact 768 Baseline
    results["exact_768"] = {
        "dim": 768,
        "format": "float32",
        "recall10_tie_aware": 1.0,
        "recall10_set_overlap": 1.0,
        "mrr_of_exact_top1": 1.0,
        "latency_us_per_query": round(exact_latency_us, 1),
    }

    # 2. MRL 128-d (Float32)
    print("\nEvaluating MRL 128-d (Float32)...")
    mrl128 = F.normalize(xn[:, :128], p=2, dim=-1)
    t0 = time.perf_counter()
    s_mrl128 = mrl128[query_indices] @ mrl128.T
    s_mrl128[q_rows, query_indices] = -2.0
    got_mrl128 = s_mrl128.topk(10, dim=1).indices
    mrl128_duration = time.perf_counter() - t0
    mrl128_latency_us = (mrl128_duration / args.queries) * 1e6

    overlap = tie = mrr = 0.0
    for i in range(len(query_indices)):
        g = got_mrl128[i]
        overlap += len(set(g.tolist()) & set(exact_top_idx[i].tolist())) / 10
        tie += float((exact_sims[i, g] >= exact_kth[i] - 1e-6).float().mean())
        pos = (g == exact_top_idx[i, 0]).nonzero()
        mrr += 1.0 / (1 + int(pos[0])) if len(pos) else 0.0

    n_q = len(query_indices)
    results["mrl_128_float32"] = {
        "dim": 128,
        "format": "float32",
        "recall10_tie_aware": round(tie / n_q, 4),
        "recall10_set_overlap": round(overlap / n_q, 4),
        "mrr_of_exact_top1": round(mrr / n_q, 4),
        "latency_us_per_query": round(mrl128_latency_us, 1),
    }

    # 3. TurboVec 128-d (4-bit AVX2)
    if TURBOVEC_AVAILABLE:
        print("\nBuilding in-process TurboVec 128-d (4-bit AVX2) index...")
        mrl128_np = mrl128.numpy()
        tv_index128 = turbovec.TurboQuantIndex(128, 4)
        t_build0 = time.perf_counter()
        tv_index128.add(mrl128_np)
        build_time = time.perf_counter() - t_build0
        print(f"TurboVec 128-d index built in {build_time:.3f}s for {n_rows} vectors")

        print("Searching TurboVec 128-d index...")
        queries128_np = mrl128_np[query_indices.numpy()]
        t0 = time.perf_counter()
        tv_scores, tv_indices = tv_index128.search(queries128_np, k=10)
        tv128_duration = time.perf_counter() - t0
        tv128_latency_us = (tv128_duration / args.queries) * 1e6

        overlap = tie = mrr = 0.0
        for i in range(len(query_indices)):
            g_list = [int(idx) for idx in tv_indices[i] if idx != query_indices[i].item()][:10]
            # Pad if self was removed
            if len(g_list) < 10 and len(tv_indices[i]) > 10:
                g_list.append(int(tv_indices[i][10]))
            overlap += len(set(g_list) & set(exact_top_idx[i].tolist())) / 10
            g_t = torch.tensor(g_list, dtype=torch.long)
            tie += float((exact_sims[i, g_t] >= exact_kth[i] - 1e-6).float().mean())
            if exact_top_idx[i, 0].item() in g_list:
                pos = g_list.index(exact_top_idx[i, 0].item())
                mrr += 1.0 / (1 + pos)

        results["turbovec_128_4bit_avx2"] = {
            "dim": 128,
            "format": "uint4_avx2",
            "recall10_tie_aware": round(tie / n_q, 4),
            "recall10_set_overlap": round(overlap / n_q, 4),
            "mrr_of_exact_top1": round(mrr / n_q, 4),
            "latency_us_per_query": round(tv128_latency_us, 1),
            "index_build_sec": round(build_time, 3),
        }
    else:
        results["turbovec_128_4bit_avx2"] = {"error": "turbovec wheel not installed in interpreter"}

    # 4. Latent Autoencoder 128-d Bottleneck
    if args.checkpoint.is_file():
        print(f"\nEvaluating Latent Autoencoder 128-d (checkpoint: {args.checkpoint.name})...")
        model = LegacyV3AE()
        ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=True)
        sd = ckpt.get("model_state_dict", ckpt)
        # Filter encoder weights
        encoder_sd = {k: v for k, v in sd.items() if k.startswith("encoder.")}
        model.load_state_dict(encoder_sd, strict=False)
        model.eval()

        with torch.no_grad():
            _, ae128, _ = model.encode(xn)
            t0 = time.perf_counter()
            s_ae128 = ae128[query_indices] @ ae128.T
            s_ae128[q_rows, query_indices] = -2.0
            got_ae128 = s_ae128.topk(10, dim=1).indices
            ae128_duration = time.perf_counter() - t0
            ae128_latency_us = (ae128_duration / args.queries) * 1e6

            overlap = tie = mrr = 0.0
            for i in range(len(query_indices)):
                g = got_ae128[i]
                overlap += len(set(g.tolist()) & set(exact_top_idx[i].tolist())) / 10
                tie += float((exact_sims[i, g] >= exact_kth[i] - 1e-6).float().mean())
                pos = (g == exact_top_idx[i, 0]).nonzero()
                mrr += 1.0 / (1 + int(pos[0])) if len(pos) else 0.0

            results["autoencoder_128_latent"] = {
                "dim": 128,
                "format": "float32",
                "recall10_tie_aware": round(tie / n_q, 4),
                "recall10_set_overlap": round(overlap / n_q, 4),
                "mrr_of_exact_top1": round(mrr / n_q, 4),
                "latency_us_per_query": round(ae128_latency_us, 1),
                "checkpoint": args.checkpoint.name,
            }

    # 5. MRL 64-d & TurboVec 64-d
    print("\nEvaluating MRL 64-d and TurboVec 64-d...")
    mrl64 = F.normalize(xn[:, :64], p=2, dim=-1)
    s_mrl64 = mrl64[query_indices] @ mrl64.T
    s_mrl64[q_rows, query_indices] = -2.0
    got_mrl64 = s_mrl64.topk(10, dim=1).indices

    overlap = tie = mrr = 0.0
    for i in range(len(query_indices)):
        g = got_mrl64[i]
        overlap += len(set(g.tolist()) & set(exact_top_idx[i].tolist())) / 10
        tie += float((exact_sims[i, g] >= exact_kth[i] - 1e-6).float().mean())
        pos = (g == exact_top_idx[i, 0]).nonzero()
        mrr += 1.0 / (1 + int(pos[0])) if len(pos) else 0.0

    results["mrl_64_float32"] = {
        "dim": 64,
        "format": "float32",
        "recall10_tie_aware": round(tie / n_q, 4),
        "recall10_set_overlap": round(overlap / n_q, 4),
        "mrr_of_exact_top1": round(mrr / n_q, 4),
    }

    if TURBOVEC_AVAILABLE:
        mrl64_np = mrl64.numpy()
        tv_index64 = turbovec.TurboQuantIndex(64, 4)
        tv_index64.add(mrl64_np)
        queries64_np = mrl64_np[query_indices.numpy()]
        _, tv_indices64 = tv_index64.search(queries64_np, k=10)

        overlap = tie = mrr = 0.0
        for i in range(len(query_indices)):
            g_list = [int(idx) for idx in tv_indices64[i] if idx != query_indices[i].item()][:10]
            if len(g_list) < 10 and len(tv_indices64[i]) > 10:
                g_list.append(int(tv_indices64[i][10]))
            overlap += len(set(g_list) & set(exact_top_idx[i].tolist())) / 10
            g_t = torch.tensor(g_list, dtype=torch.long)
            tie += float((exact_sims[i, g_t] >= exact_kth[i] - 1e-6).float().mean())
            if exact_top_idx[i, 0].item() in g_list:
                pos = g_list.index(exact_top_idx[i, 0].item())
                mrr += 1.0 / (1 + pos)

        results["turbovec_64_4bit_avx2"] = {
            "dim": 64,
            "format": "uint4_avx2",
            "recall10_tie_aware": round(tie / n_q, 4),
            "recall10_set_overlap": round(overlap / n_q, 4),
            "mrr_of_exact_top1": round(mrr / n_q, 4),
        }

    # 6. Live Sidecar Benchmark
    print(f"\nProbing live TurboVec sidecar on {args.sidecar_url} ...")
    queries_full_np = xn[query_indices].numpy()
    sidecar_metrics = benchmark_live_sidecar(args.sidecar_url, queries_full_np, k=10)

    # Print summary table
    print("\n" + "=" * 80)
    print(f"{'Method':<28} | {'Dim':<4} | {'Format':<10} | {'Recall@10 (Tie)':<16} | {'MRR@1':<8} | {'Latency':<12}")
    print("-" * 80)
    for k, v in results.items():
        dim = str(v.get("dim", "-"))
        fmt = str(v.get("format", "-"))
        rec = f"{v.get('recall10_tie_aware', 0.0):.4f}" if "recall10_tie_aware" in v else "N/A"
        mrr = f"{v.get('mrr_of_exact_top1', 0.0):.4f}" if "mrr_of_exact_top1" in v else "N/A"
        lat = f"{v.get('latency_us_per_query', 0.0):.1f} us" if "latency_us_per_query" in v else "-"
        print(f"{k:<28} | {dim:<4} | {fmt:<10} | {rec:<16} | {mrr:<8} | {lat:<12}")
    print("=" * 80)

    # Construct final receipt
    receipt = {
        "schema": "atlas.turbovec-ae-quantized-benchmark.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "readOnly": True,
        "writesPerformed": False,
        "canonicalAuthority": False,
        "diagnosticOnly": True,
        "matrix": {
            "path": str(args.matrix),
            "rows": n_rows,
            "sha256": sha256_file(args.matrix),
        },
        "queryCohort": {
            "queries": args.queries,
            "seed": args.seed,
            "selfExcluded": True,
        },
        "benchmarks": results,
        "liveSidecar": sidecar_metrics,
    }

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        with open(args.out, "w", encoding="utf8") as f:
            json.dump(receipt, f, indent=2)
        print(f"\nReceipt written to: {args.out}")

    return 0


if __name__ == "__main__":
    main()
