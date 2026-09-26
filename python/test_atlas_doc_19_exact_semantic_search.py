"""Focused tests for the pure parts of DOC-19 (no database, no network)."""
import numpy as np

from atlas_doc_19_exact_semantic_search_v1 import QUERY_PROMPT, cosine_scores, exact_order, parity, query_input


def test_query_prompt_is_the_search_result_contract_not_the_document_prompt():
    assert query_input("io method") == "task: search result | query: io method"
    assert not query_input("x").startswith("title:")
    assert QUERY_PROMPT.endswith("query: ")


def test_cosine_is_scale_invariant_and_orders_exactly():
    q = np.array([1.0, 0.0, 0.0])
    m = np.array([[2.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0], [-1.0, 0.0, 0.0]])
    s = cosine_scores(m, q)
    assert exact_order(s, ["a", "b", "c", "d"], 4) == [0, 1, 2, 3]


def test_ties_break_by_chunk_id_ascending_deterministically():
    s = np.array([0.5, 0.9, 0.9, 0.9])
    ids = ["d", "c", "a", "b"]
    assert [ids[i] for i in exact_order(s, ids, 3)] == ["a", "b", "c"]
    assert exact_order(s, ids, 3) == exact_order(s.copy(), list(ids), 3)


def test_parity_reports_top1_order_and_score_delta():
    p = parity(["a", "b", "c"], [0.9, 0.8, 0.7], ["a", "b", "c"], [0.9, 0.8, 0.7000001])
    assert p["top1Agreement"] and p["orderExact"] and p["topKOverlap"] == 1.0 and p["maxScoreDelta"] < 1e-6
    q = parity(["a", "b"], [0.9, 0.8], ["b", "a"], [0.9, 0.8])
    assert q["top1Agreement"] is True  # exact score tie at the top is tie-safe
    assert q["orderExact"] is False
    r = parity(["a"], [0.9], ["z"], [0.5])
    assert r["top1Agreement"] is False
