import numpy as np
import pytest

from atlas_compute.frozen_som_holdout_v1 import assess_som_holdout_gate_v1, evaluate_som_projection_v1, split_rows_by_source_ref_v1


def test_file_split_is_stable_and_never_separates_same_source() -> None:
    source_refs = [
        "src/a.ts", "src/b.ts", "src/a.ts", "src/c.ts", "src/d.ts",
        "scripts/atlas/a.py", "scripts/atlas/b.py", "scripts/atlas/c.py", "scripts/atlas/d.py",
    ]

    first = split_rows_by_source_ref_v1(source_refs)
    replay = split_rows_by_source_ref_v1(source_refs)

    assert np.array_equal(first, replay)
    assert first[0] == first[2]
    assert int(first[[0, 1, 3, 4]].sum()) == 2
    assert int(first[[5, 6, 7, 8]].sum()) == 2
    assert first.any()
    assert not first.all()


def test_file_split_rejects_missing_source_identity() -> None:
    with pytest.raises(ValueError, match="INVALID_SOURCE_REF_AT:1"):
        split_rows_by_source_ref_v1(["src/a.ts", ""])


def test_holdout_threshold_pass_does_not_admit_unverified_inputs() -> None:
    gate = assess_som_holdout_gate_v1([
        {"testMetrics": {"topographicErrorEuclidean1": 0.08, "neighborPreservationChebyshev2": 0.66}},
        {"testMetrics": {"topographicErrorEuclidean1": 0.085, "neighborPreservationChebyshev2": 0.65}},
    ])

    assert gate["metricStatus"] == "PASS"
    assert gate["productionAdmission"] is False
    assert "VECTOR_AND_KNN_ROW_IDENTITY_NOT_INDEPENDENTLY_VERIFIED" in gate["blockedBy"]


def test_holdout_threshold_failure_is_fail_closed() -> None:
    gate = assess_som_holdout_gate_v1([
        {"testMetrics": {"topographicErrorEuclidean1": 0.086, "neighborPreservationChebyshev2": 0.7}},
    ])

    assert gate["metricStatus"] == "FAIL"
    assert gate["productionAdmission"] is False


def test_metrics_report_euclidean_topography_and_chebyshev_neighborhood_preservation() -> None:
    matrix = np.asarray([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0]], dtype=np.float32)
    codebook = np.asarray([[1.0, 0.0], [0.0, 1.0], [-1.0, 0.0], [0.0, -1.0]], dtype=np.float32)
    knn = np.asarray([[1], [0], [1]], dtype=np.int32)
    mask = np.asarray([True, True, False])

    result = evaluate_som_projection_v1(
        matrix,
        codebook,
        knn,
        mask,
        grid_rows=2,
        grid_columns=2,
        batch_rows=2,
    )

    assert result["rows"] == 2
    assert result["quantizationError"] == pytest.approx(0.0)
    assert result["topographicErrorEuclidean1"] == pytest.approx(0.0)
    assert result["neighborPreservationChebyshev2"] == pytest.approx(1.0)
    assert result["occupiedCells"] == 2


def test_metrics_reject_out_of_range_knn_ordinals() -> None:
    matrix = np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
    codebook = np.asarray([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)
    knn = np.asarray([[2], [0]], dtype=np.int32)

    with pytest.raises(ValueError, match="out-of-range"):
        evaluate_som_projection_v1(matrix, codebook, knn, np.asarray([True, False]), grid_rows=1, grid_columns=2)
