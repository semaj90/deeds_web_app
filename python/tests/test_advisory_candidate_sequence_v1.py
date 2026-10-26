from __future__ import annotations

import pytest

from atlas_compute.advisory_candidate_sequence_v1 import run_advisory_candidate_sequence_v1


def _candidate(canonical_id: str, ordinal: int, text: str) -> dict[str, object]:
    return {
        "canonicalId": canonical_id,
        "candidateOrdinal": ordinal,
        "sourceRef": f"src:{canonical_id}",
        "sourceRevision": "source:rev-1",
        "workspaceRevision": "workspace:rev-1",
        "representationRevision": "representation:rev-1",
        "revisionStatus": "PROVEN",
        "evidenceRefs": [f"evidence:{canonical_id}"],
        "text": text,
    }


def _run(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "sequence_id": "seq:fixture-1",
        "corpus_revision": "corpus:rev-1",
        "corpus_checksum": "sha256:" + "a" * 64,
        "corpus_schema_status": "VALIDATED",
        "query": "networkx graph",
        "candidates": [
            _candidate("node-a", 2, "NetworkX graph traversal"),
            _candidate("node-b", 1, "Graph retrieval with NetworkX"),
            _candidate("node-c", 3, "Unrelated corpus entry"),
        ],
    }
    payload.update(overrides)
    return run_advisory_candidate_sequence_v1(**payload)  # type: ignore[arg-type]


def test_sequence_is_deterministic_and_preserves_aligned_identity() -> None:
    first = _run(k=2)
    second = _run(k=2)
    assert first["inputChecksum"] == second["inputChecksum"]
    assert first["topK"] == second["topK"]
    items = first["topK"]["candidates"]  # type: ignore[index]
    assert [item["canonicalId"] for item in items] == ["node-b", "node-a"]
    assert all(item["canonicalAuthority"] is False for item in items)
    assert first["writesPerformed"] is False
    assert first["promotionEligible"] is False


def test_feature_matrix_is_deterministic_identity_ordered_and_marks_missing_lanes() -> None:
    first = _run()
    second = _run()
    matrix = first["featureMatrix"]
    assert matrix["schema"] == "atlas.candidate-feature-matrix.v1"  # type: ignore[index]
    assert matrix["featureDimension"] == 7  # type: ignore[index]
    assert matrix["normalizationPolicy"].startswith("KEYWORD_OVER_QUERY_TERM_COUNT")  # type: ignore[index]
    assert matrix["corpusSnapshotChecksum"] == first["inputChecksum"]  # type: ignore[index]
    assert matrix["checksum"] == second["featureMatrix"]["checksum"]  # type: ignore[index]
    rows = matrix["rows"]  # type: ignore[index]
    assert [row["canonicalId"] for row in rows] == ["node-b", "node-a", "node-c"]
    assert [row["candidateOrdinal"] for row in rows] == [1, 2, 3]
    assert rows[0]["features"]["keywordScore"] == 1.0
    assert rows[0]["features"]["semanticScore"] is None
    assert rows[0]["featureStatus"]["semanticScore"] == "NOT_PROVIDED"
    assert matrix["canonicalAuthority"] is False  # type: ignore[index]


def test_graph_feature_is_snapshot_qualified_and_does_not_fill_other_lanes() -> None:
    result = _run(
        graph_revision="graph:rev-1",
        graph_edges=[{"srcOrdinal": 1, "dstOrdinal": 2, "kind": "REFERENCES", "weight": 1.0}],
    )
    matrix = result["featureMatrix"]
    assert matrix["graphRevision"] == "graph:rev-1"  # type: ignore[index]
    assert matrix["graphReceiptChecksum"].startswith("sha256:")  # type: ignore[index]
    assert all(row["features"]["pagerankScore"] is not None for row in matrix["rows"])  # type: ignore[index]
    assert all(row["features"]["trigramScore"] is None for row in matrix["rows"])  # type: ignore[index]


def test_sequence_rejects_unvalidated_okf_and_missing_lineage() -> None:
    with pytest.raises(ValueError, match="SEQUENCE_OKF_CORPUS_NOT_VALIDATED"):
        _run(corpus_schema_status="UNVALIDATED")
    candidate = _candidate("node-a", 1, "NetworkX graph")
    candidate["workspaceRevision"] = ""
    with pytest.raises(ValueError, match="SEQUENCE_LINEAGE_REQUIRED:workspaceRevision"):
        _run(candidates=[candidate])


def test_sequence_rejects_duplicate_ordinals_and_over_capacity_queue() -> None:
    duplicate = [_candidate("node-a", 1, "NetworkX"), _candidate("node-b", 1, "graph")]
    with pytest.raises(ValueError, match="SEQUENCE_DUPLICATE_ORDINAL"):
        _run(candidates=duplicate)
    with pytest.raises(ValueError, match="SEQUENCE_QUEUE_CAPACITY_EXCEEDED"):
        _run(queue_capacity=2)


def test_pagerank_is_advisory_and_does_not_change_keyword_order() -> None:
    base = _run(k=3)
    with_graph = _run(
        k=3,
        graph_revision="graph:rev-1",
        graph_edges=[{"srcOrdinal": 3, "dstOrdinal": 1, "kind": "REFERENCES", "weight": 1.0}],
    )
    base_ids = [item["canonicalId"] for item in base["topK"]["candidates"]]  # type: ignore[index]
    graph_ids = [item["canonicalId"] for item in with_graph["topK"]["candidates"]]  # type: ignore[index]
    assert graph_ids == base_ids
    assert with_graph["stages"]["pagerank"] == "PROVEN_ADVISORY"  # type: ignore[index]
    assert with_graph["graphReceipt"]["canonical_authority"] is False  # type: ignore[index]
    assert all("pagerankAdvisory" in item for item in with_graph["featureRows"])  # type: ignore[index]


def test_sequence_pagination_stitches_to_the_complete_deterministic_topk() -> None:
    complete = _run(k=3)["topK"]["candidates"]  # type: ignore[index]
    first_page = _run(k=1, offset=0)["topK"]["candidates"]  # type: ignore[index]
    second_page = _run(k=1, offset=1)["topK"]["candidates"]  # type: ignore[index]
    third_page = _run(k=1, offset=2)["topK"]["candidates"]  # type: ignore[index]
    assert [item["canonicalId"] for item in first_page + second_page + third_page] == [
        item["canonicalId"] for item in complete
    ]
    assert [item["score"] for item in first_page + second_page + third_page] == [
        item["score"] for item in complete
    ]


def test_chain_rule_not_claimed_for_tree_bayes_cluster_or_pagerank() -> None:
    stages = _run()["stages"]
    assert stages["naiveBayes"].startswith("NOT_RUN")  # type: ignore[index]
    assert stages["logisticRegression"].startswith("NOT_RUN")  # type: ignore[index]
    assert stages["xgboost"].startswith("NOT_RUN")  # type: ignore[index]
    assert stages["kmeans"].startswith("NOT_RUN")  # type: ignore[index]
    assert stages["backpropagation"].startswith("NOT_RUN_LOGISTIC_ONLY")  # type: ignore[index]
    notes = _run()["algorithmNotes"]
    assert "not neural-network backpropagation" in notes["xgboost"]  # type: ignore[index]
    assert "no backpropagation" in notes["naiveBayes"]  # type: ignore[index]
