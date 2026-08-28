#!/usr/bin/env python3
"""
Exact cuVS brute-force KNN smoke test.

This is an oracle-style correctness check for the semantic ANN lane. It does not
use CAGRA or any approximate configuration knobs.
"""

from __future__ import annotations

import argparse
import json
import sys
import time

import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='cuVS brute-force KNN smoke test')
    parser.add_argument('--rows', type=int, default=4096)
    parser.add_argument('--dimensions', type=int, default=768)
    parser.add_argument('--query-count', type=int, default=16)
    parser.add_argument('--top-k', type=int, default=10)
    parser.add_argument('--seed', type=int, default=42)
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        import cupy as cp
        import cuvs
        from cuvs.neighbors import brute_force
    except Exception as exc:  # pragma: no cover - smoke path
        print(
            json.dumps(
                {
                    'status': 'IMPORT_FAILED',
                    'error': f'{type(exc).__name__}: {exc}',
                },
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1

    rng = cp.random.RandomState(args.seed)
    dataset = rng.standard_normal((args.rows, args.dimensions), dtype=cp.float32)
    queries = dataset[: args.query_count].copy()

    cp.cuda.Device().synchronize()
    build_start = time.perf_counter()
    index = brute_force.build(dataset, metric='sqeuclidean')
    cp.cuda.Device().synchronize()
    build_ms = (time.perf_counter() - build_start) * 1000.0

    search_start = time.perf_counter()
    distances, neighbors = brute_force.search(index, queries, args.top_k)
    cp.cuda.Device().synchronize()
    search_ms = (time.perf_counter() - search_start) * 1000.0

    neighbors_np = cp.asnumpy(neighbors)
    distances_np = cp.asnumpy(distances)
    top1 = neighbors_np[:, 0]
    expected = list(range(args.query_count))
    # `top1` has already crossed the device boundary via `cp.asnumpy`; compare
    # it with a host-side range rather than mixing NumPy and CuPy arrays.
    self_match_rate = float((top1 == np.arange(args.query_count)).mean().item())

    payload = {
        'status': 'CUVS_BRUTE_FORCE_PASS' if self_match_rate == 1.0 else 'CUVS_RESULT_MISMATCH',
        'cuvs_version': getattr(cuvs, '__version__', None),
        'rows': args.rows,
        'dimensions': args.dimensions,
        'query_count': args.query_count,
        'top_k': args.top_k,
        'build_ms': round(build_ms, 3),
        'search_ms': round(search_ms, 3),
        'self_match_rate': self_match_rate,
        'expected_top1': expected,
        'actual_top1': top1.tolist(),
        'first_query_distances': distances_np[0].tolist(),
    }
    print(json.dumps(payload, indent=2))

    return 0 if self_match_rate == 1.0 else 2


if __name__ == '__main__':
    raise SystemExit(main())
