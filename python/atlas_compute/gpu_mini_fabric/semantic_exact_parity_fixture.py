"""SEMANTIC-EXACT-PARITY-01 fixture generator.

Deterministic, frozen, synthetic fixture -- no canonical production data.
16384 nodes, 64-dim normalized FP32 vectors, fixed seed. Each node carries
THREE deliberately distinct identity-shaped integers (nodeKey, projectionOrdinal,
CandidateOrdinal) so any code path that accidentally conflates them fails
immediately and visibly, rather than silently passing because two axes
happened to share the same value by construction.

Seed: numpy default_rng(seed=20260901). Pure function of nothing but this
constant -- regenerating with this module always reproduces the same fixture.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import numpy as np

FIXTURE_SEED = 20260901
NUM_NODES = 16384
DIM = 64
NUM_QUERIES = 256
K = 16


@dataclass(frozen=True)
class SemanticExactParityFixtureV1:
    schema: str
    num_nodes: int
    dim: int
    num_queries: int
    k: int
    seed: int
    node_keys: list[str]
    projection_ordinals: np.ndarray  # int64[num_nodes], a permutation, != row index
    candidate_ordinals: np.ndarray  # int64[num_nodes], a DIFFERENT permutation
    vectors: np.ndarray  # float32[num_nodes, dim], L2-normalized
    query_indices: np.ndarray  # int64[num_queries], row indices used as queries
    vectors_checksum: str

    def to_manifest_dict(self) -> dict[str, Any]:
        """Metadata only -- never inline the vector matrix (root CLAUDE.md's
        Wire Format Layering Rule: bulk numeric arrays must not go through JSON)."""
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


def generate_semantic_exact_parity_fixture_v1() -> SemanticExactParityFixtureV1:
    rng = np.random.default_rng(FIXTURE_SEED)

    raw = rng.standard_normal((NUM_NODES, DIM)).astype(np.float32)
    norms = np.linalg.norm(raw, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    vectors = raw / norms

    node_keys = [f"gpu-mini-fabric:node:{i:05d}" for i in range(NUM_NODES)]

    # Two INDEPENDENT permutations, deliberately different from row index and
    # from each other -- this is the "catches accidental coordinate
    # conflation immediately" property the fixture design requires.
    projection_ordinals = rng.permutation(NUM_NODES).astype(np.int64)
    candidate_ordinals = rng.permutation(NUM_NODES).astype(np.int64)
    # Guarantee the two permutations are not accidentally identical anywhere
    # that would matter for the conflation check: assert at generation time.
    assert not np.array_equal(projection_ordinals, candidate_ordinals), (
        "projection_ordinals and candidate_ordinals must never coincide -- "
        "regenerate with a different seed offset if this ever fires"
    )
    assert not np.array_equal(projection_ordinals, np.arange(NUM_NODES)), (
        "projection_ordinals must not equal row index"
    )
    assert not np.array_equal(candidate_ordinals, np.arange(NUM_NODES)), (
        "candidate_ordinals must not equal row index"
    )

    query_indices = rng.choice(NUM_NODES, size=NUM_QUERIES, replace=False).astype(np.int64)

    return SemanticExactParityFixtureV1(
        schema="atlas.gpu-mini-fabric.semantic-exact-parity-fixture.v1",
        num_nodes=NUM_NODES,
        dim=DIM,
        num_queries=NUM_QUERIES,
        k=K,
        seed=FIXTURE_SEED,
        node_keys=node_keys,
        projection_ordinals=projection_ordinals,
        candidate_ordinals=candidate_ordinals,
        vectors=vectors,
        query_indices=query_indices,
        vectors_checksum=_checksum(vectors),
    )


if __name__ == "__main__":
    fixture = generate_semantic_exact_parity_fixture_v1()
    second = generate_semantic_exact_parity_fixture_v1()
    assert fixture.vectors_checksum == second.vectors_checksum, "fixture must be deterministic"
    assert np.array_equal(fixture.projection_ordinals, second.projection_ordinals)
    assert np.array_equal(fixture.candidate_ordinals, second.candidate_ordinals)
    print("fixture is deterministic (byte-identical regeneration confirmed)")
    print(fixture.to_manifest_dict())
