import numpy as np
import pytest

from atlas_compute.spectral_reference import adjusted_rand_index, modularity_matrix, spectral_partition


def test_cpu_spectral_reference_is_deterministic_and_non_promotable():
    edges = [(0, 1, 1.0), (1, 2, 1.0), (2, 3, 1.0), (3, 0, 1.0)]
    first = spectral_partition(4, edges, cluster_count=2, num_eigenvectors=2)
    second = spectral_partition(4, edges, cluster_count=2, num_eigenvectors=2)
    assert first["assignment_checksum"] == second["assignment_checksum"]
    assert first["canonical_authority"] is False
    assert first["promotion_eligible"] is False
    assert len(first["assignments"]) == 4


def test_ari_ignores_cluster_label_permutation():
    assert adjusted_rand_index([0, 0, 1, 1], [1, 1, 0, 0]) == pytest.approx(1.0)


def test_reference_rejects_disconnected_vertices():
    with pytest.raises(ValueError, match="every vertex"):
        spectral_partition(3, [(0, 1, 1.0)], cluster_count=2, num_eigenvectors=2)


def test_modularity_operator_is_symmetric_and_zero_sum():
    matrix = modularity_matrix(4, [(0, 1, 1.0), (2, 3, 1.0)])
    assert np.allclose(matrix, matrix.T)
    assert np.allclose(matrix.sum(axis=1), 0.0)


def test_two_disconnected_communities_have_stable_reference_partition():
    edges = [(0, 1, 1.0), (1, 2, 1.0), (2, 0, 1.0), (3, 4, 1.0), (4, 5, 1.0), (5, 3, 1.0)]
    result = spectral_partition(6, edges, cluster_count=2, num_eigenvectors=2, operator="modularity")
    labels = [row["cluster"] for row in result["assignments"]]
    assert adjusted_rand_index(labels, [0, 0, 0, 1, 1, 1]) == pytest.approx(1.0)
