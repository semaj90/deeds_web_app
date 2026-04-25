#!/usr/bin/env python3
"""
Phase 89: CUDA vs CPU Benchmark (PyTorch Version)

Uses PyTorch instead of CuPy for better Windows compatibility.
Your .venv already has PyTorch 2.9.0+cu128 installed.

Usage:
    python scripts/benchmark-cuda-pytorch.py
    # Or with your venv:
    .venv\\Scripts\\python.exe scripts/benchmark-cuda-pytorch.py
"""

import sys
import os

# Fix Windows console encoding
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except:
        pass

import time
from typing import Tuple

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    print("❌ PyTorch not available")
    print("   Install with: pip install torch")
    sys.exit(1)

# Check CUDA availability
CUDA_AVAILABLE = torch.cuda.is_available()


def get_device_info():
    """Print CUDA device information"""
    print("\n📊 Device Information:")
    print("-" * 60)

    if CUDA_AVAILABLE:
        device_count = torch.cuda.device_count()
        print(f"   ✅ CUDA devices: {device_count}")

        for i in range(device_count):
            props = torch.cuda.get_device_properties(i)
            print(f"\n   Device [{i}]: {props.name}")
            print(f"      Compute Capability: {props.major}.{props.minor}")
            print(f"      Total Memory: {props.total_memory / (1024**3):.2f} GB")
            print(f"      Multi-Processors: {props.multi_processor_count}")

        print(f"\n   Current Device: {torch.cuda.current_device()}")
        print(f"   PyTorch CUDA Version: {torch.version.cuda}")
    else:
        print("   ⚠️  No CUDA devices available")
        print("   Running CPU-only benchmarks")

    print(f"   PyTorch Version: {torch.__version__}")
    print()


def generate_test_data(num_docs: int = 10000, dim: int = 768, device: str = "cpu") -> Tuple[torch.Tensor, torch.Tensor]:
    """Generate random test vectors on specified device"""
    torch.manual_seed(42)
    query = torch.randn(dim, dtype=torch.float32, device=device)
    docs = torch.randn(num_docs, dim, dtype=torch.float32, device=device)
    return query, docs


def cosine_similarity(query: torch.Tensor, docs: torch.Tensor) -> torch.Tensor:
    """Compute cosine similarity using PyTorch"""
    # Normalize
    query_norm = query / query.norm()
    docs_norm = docs / docs.norm(dim=1, keepdim=True)

    # Dot product
    similarities = torch.mv(docs_norm, query_norm)
    return similarities


def benchmark(device: str, num_docs: int, dim: int, iterations: int = 10) -> dict:
    """Benchmark cosine similarity on specified device"""
    # Generate data on device
    query, docs = generate_test_data(num_docs, dim, device)

    # Warmup
    _ = cosine_similarity(query, docs)
    if device == "cuda":
        torch.cuda.synchronize()

    times = []
    for _ in range(iterations):
        start = time.perf_counter()
        result = cosine_similarity(query, docs)

        if device == "cuda":
            torch.cuda.synchronize()

        elapsed = (time.perf_counter() - start) * 1000
        times.append(elapsed)

    return {
        "mean_ms": sum(times) / len(times),
        "std_ms": (sum((t - sum(times)/len(times))**2 for t in times) / len(times)) ** 0.5,
        "min_ms": min(times),
        "max_ms": max(times),
        "throughput": num_docs / (sum(times) / len(times) / 1000)
    }


