from __future__ import annotations

from ga8_judge_v2_common import (
    judged_pool_recall_at_k,
    ndcg_at_k,
    reciprocal_rank_at_k,
    sha256_float32,
    sha256_json,
)


def test_sha256_json_is_key_order_independent() -> None:
    assert sha256_json({"b": 2, "a": 1}) == sha256_json({"a": 1, "b": 2})


def test_sha256_float32_is_value_sensitive_and_stable() -> None:
    assert sha256_float32([1.0, 2.0, 3.0]) == sha256_float32([1.0, 2.0, 3.0])
    assert sha256_float32([1.0, 2.0, 3.0]) != sha256_float32([1.0, 2.0, 3.5])


def test_graded_metrics_reward_correct_head_order() -> None:
    all_grades = [3, 2, 1, 0]
    ideal = [3, 2, 1, 0]
    reversed_head = [0, 1, 2, 3]

    assert ndcg_at_k(ideal, all_grades, 4) == 1.0
    assert ndcg_at_k(reversed_head, all_grades, 4) < 1.0
    assert reciprocal_rank_at_k(ideal, 4, relevant_grade=2) == 1.0
    assert reciprocal_rank_at_k(reversed_head, 4, relevant_grade=2) == 1 / 3
    assert judged_pool_recall_at_k(ideal, all_grades, 2, relevant_grade=2) == 1.0


def test_no_positive_grade_has_no_pool_recall_or_ndcg() -> None:
    grades = [1, 0, 1]
    assert judged_pool_recall_at_k(grades, grades, 3, relevant_grade=2) is None
    assert ndcg_at_k([0, 0], [0, 0], 2) is None
