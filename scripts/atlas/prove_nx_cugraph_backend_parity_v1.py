"""Bounded proof: NetworkX CPU vs the nx-cugraph backend on one seeded fixture graph.

Run ONLY in the WSL RAPIDS env (needs a GPU):
  /home/james/miniforge3/envs/atlas-rapids-cu13/bin/python scripts/atlas/prove_nx_cugraph_backend_parity_v1.py

Scope (per the 2026-10-17 review): CPU NetworkX stays the parity oracle and nx-cugraph is an executor behind it. This compares
the SAME graph and config, never switches NetworkX globally, and reports first-call and warm-call timing separately.
  * BFS distances: exact equality.
  * PageRank: numerical tolerance + top-k overlap (cuGraph and NetworkX converge differently; bit-equality is not expected).
  * Connected-component partition: exact equality of the partition.
Writes docs/reports/nx-cugraph-backend-parity-v1.json. Never writes a database. Status vocabulary: PARITY_PASS / PARITY_FAIL /
BACKEND_UNAVAILABLE. A pass here is one seeded fixture, not production-inference proof.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
import time

import networkx as nx

SEED, N, M, K = 20261017, 3000, 15000, 50
PR_ATOL, MIN_TOPK_OVERLAP = 1e-4, 0.9
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(REPO, "docs", "reports", "nx-cugraph-backend-parity-v1.json")


def timed(fn):
    t = time.perf_counter()
    out = fn()
    return out, (time.perf_counter() - t) * 1000.0


def main() -> int:
    receipt: dict = {"schema": "atlas.nx-cugraph-parity.v1", "seed": SEED, "nodes": N, "edges": M, "writesPerformed": False,
                     "networkx": nx.__version__}
    try:
        import nx_cugraph  # noqa: F401
        import cupy
        receipt["nxCugraph"] = nx_cugraph.__version__
        receipt["gpu"] = cupy.cuda.runtime.getDeviceProperties(0)["name"].decode()
    except Exception as exc:  # pragma: no cover - environment dependent
        receipt.update(status="BACKEND_UNAVAILABLE", error=f"{type(exc).__name__}: {exc}")
        print(json.dumps(receipt, indent=2))
        return 2

    g = nx.gnm_random_graph(N, M, seed=SEED, directed=True)
    gu = nx.gnm_random_graph(N, M, seed=SEED + 1, directed=False)
    checks: dict = {}

    # PageRank (directed). Same alpha/tol on both sides.
    cpu_pr, cpu_ms = timed(lambda: nx.pagerank(g, alpha=0.85, tol=1e-10, max_iter=500))
    gpu_pr_first, gpu_first_ms = timed(lambda: nx.pagerank(g, alpha=0.85, tol=1e-10, max_iter=500, backend="cugraph"))
    warm = [timed(lambda: nx.pagerank(g, alpha=0.85, tol=1e-10, max_iter=500, backend="cugraph"))[1] for _ in range(5)]
    diff = max(abs(cpu_pr[k] - gpu_pr_first.get(k, float("nan"))) for k in cpu_pr)
    top = lambda d: {k for k, _ in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))[:K]}  # noqa: E731
    overlap = len(top(cpu_pr) & top(gpu_pr_first)) / K
    checks["pagerank"] = {"maxAbsDiff": diff, "topKOverlap": overlap, "cpuMs": round(cpu_ms, 2), "gpuFirstCallMs": round(gpu_first_ms, 2),
                          "gpuWarmMedianMs": round(statistics.median(warm), 2), "pass": diff <= PR_ATOL and overlap >= MIN_TOPK_OVERLAP}

    # BFS shortest-path lengths from 5 sources: exact.
    exact = True
    bfs_ms = {"cpu": 0.0, "gpu": 0.0}
    for src in (0, 1, 17, 1234, N - 1):
        c, t1 = timed(lambda: dict(nx.single_source_shortest_path_length(g, src)))
        d, t2 = timed(lambda: dict(nx.single_source_shortest_path_length(g, src, backend="cugraph")))
        bfs_ms["cpu"] += t1
        bfs_ms["gpu"] += t2
        exact &= c == d
    checks["bfs"] = {"exactDistanceEquality": exact, "cpuMsTotal": round(bfs_ms["cpu"], 2), "gpuMsTotal": round(bfs_ms["gpu"], 2), "pass": exact}

    # Connected components (undirected): identical partitions.
    cc_cpu = sorted(sorted(c) for c in nx.connected_components(gu))
    cc_gpu = sorted(sorted(c) for c in nx.connected_components(gu, backend="cugraph"))
    checks["connectedComponents"] = {"components": len(cc_cpu), "partitionEqual": cc_cpu == cc_gpu, "pass": cc_cpu == cc_gpu}

    receipt["checks"] = checks
    receipt["cacheConvertedGraphsConfig"] = str(getattr(nx.config, "cache_converted_graphs", "n/a"))
    receipt["status"] = "PARITY_PASS" if all(c["pass"] for c in checks.values()) else "PARITY_FAIL"
    receipt["caveat"] = "One seeded random fixture; not a claim about the real Atlas graph, other algorithms, or production load. Do not set NETWORKX_AUTOMATIC_BACKENDS globally on this evidence."
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps(receipt, indent=2))
    return 0 if receipt["status"] == "PARITY_PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
