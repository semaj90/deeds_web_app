"""AtlasStructuralSomLiteV1 -- CPU-only structural feature vectors + Kohonen SOM.

SOM-CACHE-01 tournament support. GraphFixtureV1 carries no per-node
embeddings, so this builds a deterministic, self-contained
`StructuralFeatureVectorV1` (out-degree, in-degree, edge-type distribution)
as the SOM's training input -- NEVER conflated with real production
`embeddinggemma` semantic_768 vectors (design.md Decision 1).

SOM training is CPU-only, fully deterministic: fixed seed, fixed grid size,
fixed learning-rate/radius decay schedule, sequential (non-shuffled)
training order (design.md Decision 2) -- resolves the parent
`parent-atlas-gpu-mini-fabric-01` change's "GPU vs CPU-only SOM training"
Open Question in favor of CPU-only for this proving-ground fixture.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any

import numpy as np

from atlas_compute.gpu_mini_fabric.graph_fixture import GraphFixtureV1, EDGE_TYPES

FEATURE_DIM = 2 + len(EDGE_TYPES)  # out-degree, in-degree, + one fraction per edge type

GRID_ROWS = 10
GRID_COLS = 10
NUM_EPOCHS = 20
SOM_SEED = 20260915
INITIAL_LEARNING_RATE = 0.5
INITIAL_RADIUS = float(max(GRID_ROWS, GRID_COLS)) / 2.0

# Matches GraphFixtureV1's average out-degree exactly (50,000 edges /
# 10,000 nodes = 5) so the tournament compares neighbor-selection QUALITY,
# not neighbor-set SIZE, against the graph-neighbor strategy.
MAX_SOM_NEIGHBORS = 5


@dataclass(frozen=True)
class StructuralFeatureVectorV1:
    """Explicitly-labeled structural (NOT semantic-embedding) per-node feature
    vector, derived only from GraphFixtureV1's own edge lists."""

    node_keys: list[str]
    vectors: np.ndarray  # shape (num_nodes, FEATURE_DIM)
    checksum: str

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "schema": "atlas.som-cache-01.structural-feature-vector.v1",
            "feature_dim": FEATURE_DIM,
            "feature_names": ["log1p_out_degree", "log1p_in_degree"] + [f"frac_{t}" for t in EDGE_TYPES],
            "num_nodes": len(self.node_keys),
            "checksum": self.checksum,
        }


def build_structural_features_v1(fixture: GraphFixtureV1) -> StructuralFeatureVectorV1:
    node_keys = fixture.node_keys
    n = len(node_keys)
    key_to_idx = {k: i for i, k in enumerate(node_keys)}
    edge_type_idx = {t: i for i, t in enumerate(EDGE_TYPES)}

    out_degree = np.zeros(n, dtype=np.float64)
    in_degree = np.zeros(n, dtype=np.float64)
    out_type_counts = np.zeros((n, len(EDGE_TYPES)), dtype=np.float64)

    for s, d, t in zip(fixture.edge_src, fixture.edge_dst, fixture.edge_type):
        si = key_to_idx[s]
        di = key_to_idx[d]
        out_degree[si] += 1
        in_degree[di] += 1
        out_type_counts[si, edge_type_idx[t]] += 1

    with np.errstate(invalid="ignore", divide="ignore"):
        out_type_fractions = np.divide(
            out_type_counts,
            out_degree[:, None],
            out=np.zeros_like(out_type_counts),
            where=out_degree[:, None] > 0,
        )

    vectors = np.concatenate(
        [
            np.log1p(out_degree)[:, None],
            np.log1p(in_degree)[:, None],
            out_type_fractions,
        ],
        axis=1,
    )

    checksum_input = vectors.tobytes()
    checksum = hashlib.sha256(checksum_input).hexdigest()

    return StructuralFeatureVectorV1(node_keys=node_keys, vectors=vectors, checksum=checksum)


