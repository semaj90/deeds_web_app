#!/usr/bin/env python3
"""Augment a frozen live graph fixture with derived exact semantic top-k edges.

The input semantic_768 rows remain exact evidence representations. The generated
SEMANTIC_KNN edges are explicitly derived similarities and are never canonical
relationships. cuVS all-neighbors is configured with the brute-force algorithm.
"""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path

import numpy as np


def stable_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def checksum(value):
    return sha256(stable_json(value)).hexdigest()


def normalize_rows(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    if np.any(norms <= 0):
        raise ValueError("SEMANTIC_KNN_ZERO_NORM_VECTOR")
    return matrix / norms


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--k", type=int)
    parser.add_argument("--weight", type=float)
    args = parser.parse_args()

    fixture_path = Path(args.fixture).resolve()
    output_path = Path(args.output).resolve()
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    vertices = fixture.get("vertices", [])
    if not 500 <= len(vertices) <= 5000:
        raise ValueError("SEMANTIC_KNN_FIXTURE_REQUIRES_500_TO_5000_VERTICES")
    matrix = np.asarray([vertex.get("semantic_768") for vertex in vertices], dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape != (len(vertices), 768) or not np.isfinite(matrix).all():
        raise ValueError("SEMANTIC_KNN_REQUIRES_COMPLETE_FINITE_768_MATRIX")
    matrix = normalize_rows(matrix).astype(np.float32, copy=False)
    k = args.k if args.k is not None else int(fixture.get("semantic_top_k", 16))
    if not 1 <= k <= min(128, len(vertices) - 1):
        raise ValueError("SEMANTIC_KNN_K_INVALID")
    family_weight = args.weight if args.weight is not None else float(fixture.get("semantic_edge_weight", 0.20))
    if not 0 <= family_weight <= 1:
        raise ValueError("SEMANTIC_KNN_EDGE_WEIGHT_INVALID")

    import cupy as cp
    from cuvs.neighbors import all_neighbors

    device = cp.asarray(matrix)
    params = all_neighbors.AllNeighborsParams(algo="brute_force", n_clusters=1, metric="cosine")
    # Request k+1 because self is normally the nearest row and must not become a graph edge.
    indices, _distances, _core = all_neighbors.build(device, k + 1, params)
    neighbors = cp.asnumpy(indices)

    semantic_edges = {}
    for src in range(len(vertices)):
        emitted = 0
        for dst_raw in neighbors[src]:
            dst = int(dst_raw)
            if dst == src:
                continue
            left, right = (src, dst) if src < dst else (dst, src)
            similarity = float(np.dot(matrix[src], matrix[dst]))
            similarity01 = max(0.0, min(1.0, (similarity + 1.0) / 2.0))
            key = (left, right)
            edge = {
                "src": left,
                "dst": right,
                "weight": family_weight * similarity01,
                "family": "SEMANTIC_KNN",
                "canonical_fact": False,
                "derived_similarity": True,
                "semantic_similarity": similarity,
                "semantic_snapshot_revision": fixture.get("feature_revision"),
                "semantic_executor": "CUVS_ALL_NEIGHBORS_BRUTE_FORCE",
            }
            prior = semantic_edges.get(key)
            if prior is None or edge["weight"] > prior["weight"]:
                semantic_edges[key] = edge
            emitted += 1
            if emitted >= k:
                break

    augmented = dict(fixture)
    augmented["edges"] = list(fixture.get("edges", [])) + sorted(
        semantic_edges.values(), key=lambda edge: (edge["src"], edge["dst"])
    )
    augmented["semantic_knn_receipt"] = {
        "schema": "atlas.semantic-knn-graph-receipt.v1",
        "executor": "CUVS_ALL_NEIGHBORS_BRUTE_FORCE",
        "exact": True,
        "source_fixture_checksum": checksum(fixture),
        "semantic_dimension": 768,
        "k": k,
        "edge_count": len(semantic_edges),
        "family_weight": family_weight,
        "canonical_authority": False,
    }
    augmented["fixture_parent_checksum"] = checksum(fixture)
    augmented["fixture_builder_revision"] = "live-graph-semantic-knn-v1"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(augmented, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "output": str(output_path),
        "semantic_edge_count": len(semantic_edges),
        "k": k,
        "source_fixture_checksum": checksum(fixture),
        "augmented_fixture_checksum": checksum(augmented),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
