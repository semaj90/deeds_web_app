#!/usr/bin/env python3
"""Bounded build-once/search-many CAGRA lifecycle proof.

This proof is intentionally read-only and non-canonical. It builds one cuVS
brute-force oracle index and one CAGRA index, warms the existing CAGRA index,
then repeatedly searches that same index while measuring latency, recall, and
GPU free-memory observations. `persistent=False` is deliberate: this proves
index reuse, not cuVS's persistent GPU search-kernel mode.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import sys
import time
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='cuVS CAGRA build-once/search-many smoke')
    parser.add_argument('--rows', type=int, default=4096)
    parser.add_argument('--dimensions', type=int, default=768)
    parser.add_argument('--query-count', type=int, default=128)
    parser.add_argument('--top-k', type=int, default=10)
    parser.add_argument('--warmups', type=int, default=3)
    parser.add_argument('--measured-searches', type=int, default=20)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--graph-degree', type=int, default=64)
    parser.add_argument('--intermediate-graph-degree', type=int, default=128)
    parser.add_argument('--search-width', type=int, default=1)
    parser.add_argument('--itopk-size', type=int, default=64)
    return parser.parse_args()


def percentile(values: list[float], q: float) -> float:
    if not values:
        raise ValueError('percentile requires at least one value')
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * q
    lo = math.floor(rank)
    hi = math.ceil(rank)
    if lo == hi:
        return ordered[lo]
    weight = rank - lo
    return ordered[lo] * (1.0 - weight) + ordered[hi] * weight


def checksum_rows(rows: list[list[int]]) -> str:
    payload = '\n'.join(','.join(str(value) for value in row) for row in rows)
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


def memory_snapshot(cp: Any) -> dict[str, float | None]:
    try:
        free_bytes, total_bytes = cp.cuda.Device().mem_info
        mib = 1024.0 * 1024.0
        return {
            'free_mib': round(float(free_bytes) / mib, 3),
            'total_mib': round(float(total_bytes) / mib, 3),
            'used_mib': round(float(total_bytes - free_bytes) / mib, 3),
        }
    except Exception:
        return {'free_mib': None, 'total_mib': None, 'used_mib': None}


def filtered_neighbors(neighbors: Any, query_ordinals: list[int], k: int) -> list[list[int]]:
    rows: list[list[int]] = []
    for query_index, row in enumerate(neighbors.tolist()):
        self_ordinal = query_ordinals[query_index]
        values = [int(value) for value in row if int(value) != self_ordinal]
        if len(values) < k:
            raise RuntimeError('not enough non-self neighbors returned')
        rows.append(values[:k])
    return rows


def recall_at_k(exact_rows: list[list[int]], challenger_rows: list[list[int]], k: int) -> float:
    recalls = [len(set(exact) & set(challenger)) / float(k) for exact, challenger in zip(exact_rows, challenger_rows)]
    return float(statistics.mean(recalls))


def main() -> int:
    args = parse_args()
    if args.rows <= args.query_count:
        raise ValueError('--rows must be greater than --query-count')
    if args.top_k < 1 or args.top_k >= args.rows:
        raise ValueError('--top-k must be between 1 and rows-1')
    if args.measured_searches < 1:
        raise ValueError('--measured-searches must be positive')

    try:
        import cupy as cp
        import cuvs
        from cuvs.neighbors import brute_force, cagra
    except Exception as exc:  # pragma: no cover - workstation smoke path
        print(json.dumps({'status': 'IMPORT_FAILED', 'error': f'{type(exc).__name__}: {exc}'}, indent=2), file=sys.stderr)
        return 1

    rng = cp.random.RandomState(args.seed)
    dataset = rng.standard_normal((args.rows, args.dimensions), dtype=cp.float32)
    query_ordinals = list(range(args.query_count))
    queries = dataset[: args.query_count].copy()
    search_k = min(args.rows, args.top_k + 1)

    memory_before_build = memory_snapshot(cp)

    cp.cuda.Device().synchronize()
    t0 = time.perf_counter()
    exact_index = brute_force.build(dataset, metric='sqeuclidean')
    cp.cuda.Device().synchronize()
    exact_build_ms = (time.perf_counter() - t0) * 1000.0

    cp.cuda.Device().synchronize()
    t0 = time.perf_counter()
    exact_distances, exact_neighbors = brute_force.search(exact_index, queries, search_k)
    cp.cuda.Device().synchronize()
    exact_search_ms = (time.perf_counter() - t0) * 1000.0
    del exact_distances
    exact_rows = filtered_neighbors(cp.asnumpy(exact_neighbors), query_ordinals, args.top_k)

    index_params = cagra.IndexParams(
        metric='sqeuclidean',
        graph_degree=min(args.graph_degree, args.rows - 1),
        intermediate_graph_degree=min(max(args.intermediate_graph_degree, args.graph_degree), args.rows),
    )

    cp.cuda.Device().synchronize()
    t0 = time.perf_counter()
    cagra_index = cagra.build(index_params, dataset)
    cp.cuda.Device().synchronize()
    cagra_build_ms = (time.perf_counter() - t0) * 1000.0
    memory_after_build = memory_snapshot(cp)

    search_params = cagra.SearchParams(
        search_width=max(1, args.search_width),
        itopk_size=max(args.itopk_size, search_k),
        persistent=False,
    )

    warmup_latencies_ms: list[float] = []
    for _ in range(args.warmups):
        cp.cuda.Device().synchronize()
        t0 = time.perf_counter()
        cagra.search(search_params, cagra_index, queries, search_k)
        cp.cuda.Device().synchronize()
        warmup_latencies_ms.append((time.perf_counter() - t0) * 1000.0)

    memory_after_warmup = memory_snapshot(cp)

    measured_latencies_ms: list[float] = []
    measured_recalls: list[float] = []
    first_challenger_rows: list[list[int]] | None = None
    for _ in range(args.measured_searches):
        cp.cuda.Device().synchronize()
        t0 = time.perf_counter()
        cagra_distances, cagra_neighbors = cagra.search(search_params, cagra_index, queries, search_k)
        cp.cuda.Device().synchronize()
        measured_latencies_ms.append((time.perf_counter() - t0) * 1000.0)
        del cagra_distances
        challenger_rows = filtered_neighbors(cp.asnumpy(cagra_neighbors), query_ordinals, args.top_k)
        if first_challenger_rows is None:
            first_challenger_rows = challenger_rows
        measured_recalls.append(recall_at_k(exact_rows, challenger_rows, args.top_k))

    memory_after_final = memory_snapshot(cp)
    min_recall = min(measured_recalls)
    mean_recall = statistics.mean(measured_recalls)

    receipt = {
        'schema': 'atlas.cagra-reuse-receipt.v1',
        'status': 'CAGRA_BUILD_ONCE_SEARCH_MANY_PASS' if min_recall == 1.0 else 'CAGRA_REUSE_MEASURED',
        'cuvs_version': getattr(cuvs, '__version__', None),
        'metric': 'sqeuclidean',
        'dimensions': args.dimensions,
        'corpus_rows': args.rows,
        'query_rows_per_batch': args.query_count,
        'top_k': args.top_k,
        'search_k': search_k,
        'index_build_count': 1,
        'warmup_searches': args.warmups,
        'measured_searches': args.measured_searches,
        'search_call_count': args.warmups + args.measured_searches,
        'index_reused': True,
        'index_rebuild_observed': False,
        'persistent_kernel': False,
        'self_exclusion_applied': True,
        'ordinal_identity_preserved': True,
        'graph_degree': min(args.graph_degree, args.rows - 1),
        'intermediate_graph_degree': min(max(args.intermediate_graph_degree, args.graph_degree), args.rows),
        'search_width': max(1, args.search_width),
        'itopk_size': max(args.itopk_size, search_k),
        'exact_build_ms': round(exact_build_ms, 3),
        'exact_search_ms': round(exact_search_ms, 3),
        'cagra_build_ms': round(cagra_build_ms, 3),
        'warmup_search_ms': [round(value, 3) for value in warmup_latencies_ms],
        'search_mean_ms': round(statistics.mean(measured_latencies_ms), 3),
        'search_p50_ms': round(percentile(measured_latencies_ms, 0.50), 3),
        'search_p95_ms': round(percentile(measured_latencies_ms, 0.95), 3),
        'search_max_ms': round(max(measured_latencies_ms), 3),
        'exact_mean_recall_at_k': 1.0,
        'mean_recall_at_k': round(mean_recall, 6),
        'minimum_batch_recall_at_k': round(min_recall, 6),
        'exact_checksum': checksum_rows(exact_rows),
        'cagra_checksum': checksum_rows(first_challenger_rows or []),
        'gpu_memory_before_build': memory_before_build,
        'gpu_memory_after_build': memory_after_build,
        'gpu_memory_after_warmup': memory_after_warmup,
        'gpu_memory_after_final_search': memory_after_final,
        'postgres_writes': False,
        'qdrant_writes': False,
        'neo4j_writes': False,
        'valkey_writes': False,
        'canonical_authority': False,
    }
    print(json.dumps(receipt, indent=2, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
