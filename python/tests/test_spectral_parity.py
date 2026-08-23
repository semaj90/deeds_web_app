import pytest

from atlas_compute.spectral_parity import compare_spectral_assignments


def _rows(labels):
    return [{"ordinal": index, "cluster": label} for index, label in enumerate(labels)]


def test_spectral_parity_ignores_backend_cluster_numbering():
    receipt = compare_spectral_assignments(
        _rows([0, 0, 1, 1]), _rows([1, 1, 0, 0]),
        graph_checksum="g" * 64, ordinal_map_checksum="o" * 64,
        cluster_count=2, num_eigenvectors=2, seed=7,
    )
    assert receipt["adjusted_rand_index"] == pytest.approx(1.0)
    assert receipt["partition_parity_passed"] is True
    assert receipt["canonical_authority"] is False
    assert receipt["projection_write_allowed"] is False


def test_spectral_parity_rejects_ordinal_drift():
    with pytest.raises(ValueError, match="ORDINAL_MAP"):
        compare_spectral_assignments(
            _rows([0, 0]), [{"ordinal": 1, "cluster": 0}, {"ordinal": 2, "cluster": 1}],
            graph_checksum="g", ordinal_map_checksum="o",
            cluster_count=2, num_eigenvectors=2, seed=1,
        )
