#!/usr/bin/env python3
"""
Runtime-cache smoke test with GPU acceleration for topology operations.

Runs NetworkX operations on NVIDIA GPU via nx-cugraph when available.
Falls back to CPU if GPU unavailable.

Usage:
    python scripts/smoke-test-gpu.py                 # Run all tests
    python scripts/smoke-test-gpu.py --benchmark     # Include performance benchmarks
    python scripts/smoke-test-gpu.py --gpu-only      # Skip non-GPU tests
"""

import asyncio
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional

# Color output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    RESET = '\033[0m'

def log_pass(msg: str):
    """Log passing test."""
    print(f"{Colors.GREEN}✅{Colors.RESET} {msg}")

def log_fail(msg: str):
    """Log failing test."""
    print(f"{Colors.RED}❌{Colors.RESET} {msg}")

def log_warn(msg: str):
    """Log warning."""
    print(f"{Colors.YELLOW}⚠️ {Colors.RESET} {msg}")

def log_info(msg: str):
    """Log info message."""
    print(f"{Colors.CYAN}ℹ️ {Colors.RESET} {msg}")

# Detect GPU availability
def check_gpu():
    """Check if GPU backend is available."""
    try:
        import nx_cugraph as nxcg
        return True, "GPU backend (nx-cugraph) available"
    except ImportError:
        return False, "GPU backend not installed (fallback to CPU)"

# Run JS smoke test
async def run_js_smoke_test():
    """Run the main Node.js smoke test."""
    print(f"\n{Colors.CYAN}📋 Running Node.js Smoke Test{Colors.RESET}")
    print("-" * 50)

    cmd = ["node", "scripts/runtime-cache-smoke-test.mjs"]
    result = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    stdout, stderr = await result.communicate()
    output = stdout.decode()

    # Print output
    for line in output.split('\n'):
        if '✅' in line or 'PASS' in line:
            log_pass(line.strip())
        elif '❌' in line or 'FAIL' in line:
            log_fail(line.strip())
        elif line.strip():
            print(line)

    if stderr:
        log_warn("stderr: " + stderr.decode())

    return result.returncode

# Benchmark topology operations
async def run_topology_benchmark():
    """Benchmark topology operations (CPU vs GPU)."""
    try:
        import networkx as nx
        import time
    except ImportError:
        log_warn("NetworkX not installed, skipping topology benchmarks")
        return

    # Check GPU
    gpu_available, gpu_msg = check_gpu()
    backend = "CUGRAPH" if gpu_available else "CPU"

    print(f"\n{Colors.CYAN}📊 Topology Benchmark ({backend}){Colors.RESET}")
    print("-" * 50)
    log_info(gpu_msg)

    if gpu_available:
        try:
            import nx_cugraph as nxcg
            nx.config.backends.set("cugraph")
        except Exception as e:
            log_warn(f"Failed to enable GPU backend: {e}")
            gpu_available = False

    # Create test graph (simulate 58K packet dependency graph)
    print("Creating test graph (58,365 nodes, ~150K edges)...")
    G = nx.DiGraph()

    # Add 58,365 nodes with ~2.5 edges per node on average
    n_nodes = 58365
    for i in range(n_nodes):
        for j in range(1, 3):
            target = (i + j * 1009) % n_nodes
            G.add_edge(i, target)

    log_pass(f"Graph created: {len(G.nodes())} nodes, {len(G.edges())} edges")

    # Benchmark operations
    benchmarks = []

    # 1. PageRank
    try:
        print("\nRunning PageRank (100 iterations)...")
        start = time.perf_counter()
        pr = nx.pagerank(G, max_iter=100)
        elapsed = time.perf_counter() - start
        benchmarks.append(("PageRank", elapsed))
        log_pass(f"PageRank: {elapsed*1000:.1f}ms")
    except Exception as e:
        log_fail(f"PageRank failed: {e}")

    # 2. Louvain Communities
    try:
        print("Running Louvain community detection...")
        start = time.perf_counter()
        communities = nx.community.louvain_communities(G)
        elapsed = time.perf_counter() - start
        benchmarks.append(("Louvain", elapsed))
        log_pass(f"Louvain: {elapsed*1000:.1f}ms ({len(communities)} communities)")
    except Exception as e:
        log_fail(f"Louvain failed: {e}")

    # 3. K-Core Decomposition
    try:
        print("Running K-core decomposition...")
        start = time.perf_counter()
        kcore = nx.core_number(G)
        elapsed = time.perf_counter() - start
        benchmarks.append(("K-Core", elapsed))
        log_pass(f"K-Core: {elapsed*1000:.1f}ms")
    except Exception as e:
        log_fail(f"K-Core failed: {e}")

    # 4. Density
    try:
        print("Computing graph density...")
        start = time.perf_counter()
        density = nx.density(G)
        elapsed = time.perf_counter() - start
        log_pass(f"Density: {elapsed*1000:.1f}ms (ρ = {density:.4f})")
    except Exception as e:
        log_fail(f"Density failed: {e}")

    # Summary
    print(f"\n{Colors.CYAN}📈 Benchmark Summary ({backend}){Colors.RESET}")
    print("-" * 50)

    total_ms = sum(elapsed for _, elapsed in benchmarks) * 1000
    print(f"Total topology runtime: {total_ms:.1f}ms")

    if gpu_available:
        print(f"\n💡 Speedup expectations (vs CPU):")
        print(f"   • Simple operations (< 5s CPU): 5-10× faster")
        print(f"   • Complex operations (5-20s CPU): 10-15× faster")
        print(f"   • Very large graphs (> 20s CPU): 15-20× faster")

    print()
    return len(benchmarks) > 0

