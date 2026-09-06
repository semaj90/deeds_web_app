#!/usr/bin/env python3
"""Read-only CPU/GPU parity probe for the NetworkX logical graph ABI.

FIXED 2026-09-06 (review before bringing this pack into the repo, per
openspec/changes/parent-atlas-memory-architecture-freeze addendum 9): the
original parity gate compared only a raw max-absolute-value delta against a
hardcoded 1e-6 tolerance across every node. GPU (typically float32) and CPU
(numpy/networkx, float64) PageRank need not be byte-identical - accumulated
float32 rounding on a large graph can easily exceed 1e-6 in absolute score
terms while the actual thing that matters downstream (which nodes rank in
the top-K, and in what order) is unaffected. The gate now also checks top-K
identity/order agreement and reports it as a separate signal, and widens the
raw numeric tolerance to a value appropriate for float32 accumulation
(configurable, not silently loosened without being visible in the output).

ALSO FIXED (found empirically while verifying the fix above, not one of the
originally-listed corrections): the original code assumed
`nx.pagerank(g, backend="cugraph")` would raise if nx-cugraph/cugraph aren't
installed. Verified live on a machine with neither package installed:
NetworkX 3.3's backend dispatch does NOT raise - it silently falls through
to the default (CPU) implementation and returns a normal result. The
original try/except therefore reported `gpuStatus: "AVAILABLE"` and a
fabricated "speedup" number (CPU-vs-CPU timing noise) on a machine with no
GPU backend at all - a false positive this script's own author almost
certainly did not intend. Fixed by checking `importlib.util.find_spec` for
the actual backend package BEFORE attempting the call, rather than trusting
NetworkX's dispatch to fail loudly when a backend is unavailable.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import time
from pathlib import Path

import networkx as nx


def _load_edges(path: Path) -> nx.DiGraph:
    g = nx.DiGraph()
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            row = json.loads(line)
            g.add_edge(str(row["source"]), str(row["target"]))
    return g


def _run(g: nx.DiGraph, backend: str | None):
    start = time.perf_counter()
    kwargs = {"backend": backend} if backend else {}
    result = nx.pagerank(g, **kwargs)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    ordered = sorted(result.items())
    return ordered, elapsed_ms


def _top_k_ids(score_map: dict[str, float], k: int) -> list[str]:
    return [node for node, _ in sorted(score_map.items(), key=lambda kv: (-kv[1], kv[0]))[:k]]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("edges_jsonl")
    # float32 GPU accumulation over a real-size graph can plausibly land in
    # the 1e-4 to 1e-3 range even when the backends agree on ranking - 1e-6
    # (float64-parity-class) is not a precision-aware default for a
    # GPU-vs-CPU numeric comparison. Widen the default; keep it overridable
    # and always report it explicitly in the output so a reader never has to
    # guess what threshold a given PARITY_PASS/FAIL actually used.
    ap.add_argument("--tolerance", type=float, default=1e-4)
    ap.add_argument("--top-k", type=int, default=20)
    args = ap.parse_args()

    g = _load_edges(Path(args.edges_jsonl))
    cpu, cpu_ms = _run(g, None)

    if importlib.util.find_spec("nx_cugraph") is None and importlib.util.find_spec("cugraph") is None:
        print(json.dumps({
            "schema": "parent-atlas.nx-cugraph-probe.v1",
            "status": "GPU_UNAVAILABLE",
            "reason": "nx_cugraph/cugraph not importable - NetworkX's own backend dispatch does not "
                      "reliably raise when a backend is missing, so this is checked explicitly rather "
                      "than relying on an exception from the pagerank() call below",
            "cpuMs": cpu_ms,
            "nodeCount": g.number_of_nodes(),
            "edgeCount": g.number_of_edges(),
        }, indent=2))
        return 0

    try:
        gpu, gpu_ms = _run(g, "cugraph")
        gpu_status = "AVAILABLE"
    except Exception as exc:
        print(json.dumps({
            "schema": "parent-atlas.nx-cugraph-probe.v1",
            "status": "GPU_UNAVAILABLE",
            "reason": f"{type(exc).__name__}: {exc}",
            "cpuMs": cpu_ms,
            "nodeCount": g.number_of_nodes(),
            "edgeCount": g.number_of_edges(),
        }, indent=2))
        return 0

    cpu_map = dict(cpu)
    gpu_map = dict(gpu)

    same_vertex_set = set(cpu_map) == set(gpu_map)
    max_abs = max((abs(cpu_map[k] - gpu_map.get(k, 0.0)) for k in cpu_map), default=0.0)
    numeric_within_tolerance = max_abs <= args.tolerance

    top_k = min(args.top_k, len(cpu_map))
    cpu_top_k = _top_k_ids(cpu_map, top_k)
    gpu_top_k = _top_k_ids(gpu_map, top_k)
    top_k_identity_match = set(cpu_top_k) == set(gpu_top_k)
    top_k_order_match = cpu_top_k == gpu_top_k

    # Numeric closeness and top-K agreement are reported as distinct signals
    # rather than collapsed into one boolean - a large graph can legitimately
    # have top-K order agree while max_abs exceeds tolerance on low-ranked,
    # low-signal nodes (order among near-zero PageRank scores is noise-prone
    # on both backends), and that distinction is exactly what a reader needs
    # to judge whether a "FAIL" here is actually concerning.
    passed = same_vertex_set and numeric_within_tolerance and top_k_identity_match

    print(json.dumps({
        "schema": "parent-atlas.nx-cugraph-probe.v1",
        "status": "PARITY_PASS" if passed else "PARITY_FAIL",
        "gpuStatus": gpu_status,
        "cpuMs": cpu_ms,
        "gpuMs": gpu_ms,
        "speedup": (cpu_ms / gpu_ms) if gpu_ms > 0 else None,
        "sameVertexSet": same_vertex_set,
        "maxAbsDelta": max_abs,
        "tolerance": args.tolerance,
        "numericWithinTolerance": numeric_within_tolerance,
        "topK": top_k,
        "topKIdentityMatch": top_k_identity_match,
        "topKOrderMatch": top_k_order_match,
        "cpuTopK": cpu_top_k,
        "gpuTopK": gpu_top_k,
        "nodeCount": g.number_of_nodes(),
        "edgeCount": g.number_of_edges(),
        "promotion": "PROOF_ONLY",
    }, indent=2))
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