@dataclass
class AtlasStructuralSomV1:
    """A trained CPU-only Kohonen SOM: BMU-grid assignment per node, plus the
    reverse index and Chebyshev-radius-1 neighbor lookup used by the
    SOM-BMU-neighbor prefetch strategy."""

    grid_rows: int
    grid_cols: int
    weights: np.ndarray  # shape (grid_rows, grid_cols, FEATURE_DIM)
    bmu_coords: dict[str, tuple[int, int]]
    cell_to_nodes: dict[tuple[int, int], list[str]]
    feature_vectors: dict[str, np.ndarray]  # node_key -> its StructuralFeatureVectorV1 row

    def to_manifest_dict(self) -> dict[str, Any]:
        return {
            "schema": "atlas.som-cache-01.trained-som.v1",
            "grid_rows": self.grid_rows,
            "grid_cols": self.grid_cols,
            "num_epochs": NUM_EPOCHS,
            "seed": SOM_SEED,
            "cpu_only": True,
        }

    def som_bmu_neighbors(self, node_key: str) -> list[tuple[str, str]]:
        """Chebyshev-radius-1 SOM-BMU neighbors of node_key, excluding itself,
        capped at MAX_SOM_NEIGHBORS -- ranked by TRUE Euclidean distance in
        the original 7-dim structural-feature space, deterministic tie-break
        on exact distance ties (never by dict/set iteration order).

        Uncapped, a 10x10 grid over 10,000 nodes averages ~100 nodes/cell, so
        a radius-1 (9-cell) window averages ~900 candidate neighbors per
        query -- found via a real live run that took multiple minutes and had
        to be killed. MAX_SOM_NEIGHBORS is set to match graph-neighbor's ~5
        average out-degree (50,000 edges / 10,000 nodes), so the tournament
        measures neighbor-selection QUALITY, not neighbor-set SIZE.

        CORRECTED (2026-09-14, found during post-archive review, not a design
        bug caught before shipping): the original version truncated ring0
        (same-cell) then ring1 (8 surrounding cells) candidates by SORTING ON
        node_key STRING -- an arbitrary lexicographic tie-break, not the
        actual K nearest neighbors by feature-vector distance. Two same-cell
        nodes can be genuinely close or far in true feature space (a BMU cell
        is a Voronoi region, not a point), and the old code couldn't tell
        them apart. Fixed: gather all ring0+ring1 candidates, rank by real
        Euclidean distance to node_key's own feature vector, ascending
        (ties broken by node_key for determinism), then truncate. This did
        NOT change this capability's own tournament verdict (SOM lost by a
        wide margin regardless -- see parent-atlas-som-cache-01/tasks.md
        section 6), but is the correct fix for any future retry.

        Returns (neighbor_key, "SOM_NEIGHBOR") tuples matching the
        (neighbor_key, edge_type) shape AtlasAceResidencyV1 expects."""
        coord = self.bmu_coords.get(node_key)
        if coord is None:
            return []
        row, col = coord
        query_vec = self.feature_vectors[node_key]

        candidates: list[str] = [k for k in self.cell_to_nodes.get((row, col), []) if k != node_key]
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                if dr == 0 and dc == 0:
                    continue
                r, c = row + dr, col + dc
                if r < 0 or r >= self.grid_rows or c < 0 or c >= self.grid_cols:
                    continue
                candidates.extend(self.cell_to_nodes.get((r, c), []))

        # Rank by TRUE Euclidean distance to the query node's own feature
        # vector, ascending; deterministic (node_key) tie-break for exact ties.
        ranked = sorted(
            candidates,
            key=lambda k: (float(np.sum((self.feature_vectors[k] - query_vec) ** 2)), k),
        )
        ordered = ranked[:MAX_SOM_NEIGHBORS]
        return [(k, "SOM_NEIGHBOR") for k in ordered]


def train_structural_som_v1(features: StructuralFeatureVectorV1) -> AtlasStructuralSomV1:
    rng = np.random.default_rng(SOM_SEED)
    vectors = features.vectors
    n, dim = vectors.shape
    assert dim == FEATURE_DIM

    weights = rng.normal(loc=0.0, scale=0.1, size=(GRID_ROWS, GRID_COLS, dim))

    grid_row_idx, grid_col_idx = np.meshgrid(
        np.arange(GRID_ROWS), np.arange(GRID_COLS), indexing="ij"
    )

    for epoch in range(NUM_EPOCHS):
        progress = epoch / max(NUM_EPOCHS - 1, 1)
        learning_rate = INITIAL_LEARNING_RATE * (1.0 - progress)
        radius = max(INITIAL_RADIUS * (1.0 - progress), 0.5)

        # Sequential (non-shuffled) training order -- deterministic, per
        # design.md Decision 2.
        for i in range(n):
            sample = vectors[i]
            dists = np.sum((weights - sample) ** 2, axis=2)
            bmu_row, bmu_col = np.unravel_index(np.argmin(dists), dists.shape)

            grid_dist_sq = (grid_row_idx - bmu_row) ** 2 + (grid_col_idx - bmu_col) ** 2
            neighborhood = np.exp(-grid_dist_sq / (2.0 * radius * radius))

            delta = learning_rate * neighborhood[:, :, None] * (sample - weights)
            weights += delta

    bmu_coords: dict[str, tuple[int, int]] = {}
    cell_to_nodes: dict[tuple[int, int], list[str]] = {}
    for i, node_key in enumerate(features.node_keys):
        dists = np.sum((weights - vectors[i]) ** 2, axis=2)
        bmu_row, bmu_col = np.unravel_index(np.argmin(dists), dists.shape)
        coord = (int(bmu_row), int(bmu_col))
        bmu_coords[node_key] = coord
        cell_to_nodes.setdefault(coord, []).append(node_key)

    feature_vectors = {node_key: vectors[i] for i, node_key in enumerate(features.node_keys)}

    return AtlasStructuralSomV1(
        grid_rows=GRID_ROWS,
        grid_cols=GRID_COLS,
        weights=weights,
        bmu_coords=bmu_coords,
        cell_to_nodes=cell_to_nodes,
        feature_vectors=feature_vectors,
    )


if __name__ == "__main__":
    from atlas_compute.gpu_mini_fabric.graph_fixture import generate_graph_fixture_v1

    fixture = generate_graph_fixture_v1()

    f1 = build_structural_features_v1(fixture)
    f2 = build_structural_features_v1(fixture)
    assert f1.checksum == f2.checksum, "structural feature vectors must be deterministic"
    print("structural feature vectors are deterministic (byte-identical regeneration confirmed)")
    print(f1.to_manifest_dict())

    som1 = train_structural_som_v1(f1)
    som2 = train_structural_som_v1(f1)
    assert som1.bmu_coords == som2.bmu_coords, "SOM training must be deterministic"
    print("SOM training is deterministic (identical BMU-grid assignment confirmed)")
    print(som1.to_manifest_dict())