# Memory check
def check_memory():
    """Check GPU memory usage."""
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.used,memory.total", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5
        )

        if result.returncode == 0:
            used, total = result.stdout.strip().split(',')
            used_mb = int(used.split()[0])
            total_mb = int(total.split()[0])

            print(f"\n{Colors.CYAN}💾 GPU Memory{Colors.RESET}")
            print("-" * 50)
            log_info(f"Used: {used_mb}MB / {total_mb}MB ({100*used_mb/total_mb:.1f}%)")

            if used_mb > 7000:  # RTX 3060 Ti has 8GB
                log_warn("GPU memory usage high (>7GB)")
            else:
                log_pass(f"Memory available: {total_mb - used_mb}MB")
    except Exception as e:
        log_warn(f"Could not check GPU memory: {e}")

# Main async runner
async def main():
    """Run all tests."""
    print(f"\n{Colors.CYAN}🚀 Runtime-Cache Smoke Test (GPU-Accelerated){Colors.RESET}")

    # Check GPU
    gpu_available, gpu_msg = check_gpu()
    backend = "CUGRAPH" if gpu_available else "CPU"
    print(f"Backend: {backend}")
    print()

    # Parse arguments
    benchmark = "--benchmark" in sys.argv
    gpu_only = "--gpu-only" in sys.argv

    exit_code = 0

    # Run JS smoke test
    if not gpu_only:
        try:
            js_exit = await run_js_smoke_test()
            if js_exit != 0:
                exit_code = 1
        except FileNotFoundError:
            log_warn("Node.js smoke test not found (scripts/runtime-cache-smoke-test.mjs)")
        except Exception as e:
            log_fail(f"JS smoke test failed: {e}")
            exit_code = 1

    # Run topology benchmarks
    if benchmark:
        try:
            benchmark_ok = await run_topology_benchmark()
            if not benchmark_ok:
                exit_code = 1
        except Exception as e:
            log_fail(f"Topology benchmark failed: {e}")
            exit_code = 1

    # Check GPU memory
    try:
        check_memory()
    except Exception as e:
        log_warn(f"Memory check failed: {e}")

    # Summary
    print(f"\n{Colors.CYAN}📋 Summary{Colors.RESET}")
    print("-" * 50)

    if exit_code == 0:
        log_pass("All tests passed!")
    else:
        log_fail("Some tests failed")

    print()
    return exit_code

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
