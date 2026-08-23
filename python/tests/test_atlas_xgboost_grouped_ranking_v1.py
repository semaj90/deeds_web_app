import importlib.util
import math
from pathlib import Path

import numpy as np
import pytest

MODULE_PATH = Path(__file__).resolve().parents[1] / 'atlas_xgboost_grouped_ranking_v1.py'
spec = importlib.util.spec_from_file_location('atlas_xgboost_grouped_ranking_v1', MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(module)
prepare_grouped_ranking_dataset_v1 = module.prepare_grouped_ranking_dataset_v1


def test_grouped_dataset_sorts_by_qid_and_candidate_and_is_deterministic():
    rows = [
        {"qid": "q2", "packet_key": "p2", "label": 0, "f1": 2.0},
        {"qid": "q1", "packet_key": "p2", "label": 1, "f1": 1.0},
        {"qid": "q2", "packet_key": "p1", "label": 1, "f1": 3.0},
        {"qid": "q1", "packet_key": "p1", "label": 0, "f1": 4.0},
    ]

    left = prepare_grouped_ranking_dataset_v1(rows, ["f1"])
    right = prepare_grouped_ranking_dataset_v1(reversed(rows), ["f1"])

    assert left.qid_labels == ("q1", "q2")
    assert left.candidate_keys == ("p1", "p2", "p1", "p2")
    assert left.qid.tolist() == [0, 0, 1, 1]
    assert left.dataset_checksum == right.dataset_checksum
    np.testing.assert_array_equal(left.X, right.X)
    np.testing.assert_array_equal(left.y, right.y)


def test_grouped_dataset_preserves_missing_feature_as_nan_not_zero():
    rows = [
        {"qid": "q1", "packet_key": "p1", "label": 1, "domain": None},
        {"qid": "q1", "packet_key": "p2", "label": 0, "domain": 0.0},
    ]
    dataset = prepare_grouped_ranking_dataset_v1(rows, ["domain"])
    assert math.isnan(float(dataset.X[0, 0]))
    assert float(dataset.X[1, 0]) == 0.0


def test_grouped_dataset_rejects_duplicate_candidate_within_qid():
    with pytest.raises(ValueError, match="XGB_DUPLICATE_QID_CANDIDATE"):
        prepare_grouped_ranking_dataset_v1([
            {"qid": "q1", "packet_key": "p1", "label": 1, "f": 1},
            {"qid": "q1", "packet_key": "p1", "label": 0, "f": 2},
        ], ["f"])


def test_grouped_dataset_requires_two_candidates_per_query():
    with pytest.raises(ValueError, match="XGB_QID_REQUIRES_AT_LEAST_TWO_CANDIDATES"):
        prepare_grouped_ranking_dataset_v1([
            {"qid": "q1", "packet_key": "p1", "label": 1, "f": 1},
            {"qid": "q2", "packet_key": "p2", "label": 0, "f": 2},
        ], ["f"])
