"""GraphFixtureV1 -- Phase D structural graph fixture.

Deterministic, frozen, synthetic (no canonical production data, no live
Neo4j read): 10,000 nodes, 50,000 typed edges
(IMPORTS/CALLS/REFERENCES/IMPLEMENTS/TESTS).

Zero dangling nodes is a hard invariant (see design.md sec 4c / spec
gpu-mini-fabric-structural-graph): cuGraph's pagerank() silently ignores its
`dangling` parameter while NetworkX actively redistributes rank from
zero-out-degree nodes (rapidsai/cugraph#482) -- an unguarded dangling node
would produce a false PageRank-parity FAIL unrelated to either
implementation's correctness. Guaranteed here by giving every node exactly
one mandatory outgoing edge before adding the remaining random edges.

Vertex identity fed to BOTH NetworkX and cuGraph is the `nodeKey` string
directly (never a row index or internal engine ID) -- this sidesteps
cuGraph's renumber=False / contiguous-ID-from-zero caveat entirely, per this
change's `nodeKey != projectionOrdinal != cuGraph internal vertex !=
CandidateOrdinal` invariant.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import numpy as np

SEED = 20260901
NUM_NODES = 10_000
NUM_EDGES = 50_000
EDGE_TYPES = ["IMPORTS", "CALLS", "REFERENCES", "IMPLEMENTS", "TESTS"]


@dataclass(frozen=True)
class GraphFixtureV1:
    schema: str
    num_nodes: int
    num_edges: int
    seed: int
    node_keys: list[str]
    projection_ordinals: np.ndarray
    edge_src: list[str]  # nodeKey
    edge_dst: list[str]  # nodeKey
    edge_type: list[str]
    graph_snapshot_checksum: str

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "num_nodes": self.num_nodes,
            "num_edges": self.num_edges,
            "seed": self.seed,
            "graph_snapshot_checksum": self.graph_snapshot_checksum,
        }


def generate_graph_fixture_v1() -> GraphFixtureV1:
    rng = np.random.default_rng(SEED)

    node_keys = [f"gpu-graph-struct:node:{i:05d}" for i in range(NUM_NODES)]
    projection_ordinals = rng.permutation(NUM_NODES).astype(np.int64)
    assert not np.array_equal(projection_ordinals, np.arange(NUM_NODES))

    edge_src: list[str] = []
    edge_dst: list[str] = []
    edge_type: list[str] = []

    # Mandatory 1 outgoing edge per node -- guarantees zero dangling nodes.
    mandatory_targets = rng.integers(0, NUM_NODES, size=NUM_NODES)
    # Avoid self-loops in the mandatory pass (retry deterministically).
    for i in range(NUM_NODES):
        t = int(mandatory_targets[i])
        if t == i:
            t = (t + 1) % NUM_NODES
        edge_src.append(node_keys[i])
        edge_dst.append(node_keys[t])
        edge_type.append(EDGE_TYPES[rng.integers(0, len(EDGE_TYPES))])

    remaining = NUM_EDGES - NUM_NODES
    extra_src = rng.integers(0, NUM_NODES, size=remaining)
    extra_dst = rng.integers(0, NUM_NODES, size=remaining)
    extra_types = rng.integers(0, len(EDGE_TYPES), size=remaining)
    for i in range(remaining):
        s, d = int(extra_src[i]), int(extra_dst[i])
        if s == d:
            d = (d + 1) % NUM_NODES
        edge_src.append(node_keys[s])
        edge_dst.append(node_keys[d])
        edge_type.append(EDGE_TYPES[extra_types[i]])

    # Hard invariant check: zero dangling nodes.
    out_degree = np.zeros(NUM_NODES, dtype=np.int64)
    key_to_idx = {k: i for i, k in enumerate(node_keys)}
    for s in edge_src:
        out_degree[key_to_idx[s]] += 1
    assert np.all(out_degree >= 1), "GraphFixtureV1 must have zero dangling nodes"

    checksum_input = "\n".join(f"{s}|{d}|{t}" for s, d, t in zip(edge_src, edge_dst, edge_type))
    graph_snapshot_checksum = hashlib.sha256(checksum_input.encode()).hexdigest()

    return GraphFixtureV1(
        schema="atlas.gpu-mini-fabric.graph-fixture.v1",
        num_nodes=NUM_NODES,
        num_edges=len(edge_src),
        seed=SEED,
        node_keys=node_keys,
        projection_ordinals=projection_ordinals,
        edge_src=edge_src,
        edge_dst=edge_dst,
        edge_type=edge_type,
        graph_snapshot_checksum=graph_snapshot_checksum,
    )


def generate_graph_fixture_with_dangling_v1() -> GraphFixtureV1:
    """GRAPH-PAGERANK-02 fixture: same generation approach as
    generate_graph_fixture_v1(), but WITHOUT the mandatory-1-edge-per-node
    step -- dangling nodes occur naturally from the random edge distribution
    (expected ~67 of 10,000 nodes at average out-degree 5, from
    e^-5 ~= 0.0067). Purpose: characterize whether cuGraph's documented
    dangling-parameter no-op produces a measurable divergence from
    NetworkX on a concrete graph, not to establish basic numerical parity
    (that's GRAPH-PAGERANK-01 / generate_graph_fixture_v1's job)."""
    rng = np.random.default_rng(SEED + 1)  # distinct seed from the isolation fixture

    node_keys = [f"gpu-graph-struct-dangling:node:{i:05d}" for i in range(NUM_NODES)]
    projection_ordinals = rng.permutation(NUM_NODES).astype(np.int64)

    edge_src: list[str] = []
    edge_dst: list[str] = []
    edge_type: list[str] = []

    src_idx = rng.integers(0, NUM_NODES, size=NUM_EDGES)
    dst_idx = rng.integers(0, NUM_NODES, size=NUM_EDGES)
    type_idx = rng.integers(0, len(EDGE_TYPES), size=NUM_EDGES)
    for i in range(NUM_EDGES):
        s, d = int(src_idx[i]), int(dst_idx[i])
        if s == d:
            d = (d + 1) % NUM_NODES
        edge_src.append(node_keys[s])
        edge_dst.append(node_keys[d])
        edge_type.append(EDGE_TYPES[type_idx[i]])

    out_degree = np.zeros(NUM_NODES, dtype=np.int64)
    key_to_idx = {k: i for i, k in enumerate(node_keys)}
    for s in edge_src:
        out_degree[key_to_idx[s]] += 1
    dangling_count = int(np.sum(out_degree == 0))
    assert dangling_count > 0, "GRAPH-PAGERANK-02 fixture must contain at least one dangling node by design"

    checksum_input = "\n".join(f"{s}|{d}|{t}" for s, d, t in zip(edge_src, edge_dst, edge_type))
    graph_snapshot_checksum = hashlib.sha256(checksum_input.encode()).hexdigest()

    return GraphFixtureV1(
        schema="atlas.gpu-mini-fabric.graph-fixture-with-dangling.v1",
        num_nodes=NUM_NODES,
        num_edges=len(edge_src),
        seed=SEED + 1,
        node_keys=node_keys,
        projection_ordinals=projection_ordinals,
        edge_src=edge_src,
        edge_dst=edge_dst,
        edge_type=edge_type,
        graph_snapshot_checksum=graph_snapshot_checksum,
    )


if __name__ == "__main__":
    f1 = generate_graph_fixture_v1()
    f2 = generate_graph_fixture_v1()
    assert f1.graph_snapshot_checksum == f2.graph_snapshot_checksum, "fixture must be deterministic"
    print("fixture is deterministic (byte-identical regeneration confirmed)")
    print(f1.to_manifest_dict())
