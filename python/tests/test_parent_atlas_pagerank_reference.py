import math

from python.parent_atlas_pagerank_reference import WeightedEdge, pagerank


def test_three_cycle_is_uniform():
    scores = pagerank(
        ["A", "B", "C"],
        [WeightedEdge("A", "B"), WeightedEdge("B", "C"), WeightedEdge("C", "A")],
    )
    assert math.isclose(sum(scores.values()), 1.0, abs_tol=1e-12)
    for score in scores.values():
        assert math.isclose(score, 1.0 / 3.0, rel_tol=0.0, abs_tol=1e-10)


def test_dangling_mass_is_redistributed_and_normalized():
    scores = pagerank(
        ["A", "B", "C"],
        [WeightedEdge("A", "B"), WeightedEdge("B", "C")],
    )
    assert math.isclose(sum(scores.values()), 1.0, abs_tol=1e-12)
    assert all(score >= 0.0 for score in scores.values())
    assert scores["C"] > scores["B"] > scores["A"]


def test_weighted_outgoing_probability_changes_rank():
    balanced = pagerank(
        ["A", "B", "C"],
        [WeightedEdge("A", "B", 1.0), WeightedEdge("A", "C", 1.0), WeightedEdge("B", "A"), WeightedEdge("C", "A")],
    )
    biased = pagerank(
        ["A", "B", "C"],
        [WeightedEdge("A", "B", 9.0), WeightedEdge("A", "C", 1.0), WeightedEdge("B", "A"), WeightedEdge("C", "A")],
    )
    assert math.isclose(balanced["B"], balanced["C"], abs_tol=1e-10)
    assert biased["B"] > biased["C"]


def test_personalization_supports_query_conditioned_ppr():
    scores = pagerank(
        ["A", "B", "C"],
        [WeightedEdge("A", "B"), WeightedEdge("B", "C"), WeightedEdge("C", "A")],
        personalization={"A": 1.0, "B": 0.0, "C": 0.0},
    )
    assert math.isclose(sum(scores.values()), 1.0, abs_tol=1e-12)
    assert scores["A"] > scores["C"] > scores["B"]


def test_rejects_invalid_edges():
    try:
        pagerank(["A"], [WeightedEdge("A", "missing")])
    except ValueError as exc:
        assert "unknown node" in str(exc)
    else:
        raise AssertionError("expected ValueError")
