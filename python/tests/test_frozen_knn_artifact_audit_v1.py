import numpy as np
import pytest

from atlas_compute.frozen_knn_artifact_audit_v1 import _tie_aware_sample_check, _verify_knn_edge_vector_binding


def test_tie_aware_oracle_accepts_any_exact_cutoff_tie() -> None:
    vectors = np.asarray([[1, 0], [1, 0], [0, 1], [-1, 0]], dtype=np.float32)
    neighbors = np.asarray([[1], [0], [0], [0]], dtype=np.int32)

    result = _tie_aware_sample_check(vectors, neighbors, [0, 2], batch_rows=2)

    assert [row["queryOrdinal"] for row in result] == [0, 2]
    assert all(row["tieAwarePass"] for row in result)


def test_exact_oracle_rejects_non_top_neighbor() -> None:
    vectors = np.asarray([[1, 0], [1, 0], [0, 1], [-1, 0]], dtype=np.float32)
    neighbors = np.asarray([[3], [0], [0], [0]], dtype=np.int32)

    with pytest.raises(ValueError, match="KNN_INCLUDES_NON_TOP_CANDIDATE:0"):
        _tie_aware_sample_check(vectors, neighbors, [0], batch_rows=2)


def test_exact_oracle_rejects_self_and_out_of_range_neighbors() -> None:
    vectors = np.asarray([[1, 0], [0, 1]], dtype=np.float32)
    with pytest.raises(ValueError, match="KNN_SELF_NEIGHBOR_PRESENT"):
        _tie_aware_sample_check(vectors, np.asarray([[0], [0]], dtype=np.int32), [1])
    with pytest.raises(ValueError, match="KNN_ORDINAL_OUT_OF_RANGE"):
        _tie_aware_sample_check(vectors, np.asarray([[2], [0]], dtype=np.int32), [1])


def test_full_edge_binding_accepts_scores_for_manifest_ordered_vector_pairs() -> None:
    vectors = np.asarray([[1.0, 0.0], [0.6, 0.8], [0.0, 1.0]], dtype=np.float32)
    neighbors = np.asarray([[1, 2], [0, 2], [1, 0]], dtype=np.int32)
    scores = np.asarray([[0.6, 0.0], [0.6, 0.8], [0.8, 0.0]], dtype=np.float32)

    result = _verify_knn_edge_vector_binding(vectors, neighbors, scores, batch_rows=2)

    assert result["verifiedEdges"] == 6
    assert result["maximumAbsoluteScoreError"] == 0


def test_full_edge_binding_rejects_a_score_from_an_unmatched_vector_pair() -> None:
    vectors = np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
    neighbors = np.asarray([[1], [0]], dtype=np.int32)
    scores = np.asarray([[0.8], [0.0]], dtype=np.float32)

    with pytest.raises(ValueError, match="KNN_EDGE_SCORE_VECTOR_BINDING_MISMATCH:0:0"):
        _verify_knn_edge_vector_binding(vectors, neighbors, scores)
