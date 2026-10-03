"""QuerySequenceFixtureV1 -- BITFROST-SIM-01 query-trace generator.

Resolves the query-sequence-generation Open Question left by
parent-atlas-gpu-mini-fabric-01/design.md: reuses GraphFixtureV1's existing
10,000-node/50,000-edge adjacency (see graph_fixture.py) rather than
inventing a third, unrelated synthetic graph.

Methodology (design.md Decision 2 of parent-atlas-bitfrost-sim-01):
  - A seeded biased random walk over GraphFixtureV1's outgoing-edge
    adjacency produces the "locality trace": with probability
    LOCALITY_PROBABILITY the next queried node is a uniform-random
    out-neighbor of the current node (models a related follow-up query);
    otherwise the next queried node is uniform-random over the full node
    set (models an unrelated topic switch).
  - The "control trace" is a random permutation of the locality trace --
    same node-visit multiset (same per-node frequency), no adjacency
    correlation between consecutive queries. This is the falsifiability
    substitute for the missing CPU/GPU oracle used elsewhere in the parent
    change (design.md Decision 1): a residency policy that cannot beat this
    control on hit rate is not actually exploiting graph locality.

No CUDA. No GPU. No canonical production data. Runs in any plain Python
environment with numpy installed.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import numpy as np

from atlas_compute.gpu_mini_fabric.graph_fixture import (
    GraphFixtureV1,
    build_out_adjacency,
    generate_graph_fixture_v1,
)

TRACE_LENGTH = 4_000
LOCALITY_PROBABILITY = 0.6
SEED = 20260914  # distinct from GraphFixtureV1's own SEED (20260901)


@dataclass(frozen=True)
class QuerySequenceFixtureV1:
    schema: str
    trace_length: int
    locality_probability: float
    seed: int
    graph_snapshot_checksum: str  # ties this trace to the exact GraphFixtureV1 it was built from
    locality_trace: list[str]  # nodeKey sequence
    control_trace: list[str]  # nodeKey sequence, same multiset, permuted order
    locality_trace_checksum: str
    control_trace_checksum: str

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "trace_length": self.trace_length,
            "locality_probability": self.locality_probability,
            "seed": self.seed,
            "graph_snapshot_checksum": self.graph_snapshot_checksum,
            "locality_trace_checksum": self.locality_trace_checksum,
            "control_trace_checksum": self.control_trace_checksum,
        }


def _checksum(trace: list[str]) -> str:
    return hashlib.sha256("\n".join(trace).encode()).hexdigest()


def generate_query_sequence_fixture_v1(
    graph_fixture: GraphFixtureV1 | None = None,
) -> QuerySequenceFixtureV1:
    fixture = graph_fixture if graph_fixture is not None else generate_graph_fixture_v1()
    adjacency = build_out_adjacency(fixture)
    node_keys = fixture.node_keys
    num_nodes = fixture.num_nodes

    rng = np.random.default_rng(SEED)

    locality_trace: list[str] = []
    # First step: uniform-random start node (no "previous query" to be local to yet).
    current = node_keys[int(rng.integers(0, num_nodes))]
    locality_trace.append(current)

    for _ in range(TRACE_LENGTH - 1):
        neighbors = adjacency[current]
        take_local = neighbors and (rng.random() < LOCALITY_PROBABILITY)
        if take_local:
            current = neighbors[int(rng.integers(0, len(neighbors)))]
        else:
            current = node_keys[int(rng.integers(0, num_nodes))]
        locality_trace.append(current)

    # Control trace: same multiset, permuted order -- destroys adjacency
    # correlation between consecutive queries while holding per-node
    # popularity fixed.
    control_trace = list(rng.permutation(np.array(locality_trace, dtype=object)))

    return QuerySequenceFixtureV1(
        schema="atlas.bitfrost-sim-01.query-sequence-fixture.v1",
        trace_length=TRACE_LENGTH,
        locality_probability=LOCALITY_PROBABILITY,
        seed=SEED,
        graph_snapshot_checksum=fixture.graph_snapshot_checksum,
        locality_trace=locality_trace,
        control_trace=control_trace,
        locality_trace_checksum=_checksum(locality_trace),
        control_trace_checksum=_checksum(control_trace),
    )


if __name__ == "__main__":
    f1 = generate_query_sequence_fixture_v1()
    f2 = generate_query_sequence_fixture_v1()
    assert f1.locality_trace_checksum == f2.locality_trace_checksum, "locality trace must be deterministic"
    assert f1.control_trace_checksum == f2.control_trace_checksum, "control trace must be deterministic"
    assert sorted(f1.locality_trace) == sorted(f1.control_trace), (
        "control trace must share the exact node-visit multiset of the locality trace"
    )
    print("query-sequence fixture is deterministic (byte-identical regeneration confirmed)")
    print("control trace multiset matches locality trace multiset")
    print(f1.to_manifest_dict())
