from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "atlas" / "repo-semantic-pagerank-svd-dag-prefill-v1.py"
SPEC = importlib.util.spec_from_file_location("repo_semantic_pagerank_svd_dag_prefill_v1", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


def test_personalized_pagerank_probability_conservation_and_hub_boost() -> None:
    nodes = ["a", "b", "c"]
    edges = [("a", "b", 1.0), ("c", "b", 1.0), ("b", "a", 0.5)]
    scores = MOD.run_personalized_pagerank(nodes, edges, {"a": 0.5, "c": 0.5})
    assert abs(sum(scores.values()) - 1.0) < 1e-6
    assert scores["b"] > scores["c"]


def test_svd_recommendations_variance_and_alignment() -> None:
    rng = np.random.default_rng(7)
    vecs = rng.normal(0.0, 0.2, size=(6, 32)).astype(np.float64)
    vecs[0, :8] += 2.0
    vecs[1, :8] += 1.8
    pr = np.array([0.5, 0.3, 0.05, 0.05, 0.05, 0.05], dtype=np.float64)
    align, explained = MOD.compute_svd_recommendations(vecs, pr, max_rank=4)
    assert len(align) == 6
    assert len(explained) == 4
    assert sum(explained) <= 1.0001
    assert align[0] > align[5]
