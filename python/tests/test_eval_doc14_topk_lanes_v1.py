from __future__ import annotations

import importlib.util
import hashlib
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "atlas" / "eval-doc14-topk-lanes-v1.py"
SPEC = importlib.util.spec_from_file_location("eval_doc14_topk_lanes_v1", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def seal_query_set(query_set: dict) -> dict:
    query_set["querySetRevision"] = MODULE.reviewed_query_set_revision(query_set)
    return query_set


def test_default_evaluation_is_explicitly_a_self_match_smoke_not_a_quality_benchmark() -> None:
    records = [
        {
            "chunkId": "chunk-a",
            "sourceRef": "docs/api.md",
            "text": "Firecrawl scrape API supports page extraction.",
            "pgReadbackStatus": "PROVEN",
            "chunkSha256": "sha256:fixture",
        }
    ]
    queries = [{
        "query": "Firecrawl scrape API",
        "exactIdentifier": "scrape",
        "expectedSourceRef": "docs/api.md",
    }]

    result = MODULE.evaluate_topk_lanes(records, queries, k=5)

    assert result["evaluationKind"] == "DIAGNOSTIC_SELF_MATCH_SMOKE"
    assert result["reviewedRelevanceLabels"] is False
    assert result["graphLaneAvailable"] is False
    assert result["qualityBenchmarkEligible"] is False
    assert "corpus_order_prior" in result["metrics"]
    assert "graph_prior" not in result["metrics"]


def test_frozen_relevance_labels_produce_rank_metrics_without_claiming_review_authenticity() -> None:
    text_a = "Firecrawl scrape endpoint extracts web pages."
    text_b = "PostgreSQL full text search ranks documents."
    records = [
        {
            "chunkId": "chunk-a", "sourceRef": "docs/firecrawl.md", "sourceRevision": "sha256:a",
            "chunkSha256": hashlib.sha256(text_a.encode()).hexdigest(), "text": text_a,
            "pgReadbackStatus": "PROVEN",
        },
        {
            "chunkId": "chunk-b", "sourceRef": "docs/postgres.md", "sourceRevision": "sha256:b",
            "chunkSha256": hashlib.sha256(text_b.encode()).hexdigest(), "text": text_b,
            "pgReadbackStatus": "PROVEN",
        },
    ]
    query_set = {
        "schema": "atlas.doc14-reviewed-query-set.v1",
        "reviewStatus": "REVIEWED",
        "reviewerRef": "review:human-fixture",
        "querySetRevision": "",
        "corpusChecksum": MODULE.corpus_identity_checksum(records),
        "queries": [
            {
                "queryId": f"q-{i}", "query": "Firecrawl scrape endpoint",
                "exactIdentifier": "scrape",
                "relevantChunks": [{"chunkId": "chunk-a", "grade": 3}],
            }
            for i in range(30)
        ],
    }
    seal_query_set(query_set)

    MODULE.validate_reviewed_query_set(query_set, records)
    result = MODULE.evaluate_topk_lanes(
        records, query_set["queries"], k=10,
        evaluation_kind="REVIEWED_FROZEN_COHORT",
        reviewed_relevance_labels=True,
        cohort_revision=query_set["querySetRevision"],
    )

    assert result["evaluationKind"] == "REVIEWED_FROZEN_COHORT"
    assert result["reviewedRelevanceLabels"] is True
    assert result["reviewedCohortShapeValid"] is True
    assert result["qualityBenchmarkEligible"] is False
    assert result["metrics"]["lexical"]["recallAtK"] == 1.0
    assert result["metrics"]["lexical"]["mrr"] == 1.0
    assert result["metrics"]["lexical"]["ndcgAtK"] == 1.0
    assert result["metrics"]["lexical"]["precisionAtK"] > 0.0


def test_reviewed_set_rejects_corpus_revision_mismatch_and_unknown_relevant_ids() -> None:
    text = "an API reference"
    records = [{
        "chunkId": "chunk-a", "sourceRef": "docs/a.md", "sourceRevision": "sha256:a",
        "chunkSha256": hashlib.sha256(text.encode()).hexdigest(), "text": text,
    }]
    base = {
        "schema": "atlas.doc14-reviewed-query-set.v1", "reviewStatus": "REVIEWED",
        "reviewerRef": "review:fixture", "querySetRevision": "",
        "corpusChecksum": MODULE.corpus_identity_checksum(records),
        "queries": [{"queryId": f"q-{i}", "query": "API", "relevantChunks": [{"chunkId": "chunk-a", "grade": 1}]} for i in range(30)],
    }
    seal_query_set(base)
    mismatch = seal_query_set({**base, "corpusChecksum": "sha256:stale"})
    try:
        MODULE.validate_reviewed_query_set(mismatch, records)
        assert False, "expected corpus checksum rejection"
    except ValueError as exc:
        assert str(exc) == "REVIEWED_QUERY_SET_CORPUS_CHECKSUM_MISMATCH"

    unknown = seal_query_set({**base, "queries": [dict(q, relevantChunks=[{"chunkId": "missing", "grade": 2}]) for q in base["queries"]]})
    try:
        MODULE.validate_reviewed_query_set(unknown, records)
        assert False, "expected unknown ID rejection"
    except ValueError as exc:
        assert str(exc).startswith("RELEVANT_CHUNK_NOT_IN_FROZEN_CORPUS:")

    corrupted = [{**records[0], "chunkSha256": "0" * 64}]
    stale_revision = seal_query_set({**base, "corpusChecksum": MODULE.corpus_identity_checksum(corrupted)})
    try:
        MODULE.validate_reviewed_query_set(stale_revision, corrupted)
        assert False, "expected chunk byte checksum rejection"
    except ValueError as exc:
        assert str(exc) == "FROZEN_CORPUS_CHUNK_CHECKSUM_MISMATCH:chunk-a"
