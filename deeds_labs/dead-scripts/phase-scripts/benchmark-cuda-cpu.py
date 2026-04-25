#!/usr/bin/env python3
"""
Phase 89: CUDA vs CPU Benchmark
Compare tensor operations for cosine similarity calculations
"""

import time
import numpy as np
from typing import Tuple

# Try CUDA
try:
    import cupy as cp
    CUDA_AVAILABLE = True
except ImportError:
    CUDA_AVAILABLE = False

def generate_test_data(num_docs: int = 10000, dim: int = 768) -> Tuple[np.ndarray, np.ndarray]:
    """Generate random test vectors"""
    np.random.seed(42)
    query = np.random.randn(dim).astype(np.float32)
    docs = np.random.randn(num_docs, dim).astype(np.float32)
    return query, docs

def cosine_similarity_cpu(query: np.ndarray, docs: np.ndarray) -> np.ndarray:
    """CPU-based cosine similarity"""
    # Normalize
    query_norm = query / np.linalg.norm(query)
    docs_norm = docs / np.linalg.norm(docs, axis=1, keepdims=True)

    # Dot product
    similarities = np.dot(docs_norm, query_norm)
    return similarities

def cosine_similarity_cuda(query: np.ndarray, docs: np.ndarray) -> np.ndarray:
    """CUDA-accelerated cosine similarity"""
    if not CUDA_AVAILABLE:
        raise RuntimeError("CUDA not available")

    # Transfer to GPU
    query_gpu = cp.asarray(query)
    docs_gpu = cp.asarray(docs)

    # Normalize
    query_norm = query_gpu / cp.linalg.norm(query_gpu)
    docs_norm = docs_gpu / cp.linalg.norm(docs_gpu, axis=1, keepdims=True)

    # Dot product
    similarities = cp.dot(docs_norm, query_norm)

    # Transfer back
    return cp.asnumpy(similarities)

def benchmark_cpu(query: np.ndarray, docs: np.ndarray, iterations: int = 10) -> dict:
    """Benchmark CPU performance"""
    times = []

    # Warmup
    _ = cosine_similarity_cpu(query, docs)

    # Benchmark
    for _ in range(iterations):
        start = time.perf_counter()
        result = cosine_similarity_cpu(query, docs)
        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    return {
        "mean_ms": np.mean(times),
        "std_ms": np.std(times),
        "min_ms": np.min(times),
        "max_ms": np.max(times),
        "throughput": (len(docs) / (np.mean(times) / 1000))
    }

def benchmark_cuda(query: np.ndarray, docs: np.ndarray, iterations: int = 10) -> dict:
    """Benchmark CUDA performance"""
    if not CUDA_AVAILABLE:
        return None

    times = []
    transfer_times = []
    compute_times = []

    # Warmup
    _ = cosine_similarity_cuda(query, docs)

    # Benchmark
    for _ in range(iterations):
        # Transfer time
        transfer_start = time.perf_counter()
        query_gpu = cp.asarray(query)
        docs_gpu = cp.asarray(docs)
        transfer_elapsed = (time.perf_counter() - transfer_start) * 1000
        transfer_times.append(transfer_elapsed)

        # Compute time
        compute_start = time.perf_counter()
        query_norm = query_gpu / cp.linalg.norm(query_gpu)
        docs_norm = docs_gpu / cp.linalg.norm(docs_gpu, axis=1, keepdims=True)
        similarities = cp.dot(docs_norm, query_norm)
        cp.cuda.Stream.null.synchronize()  # Wait for GPU
        compute_elapsed = (time.perf_counter() - compute_start) * 1000
        compute_times.append(compute_elapsed)

        # Total time (including transfer back)
        start = time.perf_counter()
        result = cosine_similarity_cuda(query, docs)
        total_elapsed = (time.perf_counter() - start) * 1000
        times.append(total_elapsed)

    return {
        "mean_ms": np.mean(times),
        "std_ms": np.std(times),
        "min_ms": np.min(times),
        "max_ms": np.max(times),
        "transfer_ms": np.mean(transfer_times),
        "compute_ms": np.mean(compute_times),
        "throughput": (len(docs) / (np.mean(times) / 1000))
    }

def main():
    print("\n🔬 Phase 89: CUDA vs CPU Benchmark")
    print("=" * 60)

    # Test configurations
    configs = [
        {"num_docs": 100, "dim": 768, "name": "Small (100 docs)"},
        {"num_docs": 1000, "dim": 768, "name": "Medium (1K docs)"},
        {"num_docs": 10000, "dim": 768, "name": "Large (10K docs)"},
        {"num_docs": 50000, "dim": 768, "name": "Extra Large (50K docs)"}
    ]

    for config in configs:
        print(f"\n📊 {config['name']} - {config['dim']}D vectors")
        print("-" * 60)

        # Generate data
        query, docs = generate_test_data(config["num_docs"], config["dim"])
        print(f"   Generated {len(docs):,} documents")

        # CPU Benchmark
        print("\n   🖥️  CPU Performance:")
        cpu_stats = benchmark_cpu(query, docs)
        print(f"      Mean:       {cpu_stats['mean_ms']:.2f} ms")
        print(f"      Std Dev:    {cpu_stats['std_ms']:.2f} ms")
        print(f"      Min:        {cpu_stats['min_ms']:.2f} ms")
        print(f"      Max:        {cpu_stats['max_ms']:.2f} ms")
        print(f"      Throughput: {cpu_stats['throughput']:.0f} docs/sec")

        # CUDA Benchmark
        if CUDA_AVAILABLE:
            print("\n   🚀 CUDA Performance:")
            cuda_stats = benchmark_cuda(query, docs)
            print(f"      Mean:       {cuda_stats['mean_ms']:.2f} ms")
            print(f"      Std Dev:    {cuda_stats['std_ms']:.2f} ms")
            print(f"      Min:        {cuda_stats['min_ms']:.2f} ms")
            print(f"      Max:        {cuda_stats['max_ms']:.2f} ms")
            print(f"      Transfer:   {cuda_stats['transfer_ms']:.2f} ms")
            print(f"      Compute:    {cuda_stats['compute_ms']:.2f} ms")
            print(f"      Throughput: {cuda_stats['throughput']:.0f} docs/sec")

            # Speedup
            speedup = cpu_stats['mean_ms'] / cuda_stats['mean_ms']
            print(f"\n   ⚡ Speedup: {speedup:.2f}x faster with CUDA")

            # Efficiency
            if speedup > 1:
                print(f"   ✅ CUDA wins for {config['name']}")
            else:
                print(f"   ⚠️  CPU faster (overhead dominates for small datasets)")
        else:
            print("\n   ⚠️  CUDA not available")

    # Summary
    print("\n" + "=" * 60)
    print("📈 Benchmark Summary:")
    if CUDA_AVAILABLE:
        print("   ✅ CUDA acceleration available")
        print("   💡 Recommendation: Use CUDA for queries with >1000 candidates")
        print("   💡 Use CPU for small top-K queries (<100 candidates)")
    else:
        print("   ⚠️  CUDA not available - using CPU only")
        print("   💡 Install cupy-cuda12x for GPU acceleration")
    print()

if __name__ == "__main__":
    main()
