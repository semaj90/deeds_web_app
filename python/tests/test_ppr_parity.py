from __future__ import annotations

import pytest

from atlas_graph_runtime.contracts import GraphExecutionReceipt
from atlas_graph_runtime.networkx_executor import run_personalized_pagerank
from atlas_graph_runtime.pagerank_parity import pagerank_scores_checksum
from atlas_graph_runtime.ppr_parity import (
    build_ppr_execution_identity_v1,
    compare_ppr_v1,
    dangling_ordinals,
    normalize_seed_weights,
)
from atlas_graph_runtime.contracts import upgrade_graph_execution_receipt_v1


def identity(**overrides):
    values = {
        "graph_revision": "graph:fixture:v1",
        "candidate_snapshot_revision": "snapshot:fixture:v1",
        "candidate_ordinal_map_checksum": "sha256:" + "a" * 64,
        "graph_ordinal_map_checksum": "sha256:" + "b" * 64,
        "candidate_ordinals": [0, 1, 2, 3, 4],
        "edge_ordinals": [(0, 1), (1, 2), (2, 0), (0, 3)],
        "seed_weights": {0: 7.0, 2: 3.0},
        "alpha": 0.85,
        "epsilon": 1e-9,
        "max_iterations": 1000,
    }
    values.update(overrides)
    return build_ppr_execution_identity_v1(**values)


def receipt(backend, ident, scores):
    legacy = GraphExecutionReceipt(
        schema="atlas.graph-execution-receipt.v1",
        operation="GRAPH_PPR",
        requested_backend=backend,
        effective_backend=backend,
        graph_revision=ident.graph_revision,
        node_count=len(ident.candidate_ordinals),
        edge_count=len(ident.edge_ordinals),
        status="PROVEN",
    )
    return upgrade_graph_execution_receipt_v1(
        legacy,
        executor_revision=f"{backend}:fixture-v1",
        input_checksum=ident.canonical_input_checksum(),
        output_checksum=pagerank_scores_checksum(scores),
    )


def test_seed_weights_are_normalized_and_ordinals_are_ordered():
    assert normalize_seed_weights({9: 3, 2: 1}) == ((2, 0.25), (9, 0.75))
    assert identity().seed_weights == ((0, 0.7), (2, 0.3))


def test_ppr_identity_binds_graph_map_seed_weights_and_parameters():
    base = identity()
    assert base.canonical_input_checksum() != identity(seed_weights={0: 3, 2: 7}).canonical_input_checksum()
    assert base.canonical_input_checksum() != identity(alpha=0.9).canonical_input_checksum()
    assert base.canonical_input_checksum() != identity(graph_ordinal_map_checksum="sha256:" + "c" * 64).canonical_input_checksum()


def test_ppr_cpu_oracle_conserves_all_candidate_ordinals_and_dangling_nodes():
    ident = identity()
    scores, result = run_personalized_pagerank(identity=ident)
    assert result.status == "PROVEN"
    assert result.effective_backend == "networkx"
    assert set(scores) == set(ident.candidate_ordinals)
    assert abs(sum(scores.values()) - 1.0) < 1e-9
    assert dangling_ordinals(ident) == (3, 4)
    assert scores[3] > 0
    assert scores[4] == 0.0


def test_ppr_parity_receipt_reports_requested_score_rank_and_dangling_metrics():
    ident = identity()
    reference, nx_receipt = run_personalized_pagerank(identity=ident)
    # Perturb within a small score tolerance while preserving the order.
    challenger = {ordinal: score + (1e-10 if ordinal == 0 else 0.0) for ordinal, score in reference.items()}
    challenger_total = sum(challenger.values())
    challenger = {ordinal: score / challenger_total for ordinal, score in challenger.items()}
    cg_receipt = receipt("cugraph", ident, challenger)
    result = compare_ppr_v1(
        identity=ident,
        reference_receipt=nx_receipt,
        challenger_receipt=cg_receipt,
        reference_scores=reference,
        challenger_scores=challenger,
        dangling_ordinals=dangling_ordinals(ident),
        tolerance=1e-6,
        rank_displacement_tolerance=0,
    )
    assert result.status == "PARITY_PROVEN"
    assert result.seed_weights == ident.seed_weights
    assert result.dangling_ordinals == (3, 4)
    assert result.metrics["pearson"] == pytest.approx(1.0)
    assert result.metrics["spearman"] == 1.0
    assert result.metrics["scoreL1"] >= 0
    assert result.metrics["scoreLInf"] <= 1e-6
    assert set(result.metrics["topKOverlap"]) == {"10", "50", "100"}
    assert result.canonical_authority is False
    assert result.retrieval_vote_added is False
    assert result.writes_performed is False


def test_ppr_comparator_rejects_different_seeded_input_checksum():
    ident = identity()
    scores, nx_receipt = run_personalized_pagerank(identity=ident)
    changed = identity(seed_weights={0: 3, 2: 7})
    changed_scores = {o: 1 / len(scores) for o in scores}
    with pytest.raises(ValueError, match="PPR_PARITY_RECEIPT_IDENTITY_MISMATCH"):
        compare_ppr_v1(
            identity=ident,
            reference_receipt=nx_receipt,
            challenger_receipt=receipt("cugraph", changed, changed_scores),
            reference_scores=scores,
            challenger_scores=changed_scores,
            dangling_ordinals=dangling_ordinals(ident),
        )
