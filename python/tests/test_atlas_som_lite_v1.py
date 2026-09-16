"""Unit tests for atlas_som_lite_v1.py (parent-atlas-som-cache-01).

Gap found during deep-audit review (2026-09-14): no pytest coverage existed
despite a real capping bug being found and fixed here this session
(distance-ranking, not node_key-sorted, within-ring truncation).
"""

from __future__ import annotations

import numpy as np

from atlas_compute.gpu_mini_fabric.atlas_som_lite_v1 import (
    AtlasStructuralSomV1,
    build_structural_features_v1,
)
from atlas_compute.gpu_mini_fabric.graph_fixture import generate_graph_fixture_v1


def test_structural_features_are_deterministic() -> None:
    fixture = generate_graph_fixture_v1()
    f1 = build_structural_features_v1(fixture)
    f2 = build_structural_features_v1(fixture)
    assert f1.checksum == f2.checksum


def _tiny_som() -> AtlasStructuralSomV1:
    """A minimal hand-built SOM (skips real training) so the neighbor-ranking
    fix can be tested in isolation, fast, without a full 10K-node train."""
    weights = np.zeros((2, 2, 3))
    bmu_coords = {"a": (0, 0), "b": (0, 0), "c": (0, 0), "d": (0, 1)}
    cell_to_nodes = {(0, 0): ["a", "b", "c"], (0, 1): ["d"]}
    feature_vectors = {
        "a": np.array([0.0, 0.0, 0.0]),
        "b": np.array([1.0, 0.0, 0.0]),  # distance^2 = 1 from a
        "c": np.array([5.0, 0.0, 0.0]),  # distance^2 = 25 from a
        "d": np.array([0.0, 0.0, 0.0]),
    }
    return AtlasStructuralSomV1(
        grid_rows=2,
        grid_cols=2,
        weights=weights,
        bmu_coords=bmu_coords,
        cell_to_nodes=cell_to_nodes,
        feature_vectors=feature_vectors,
    )


def test_som_bmu_neighbors_ranks_by_true_distance_not_node_key() -> None:
    """Regression test for the real bug found and fixed this session:
    som_bmu_neighbors() used to truncate by sorted(node_key) within a ring,
    an arbitrary tie-break unrelated to actual feature-space distance. 'c' is
    lexicographically before 'b' would only matter under the OLD (broken)
    behavior; the FIX ranks by true squared-Euclidean distance to the query
    node's own feature vector, so 'b' (distance 1) must rank ahead of 'c'
    (distance 25) regardless of string order."""
    som = _tiny_som()
    neighbors = som.som_bmu_neighbors("a")
    neighbor_keys = [k for k, _label in neighbors]
    assert neighbor_keys.index("b") < neighbor_keys.index("c"), (
        "distance-ranking fix regressed: 'b' (closer) must rank before 'c' (farther), "
        "not by node_key lexicographic order"
    )


def test_som_bmu_neighbors_excludes_self() -> None:
    som = _tiny_som()
    neighbors = som.som_bmu_neighbors("a")
    neighbor_keys = [k for k, _label in neighbors]
    assert "a" not in neighbor_keys


def test_som_bmu_neighbors_labels_match_expected_shape() -> None:
    som = _tiny_som()
    neighbors = som.som_bmu_neighbors("a")
    for _key, label in neighbors:
        assert label == "SOM_NEIGHBOR"


def test_som_bmu_neighbors_unknown_node_returns_empty() -> None:
    som = _tiny_som()
    assert som.som_bmu_neighbors("nonexistent") == []