def main():
    print("\n🔬 Phase 89: CUDA vs CPU Benchmark (PyTorch)")
    print("=" * 60)

    get_device_info()

    # Test configurations
    configs = [
        {"num_docs": 100, "dim": 768, "name": "Small (100 docs)"},
        {"num_docs": 1000, "dim": 768, "name": "Medium (1K docs)"},
        {"num_docs": 10000, "dim": 768, "name": "Large (10K docs)"},
        {"num_docs": 50000, "dim": 768, "name": "Extra Large (50K docs)"},
        {"num_docs": 100000, "dim": 768, "name": "Mega (100K docs)"},
    ]

    results = []

    for config in configs:
        print(f"\n[CONFIG] {config['name']} - {config['dim']}D vectors")
        print("-" * 60)

        # CPU Benchmark
        print("\n   [CPU] CPU Performance:")
        try:
            cpu_stats = benchmark("cpu", config["num_docs"], config["dim"])
            print(f"      Mean:       {cpu_stats['mean_ms']:.2f} ms")
            print(f"      Std Dev:    {cpu_stats['std_ms']:.2f} ms")
            print(f"      Min:        {cpu_stats['min_ms']:.2f} ms")
            print(f"      Max:        {cpu_stats['max_ms']:.2f} ms")
            print(f"      Throughput: {cpu_stats['throughput']:.0f} docs/sec")
        except Exception as e:
            print(f"      ❌ Error: {e}")
            cpu_stats = None

        # CUDA Benchmark
        if CUDA_AVAILABLE:
            print("\n   [CUDA] CUDA Performance:")
            try:
                cuda_stats = benchmark("cuda", config["num_docs"], config["dim"])
                print(f"      Mean:       {cuda_stats['mean_ms']:.2f} ms")
                print(f"      Std Dev:    {cuda_stats['std_ms']:.2f} ms")
                print(f"      Min:        {cuda_stats['min_ms']:.2f} ms")
                print(f"      Max:        {cuda_stats['max_ms']:.2f} ms")
                print(f"      Throughput: {cuda_stats['throughput']:.0f} docs/sec")

                if cpu_stats:
                    speedup = cpu_stats['mean_ms'] / cuda_stats['mean_ms']
                    print(f"\n   [SPEEDUP] {speedup:.2f}x faster with CUDA")

                    if speedup > 1:
                        print(f"   [OK] CUDA wins for {config['name']}")
                    else:
                        print(f"   [WARN] CPU faster (transfer overhead dominates)")

                results.append({
                    "config": config["name"],
                    "cpu_ms": cpu_stats['mean_ms'] if cpu_stats else None,
                    "cuda_ms": cuda_stats['mean_ms'],
                    "speedup": speedup if cpu_stats else None
                })
            except Exception as e:
                print(f"      ❌ Error: {e}")
        else:
            print("\n   ⚠️  CUDA not available")
            results.append({
                "config": config["name"],
                "cpu_ms": cpu_stats['mean_ms'] if cpu_stats else None,
                "cuda_ms": None,
                "speedup": None
            })

    # Summary
    print("\n" + "=" * 60)
    print("📈 Benchmark Summary:")
    print("-" * 60)

    if CUDA_AVAILABLE:
        print("✅ CUDA acceleration available")
        print(f"   Device: {torch.cuda.get_device_name(0)}")
        print()

        print("   Config                 | CPU (ms) | CUDA (ms) | Speedup")
        print("   " + "-" * 57)
        for r in results:
            cpu = f"{r['cpu_ms']:.2f}" if r['cpu_ms'] else "N/A"
            cuda = f"{r['cuda_ms']:.2f}" if r['cuda_ms'] else "N/A"
            speedup = f"{r['speedup']:.2f}x" if r['speedup'] else "N/A"
            print(f"   {r['config']:<21} | {cpu:>8} | {cuda:>9} | {speedup:>7}")

        print()
        print("💡 Recommendations:")
        print("   • Use CUDA for queries with >1000 candidates")
        print("   • Use CPU for small top-K queries (<100 candidates)")
        print("   • Keep data on GPU when doing multiple similarity searches")
    else:
        print("⚠️  CUDA not available - using CPU only")
        print("💡 To enable CUDA:")
        print("   1. Install CUDA Toolkit: https://developer.nvidia.com/cuda-downloads")
        print("   2. Install PyTorch with CUDA: pip install torch --index-url https://download.pytorch.org/whl/cu128")
    print()


if __name__ == "__main__":
    main()
