#!/usr/bin/env python3
"""Read-only parity check for the native PageRank C ABI fixture and NetworkX."""

from __future__ import annotations

import argparse
import json
import math
import subprocess
from pathlib import Path

import networkx as nx


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("native_test", type=Path, help="built atlas_core_c_abi_test executable")
    args = parser.parse_args()

    completed = subprocess.run(
        [str(args.native_test), "--emit-pagerank-json"],
        check=True,
        capture_output=True,
        text=True,
    )
    native = json.loads(completed.stdout.strip().splitlines()[-1])
    graph = nx.DiGraph()
    graph.add_nodes_from(range(3))
    graph.add_weighted_edges_from([(0, 1, 1.0), (1, 0, 1.0)])
    reference_map = nx.pagerank(
        graph,
        alpha=0.85,
        tol=1e-12,
        max_iter=100,
        weight="weight",
    )
    reference = [reference_map[node] for node in range(3)]
    actual = native["scores"]
    if len(actual) != len(reference) or not native["converged"]:
        raise SystemExit("FAIL: native output shape or convergence status is invalid")
    errors = [abs(float(a) - float(b)) for a, b in zip(actual, reference, strict=True)]
    max_error = max(errors, default=0.0)
    if not all(math.isfinite(float(score)) and float(score) >= 0.0 for score in actual):
        raise SystemExit("FAIL: native scores contain invalid values")
    if abs(sum(actual) - 1.0) > 1e-12 or max_error > 1e-10:
        raise SystemExit(f"FAIL: normalization/parity mismatch (max_abs_error={max_error:.3g})")

    print(
        json.dumps(
            {
                "status": "PASS",
                "networkxVersion": nx.__version__,
                "nodes": 3,
                "edges": 2,
                "nativeIterations": native["iterations"],
                "maxAbsoluteError": max_error,
                "tolerance": 1e-10,
                "writesPerformed": False,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
