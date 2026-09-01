#!/usr/bin/env python3
"""Bounded cuVS CAGRA build-once/search-many proof.

This is an executor benchmark only. It uses one frozen FP32 matrix, compares
against the exact cuVS oracle, and never persists an index or canonical data.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--rows', type=int, default=64)
    parser.add_argument('--dimensions', type=int, default=768)
    parser.add_argument('--query-count', type=int, default=4)
    parser.add_argument('--top-k', type=int, default=5)
    parser.add_argument('--repeats', type=int, default=10)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    import cupy as cp
    import numpy as np
    import cuvs
    from cuvs.neighbors import brute_force, cagra

    if args.rows <= args.query_count or args.top_k >= args.rows:
        raise SystemExit('rows must exceed query-count and top-k')

    rng = np.random.default_rng(args.seed)
    host_corpus = rng.standard_normal((args.rows, args.dimensions), dtype=np.float32)
    host_queries = host_corpus[:args.query_count].copy()
    corpus = cp.asarray(host_corpus)
    queries = cp.asarray(host_queries)

    exact = brute_force.build(corpus, metric='sqeuclidean')
    exact_dist, exact_idx = brute_force.search(exact, queries, k=args.top_k + 1)
    cp.cuda.Stream.null.synchronize()
    exact_idx = cp.asnumpy(exact_idx)

    params = cagra.IndexParams(
        metric='sqeuclidean',
        graph_degree=min(16, args.rows - 1),
        intermediate_graph_degree=min(32, args.rows),
        build_algo='ivf_pq',
    )
    build_started = time.perf_counter()
    index = cagra.build(params, corpus)
    cp.cuda.Stream.null.synchronize()
    build_ms = (time.perf_counter() - build_started) * 1000.0
    search_params = cagra.SearchParams(search_width=2, itopk_size=max(32, args.top_k + 1))

    search_ms: list[float] = []
    recalls: list[float] = []
    for _ in range(args.repeats):
        started = time.perf_counter()
        cagra_dist, cagra_idx = cagra.search(search_params, index, queries, k=args.top_k + 1)
        cp.cuda.Stream.null.synchronize()
        search_ms.append((time.perf_counter() - started) * 1000.0)
        cagra_idx = cp.asnumpy(cagra_idx)
        for row in range(args.query_count):
            exact_neighbors = set(int(value) for value in exact_idx[row].tolist() if int(value) != row)
            cagra_neighbors = set(int(value) for value in cagra_idx[row].tolist() if int(value) != row)
            recalls.append(len(exact_neighbors.intersection(cagra_neighbors)) / args.top_k)

    # Use the upper-rank sample for small bounded runs; with two repeats the
    # previous floor-based formula selected the lower sample as P95.
    p95_index = min(len(search_ms) - 1, max(0, math.ceil(len(search_ms) * 0.95) - 1))
    receipt = {
        'schema': 'atlas.cuvs-cagra-persistent-smoke.v1',
        'status': 'CAGRA_PERSISTENT_FIXTURE_PROVEN' if min(recalls) == 1.0 else 'CAGRA_RECALL_MISMATCH',
        'cuvs_version': getattr(cuvs, '__version__', 'unknown'),
        'rows': args.rows,
        'dimensions': args.dimensions,
        'query_count': args.query_count,
        'top_k': args.top_k,
        'repeats': args.repeats,
        'build_once': True,
        'mean_recall_at_k': statistics.fmean(recalls),
        'min_recall_at_k': min(recalls),
        'search_p50_ms': statistics.median(search_ms),
        'search_p95_ms': sorted(search_ms)[p95_index],
        'build_ms_excluded_from_search': build_ms,
        'canonical_authority': False,
        'writes_attempted': False,
    }
    print(json.dumps(receipt, indent=2))
    return 0 if receipt['status'] == 'CAGRA_PERSISTENT_FIXTURE_PROVEN' else 2


if __name__ == '__main__':
    raise SystemExit(main())
