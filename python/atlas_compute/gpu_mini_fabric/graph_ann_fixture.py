"""GPU-GRAPH-ANN-01 fixture generator (Phase B).

Generalizes the Phase A (SEMANTIC-EXACT-PARITY-01) fixture pattern to
arbitrary N, so the same deterministic synthetic corpus + query set shape can
be regenerated at 16K, 64K, 256K, and 1M for the CAGRA-vs-exact crossover
curve. Dimension, K, and query count stay fixed across sizes (64-dim, K=16,
256 queries) so only N varies between tiers -- keeping the comparison
apples-to-apples.

Seed is derived per-N (not a single global seed) so each tier's fixture is
independently reproducible without depending on generation order.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import numpy as np

DIM = 64
NUM_QUERIES = 256
K = 16
TIER_SIZES = [16384, 65536, 262144, 1048576]  # 16K, 64K, 256K, 1M


def _seed_for(n: int) -> int:
    digest = hashlib.sha256(f"gpu-graph-ann-01:{n}".encode()).digest()
    return int.from_bytes(digest[:4], "big")


@dataclass(frozen=True)
class GraphAnnFixtureV1:
    schema: str
    num_nodes: int
    dim: int
    num_queries: int
    k: int
    seed: int
    node_keys: list[str]
    projection_ordinals: np.ndarray
    candidate_ordinals: np.ndarray
    vectors: np.ndarray
    query_indices: np.ndarray
    vectors_checksum: str

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "num_nodes": self.num_nodes,
            "dim": self.dim,
            "num_queries": self.num_queries,
            "k": self.k,
            "seed": self.seed,
            "vectors_checksum": self.vectors_checksum,
        }


def _checksum(arr: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(arr).tobytes()).hexdigest()


def generate_graph_ann_fixture_v1(n: int) -> GraphAnnFixtureV1:
    seed = _seed_for(n)
    rng = np.random.default_rng(seed)

    raw = rng.standard_normal((n, DIM)).astype(np.float32)
    norms = np.linalg.norm(raw, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    vectors = raw / norms

    node_keys = [f"gpu-graph-ann:node:{i:07d}" for i in range(n)]

    projection_ordinals = rng.permutation(n).astype(np.int64)
    candidate_ordinals = rng.permutation(n).astype(np.int64)
    assert not np.array_equal(projection_ordinals, candidate_ordinals)
    assert not np.array_equal(projection_ordinals, np.arange(n))
    assert not np.array_equal(candidate_ordinals, np.arange(n))

    query_indices = rng.choice(n, size=NUM_QUERIES, replace=False).astype(np.int64)

    return GraphAnnFixtureV1(
        schema="atlas.gpu-mini-fabric.graph-ann-fixture.v1",
        num_nodes=n,
        dim=DIM,
        num_queries=NUM_QUERIES,
        k=K,
        seed=seed,
        node_keys=node_keys,
        projection_ordinals=projection_ordinals,
        candidate_ordinals=candidate_ordinals,
        vectors=vectors,
        query_indices=query_indices,
        vectors_checksum=_checksum(vectors),
    )


if __name__ == "__main__":
    for n in TIER_SIZES:
        f1 = generate_graph_ann_fixture_v1(n)
        f2 = generate_graph_ann_fixture_v1(n)
        assert f1.vectors_checksum == f2.vectors_checksum
        print(n, f1.to_manifest_dict())
