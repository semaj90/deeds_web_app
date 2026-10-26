import numpy as np
import pytest

from atlas_compute.frozen_corpus_near_duplicate_review_v1 import find_candidate_file_pairs_v1


def test_candidate_pairs_use_cosine_or_cross_file_knn_edge_threshold() -> None:
    file_means = np.asarray(
        [[1.0, 0.0], [0.99, 0.1], [0.0, 1.0]],
        dtype=np.float32,
    )
    file_means /= np.linalg.norm(file_means, axis=1, keepdims=True)
    row_file_ids = np.asarray([0, 0, 1, 1, 2], dtype=np.int32)
    knn_indices = np.asarray(
        [[2], [2], [0], [1], [0]],
        dtype=np.int32,
    )

    cosine_pairs, shared_edge_pairs = find_candidate_file_pairs_v1(
        file_means,
        row_file_ids,
        knn_indices,
        cosine_threshold=0.99,
        shared_edge_threshold=2,
    )

    assert cosine_pairs[(0, 1)] > 0.99
    assert shared_edge_pairs[(0, 1)] == 4
    assert (0, 2) not in cosine_pairs
    assert (0, 2) not in shared_edge_pairs


def test_candidate_pair_builder_rejects_out_of_range_knn_ordinals() -> None:
    with pytest.raises(ValueError, match="KNN_ORDINAL_OUT_OF_RANGE"):
        find_candidate_file_pairs_v1(
            np.asarray([[1.0, 0.0]], dtype=np.float32),
            np.asarray([0], dtype=np.int32),
            np.asarray([[1]], dtype=np.int32),
        )
