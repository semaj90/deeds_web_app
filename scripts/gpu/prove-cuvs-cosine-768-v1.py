#!/usr/bin/env python3
"""Read-only cuVS cosine proof against a deterministic NumPy oracle."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


def checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--rows', type=int, default=64)
    parser.add_argument('--dimensions', type=int, default=768)
    parser.add_argument('--query-count', type=int, default=4)
    parser.add_argument('--top-k', type=int, default=5)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    if args.rows <= args.query_count or args.top_k >= args.rows:
        raise SystemExit('rows must exceed query-count and top-k')

    import cupy as cp
    import cuvs
    from cuvs.neighbors import brute_force

    rng = np.random.default_rng(args.seed)
    host_corpus = rng.standard_normal((args.rows, args.dimensions), dtype=np.float32)
    host_queries = host_corpus[:args.query_count].copy()
    host_corpus /= np.linalg.norm(host_corpus, axis=1, keepdims=True)
    host_queries /= np.linalg.norm(host_queries, axis=1, keepdims=True)

    cpu_similarity = host_queries @ host_corpus.T
    cpu_distance = 1.0 - cpu_similarity
    cpu_neighbors = np.argsort(cpu_distance, axis=1, kind='stable')[:, :args.top_k]

    corpus = cp.asarray(host_corpus)
    queries = cp.asarray(host_queries)
    index = brute_force.build(corpus, metric='cosine')
    gpu_distances, gpu_neighbors = brute_force.search(index, queries, args.top_k)
    cp.cuda.Device().synchronize()
    gpu_distances = cp.asnumpy(gpu_distances)
    gpu_neighbors = cp.asnumpy(gpu_neighbors).astype(np.int64)

    identity_match = bool(np.array_equal(cpu_neighbors, gpu_neighbors))
    transformed_similarity = 1.0 - gpu_distances
    score_match = bool(np.allclose(cpu_distance[np.arange(args.query_count)[:, None], cpu_neighbors], gpu_distances, atol=2e-3, rtol=2e-3))
    receipt = {
        'schema': 'atlas.cuvs-cosine-768-proof.v1',
        'status': 'CUVS_COSINE_768_PASS' if identity_match and score_match else 'CUVS_COSINE_768_MISMATCH',
        'cuvs_version': getattr(cuvs, '__version__', 'unknown'),
        'metric': 'cosine',
        'score_transform': 'canonicalSimilarity = 1 - cuvsCosineDistance',
        'rows': args.rows,
        'dimensions': args.dimensions,
        'query_count': args.query_count,
        'top_k': args.top_k,
        'cpu_neighbor_checksum': checksum(cpu_neighbors),
        'gpu_neighbor_checksum': checksum(gpu_neighbors),
        'cpu_distance_checksum': checksum(cpu_distance[np.arange(args.query_count)[:, None], cpu_neighbors]),
        'gpu_distance_checksum': checksum(gpu_distances),
        'identity_match': identity_match,
        'score_match': score_match,
        'canonical_authority': False,
        'writes_attempted': False,
    }
    report_path = Path(__file__).resolve().parents[2] / 'docs' / 'reports' / 'cuvs-cosine-768-proof-v1.json'
    receipt['report_path'] = 'docs/reports/cuvs-cosine-768-proof-v1.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(receipt, indent=2))
    return 0 if receipt['status'] == 'CUVS_COSINE_768_PASS' else 2


if __name__ == '__main__':
    raise SystemExit(main())
