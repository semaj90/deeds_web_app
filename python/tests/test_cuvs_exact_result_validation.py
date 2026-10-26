import numpy as np

from atlas_compute.cuvs_analytics import validate_cuvs_cosine_knn_result


def test_accepts_correct_cosine_distance_index_pairs():
    corpus = np.array([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]], dtype=np.float32)
    queries = np.array([[1.0, 0.0]], dtype=np.float32)
    neighbors = np.array([[0, 1]], dtype=np.int64)
    distances = np.array([[0.0, 1.0]], dtype=np.float32)

    result = validate_cuvs_cosine_knn_result(corpus, queries, neighbors, distances)

    assert result["valid"] is True
    assert result["errorCode"] is None
    assert result["maxAbsDistanceError"] == 0.0


def test_rejects_distance_paired_with_wrong_neighbor_index():
    corpus = np.array([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]], dtype=np.float32)
    queries = np.array([[1.0, 0.0]], dtype=np.float32)
    neighbors = np.array([[1, 0]], dtype=np.int64)
    distances = np.array([[0.0, 1.0]], dtype=np.float32)

    result = validate_cuvs_cosine_knn_result(corpus, queries, neighbors, distances)

    assert result["valid"] is False
    assert result["errorCode"] == "DISTANCE_INDEX_PAIR_MISMATCH"


def test_rejects_invalid_shape_order_duplicates_and_zero_norm():
    corpus = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
    query = np.array([[1.0, 0.0]], dtype=np.float32)

    assert validate_cuvs_cosine_knn_result(corpus, query, np.array([[0]]), np.array([[0.0, 1.0]]))["errorCode"] == "DISTANCE_SHAPE_MISMATCH"
    assert validate_cuvs_cosine_knn_result(corpus, query, np.array([[1, 0]]), np.array([[1.0, 0.0]]))["errorCode"] == "DISTANCES_NOT_ASCENDING"
    assert validate_cuvs_cosine_knn_result(corpus, query, np.array([[0, 0]]), np.array([[0.0, 0.0]]))["errorCode"] == "DUPLICATE_NEIGHBOR_INDEX"
    assert validate_cuvs_cosine_knn_result(np.zeros((2, 2)), query, np.array([[0]]), np.array([[0.0]]))["errorCode"] == "ZERO_NORM_VECTOR"
