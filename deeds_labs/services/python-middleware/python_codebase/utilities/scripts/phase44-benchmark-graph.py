#!/usr/bin/env python3
"""
Phase 44 - CUDA Graph Replay Benchmark
Measures Tensor Core replay latency for the persisted phase44 tensor store.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
import torch.nn.functional as F


def benchmark_graph(store_path: Path, batch_size: int, runs: int) -> None:
    print("🚀 Phase44 CUDA Graph Replay Benchmark")
    if not store_path.exists():
        raise FileNotFoundError(f"Tensor store not found: {store_path}")

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type != "cuda":
        raise RuntimeError("CUDA device not available; benchmark requires GPU.")

    state = torch.load(store_path, map_location=device)
    vectors: torch.Tensor | None = state.get("vectors")
    if vectors is None:
        raise RuntimeError("No 'vectors' tensor present in the cached store.")

    vectors = vectors.to(device, dtype=torch.float16)
    num_rows = vectors.size(0)
    if num_rows < batch_size:
        batch_size = num_rows
        print(f"⚠️  Requested batch larger than dataset. Using batch_size={batch_size}.")

    static_input = vectors[:batch_size].clone()
    normalized_vectors = F.normalize(vectors, dim=1)
    static_output = torch.empty(
        (batch_size, num_rows), device=device, dtype=torch.float16
    )

    torch.cuda.synchronize()
    graph = torch.cuda.CUDAGraph()
    with torch.cuda.graph(graph):
        q_norm = F.normalize(static_input, dim=1)
        sims = torch.matmul(q_norm, normalized_vectors.T)
        static_output.copy_(sims)

    latencies_ms: list[float] = []
    for _ in range(runs):
        start = torch.cuda.Event(enable_timing=True)
        end = torch.cuda.Event(enable_timing=True)
        start.record()
        graph.replay()
        end.record()
        torch.cuda.synchronize()
        latencies_ms.append(start.elapsed_time(end))

    avg = sum(latencies_ms) / len(latencies_ms)
    p90 = sorted(latencies_ms)[int(0.9 * len(latencies_ms)) - 1]
    print(f"✅ Avg replay latency: {avg:.3f} ms (p90={p90:.3f} ms)")
    print(f"📦 Tensor shape: {tuple(vectors.shape)} dtype={vectors.dtype}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Phase44 CUDA graph replay benchmark.")
    parser.add_argument(
        "--store-path",
        default="logs/phase44-cache.pt",
        help="Path to the persisted tensor store (.pt file).",
    )
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--runs", type=int, default=20)
    args = parser.parse_args()

    benchmark_graph(Path(args.store_path), args.batch_size, args.runs)


if __name__ == "__main__":
    main()
