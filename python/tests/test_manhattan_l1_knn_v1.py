import numpy as np
import pytest

from python.atlas_graph_runtime.manhattan_l1_knn_v1 import manhattan_l1_knn_768


def test_manhattan_l1_knn_768_orders_deterministically() -> None:
    rng = np.random.default_rng(42)
    q = np.zeros(768, dtype=np.float32)
    q[0] = 1.0
    m = rng.normal(0.0, 0.1, size=(12, 768)).astype(np.float32)
    m[3] = q.copy()  # exact match -> L1 distance 0
    m[7] = q.copy()
    m[7, 1] = 0.05   # second closest -> L1 distance 0.05
    ids = [f"cand-{i:02d}" for i in range(12)]

    res = manhattan_l1_knn_768(q, m, ids, top_k=5)
    assert res["metric"] == "manhattan_l1"
    assert res["dim"] == 768
    assert res["canonical_authority"] is False
    assert res["challenger_only"] is True
    assert len(res["hits"]) == 5
    assert res["hits"][0]["candidate_id"] == "cand-03"
    assert res["hits"][0]["l1_distance"] == 0.0
    assert res["hits"][1]["candidate_id"] == "cand-07"
    assert res["hits"][1]["l1_distance"] == pytest.approx(0.05, abs=1e-5)


def test_manhattan_l1_knn_768_tie_breaks_by_id_and_rejects_nan() -> None:
    q = np.ones(768, dtype=np.float32)
    m = np.ones((2, 768), dtype=np.float32)
    res = manhattan_l1_knn_768(q, m, ["b-id", "a-id"], top_k=2)
    assert [h["candidate_id"] for h in res["hits"]] == ["a-id", "b-id"]

    m[0, 0] = np.nan
    with pytest.raises(ValueError, match="NON_FINITE_VECTOR_INPUT"):
        manhattan_l1_knn_768(q, m, ["b-id", "a-id"], top_k=2)
