#!/usr/bin/env python3
"""Offline paired evaluation of a hard domain prefilter against baseline ranking."""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

from ga8_judge_v2_common import judged_pool_recall_at_k, ndcg_at_k, reciprocal_rank_at_k, sha256_json

INPUT_SCHEMA = "atlas.domain-filter-retrieval-replay-input.v1"
REPORT_SCHEMA = "atlas.domain-filter-retrieval-replay-report.v1"
RELEVANT_GRADE = 2


def _require_sha256(value: Any, code: str) -> str:
    if not isinstance(value, str) or len(value) != 71 or not value.startswith("sha256:"):
        raise ValueError(code)
    try:
        int(value[7:], 16)
    except ValueError as exc:
        raise ValueError(code) from exc
    return value


def _metrics(ranked: list[dict[str, Any]], all_grades: list[int], k: int) -> dict[str, float | None]:
    grades = [int(row["relevanceGrade"]) for row in ranked]
    return {
        "ndcgAtK": ndcg_at_k(grades, all_grades, k),
        "mrrAtK": reciprocal_rank_at_k(grades, k, RELEVANT_GRADE),
        "judgedPoolRecallAtK": judged_pool_recall_at_k(grades, all_grades, k, RELEVANT_GRADE),
    }


def evaluate_document(document: dict[str, Any], *, k: int = 10) -> dict[str, Any]:
    if document.get("schema") != INPUT_SCHEMA:
        raise ValueError("INPUT_SCHEMA_MISMATCH")
    if document.get("evaluationClass") != "HUMAN_REVIEWED" or document.get("canonicalAuthority") is not False:
        raise ValueError("HUMAN_REVIEWED_NONCANONICAL_INPUT_REQUIRED")
    if not isinstance(k, int) or isinstance(k, bool) or k < 1:
        raise ValueError("TOP_K_INVALID")

    taxonomy_revision = str(document.get("taxonomyRevision", ""))
    classifier_checksum = _require_sha256(document.get("classifierArtifactChecksum"), "CLASSIFIER_CHECKSUM_INVALID")
    snapshot_revision = _require_sha256(document.get("candidateSnapshotRevision"), "CANDIDATE_SNAPSHOT_REVISION_INVALID")
    judgment_checksum = _require_sha256(document.get("judgmentSetChecksum"), "JUDGMENT_CHECKSUM_INVALID")
    domains = document.get("taxonomyDomainIds")
    queries = document.get("queries")
    if not taxonomy_revision or not isinstance(domains, list) or not domains or len(set(domains)) != len(domains):
        raise ValueError("TAXONOMY_CONTRACT_INVALID")
    if not isinstance(queries, list) or not queries:
        raise ValueError("QUERY_SET_EMPTY")

    query_ids: set[str] = set()
    normalized_pools: list[dict[str, Any]] = []
    normalized_judgments: list[dict[str, Any]] = []
    query_results: list[dict[str, Any]] = []

    for query in queries:
        query_id = str(query.get("queryId", ""))
        if not query_id or query_id in query_ids:
            raise ValueError("QUERY_ID_MISSING_OR_DUPLICATE")
        query_ids.add(query_id)
        if query.get("classificationSource") != "HELD_OUT_MODEL" or query.get("classificationTaxonomyRevision") != taxonomy_revision:
            raise ValueError("QUERY_DOMAIN_NOT_HELD_OUT_OR_TAXONOMY_MISMATCH")
        if query.get("classifierArtifactChecksum") != classifier_checksum:
            raise ValueError("QUERY_CLASSIFIER_ARTIFACT_MISMATCH")
        query_domain = query.get("predictedDomainId")
        if query_domain not in domains:
            raise ValueError("QUERY_DOMAIN_OUTSIDE_TAXONOMY")
        probability = query.get("predictedDomainProbability")
        if not isinstance(probability, (float, int)) or isinstance(probability, bool) or not math.isfinite(probability) or not 0 <= probability <= 1:
            raise ValueError("QUERY_DOMAIN_PROBABILITY_INVALID")
        candidates = query.get("candidates")
        if not isinstance(candidates, list) or not candidates:
            raise ValueError("CANDIDATE_POOL_EMPTY")

        candidate_ids: set[str] = set()
        ranks: set[int] = set()
        rows: list[dict[str, Any]] = []
        for candidate in candidates:
            packet_key = str(candidate.get("packetKey", ""))
            source_ref = str(candidate.get("sourceRef", ""))
            rank = candidate.get("baselineRank")
            grade = candidate.get("relevanceGrade")
            if not packet_key or not source_ref or packet_key in candidate_ids:
                raise ValueError("CANDIDATE_IDENTITY_MISSING_OR_DUPLICATE")
            if not isinstance(rank, int) or isinstance(rank, bool) or rank < 1 or rank in ranks:
                raise ValueError("BASELINE_RANK_INVALID_OR_DUPLICATE")
            if not isinstance(grade, int) or isinstance(grade, bool) or grade not in range(4):
                raise ValueError("RELEVANCE_GRADE_INVALID")
            if candidate.get("judgmentSource") != "HUMAN_REVIEWED":
                raise ValueError("UNREVIEWED_JUDGMENT_PRESENT")
            reviewer_id = candidate.get("reviewerId")
            confidence = candidate.get("confidence")
            if not isinstance(reviewer_id, str) or not reviewer_id.strip():
                raise ValueError("REVIEWER_ID_MISSING")
            if not isinstance(confidence, (float, int)) or isinstance(confidence, bool) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
                raise ValueError("JUDGMENT_CONFIDENCE_INVALID")
            _require_sha256(candidate.get("reviewReceiptChecksum"), "REVIEW_RECEIPT_CHECKSUM_INVALID")
            candidate_domain = candidate.get("reviewedDomainId")
            if candidate_domain is not None and candidate_domain not in domains:
                raise ValueError("CANDIDATE_DOMAIN_OUTSIDE_TAXONOMY")
            candidate_ids.add(packet_key)
            ranks.add(rank)
            rows.append(candidate)
            normalized_judgments.append({
                "queryId": query_id,
                "packetKey": packet_key,
                "relevanceGrade": grade,
                "judgmentSource": candidate["judgmentSource"],
                "reviewerId": reviewer_id.strip(),
                "confidence": confidence,
                "reviewReceiptChecksum": candidate["reviewReceiptChecksum"],
            })
        if ranks != set(range(1, len(rows) + 1)):
            raise ValueError("BASELINE_RANK_SEQUENCE_INVALID")
        rows.sort(key=lambda row: (row["baselineRank"], row["packetKey"]))
        normalized_pools.append({
            "queryId": query_id,
            "predictedDomainId": query_domain,
            "candidates": [{
                "packetKey": row["packetKey"], "sourceRef": row["sourceRef"],
                "baselineRank": row["baselineRank"], "reviewedDomainId": row.get("reviewedDomainId"),
            } for row in rows],
        })

        grades = [int(row["relevanceGrade"]) for row in rows]
        baseline = rows[:k]
        filtered_pool = [row for row in rows if row.get("reviewedDomainId") == query_domain]
        filtered = filtered_pool[:k]
        relevant_total = sum(grade >= RELEVANT_GRADE for grade in grades)
        relevant_removed = sum(
            row["relevanceGrade"] >= RELEVANT_GRADE and row.get("reviewedDomainId") != query_domain
            for row in rows
        )
        query_results.append({
            "queryId": query_id,
            "candidateCount": len(rows),
            "filteredCandidateCount": len(filtered_pool),
            "candidateCoverage": len(filtered_pool) / len(rows),
            "relevantCandidateCount": relevant_total,
            "relevantCandidatesRemoved": relevant_removed,
            "baseline": _metrics(baseline, grades, k),
            "domainPrefilter": _metrics(filtered, grades, k),
        })

    normalized_judgments.sort(key=lambda row: (row["queryId"], row["packetKey"]))
    normalized_pools.sort(key=lambda row: row["queryId"])
    if sha256_json(normalized_pools) != snapshot_revision:
        raise ValueError("CANDIDATE_SNAPSHOT_CHECKSUM_MISMATCH")
    if sha256_json(normalized_judgments) != judgment_checksum:
        raise ValueError("JUDGMENT_SET_CHECKSUM_MISMATCH")

    def average(key: str, metric: str) -> float | None:
        values = [row[key][metric] for row in query_results if row[key][metric] is not None]
        return sum(values) / len(values) if values else None

    baseline_summary = {metric: average("baseline", metric) for metric in ("ndcgAtK", "mrrAtK", "judgedPoolRecallAtK")}
    filtered_summary = {metric: average("domainPrefilter", metric) for metric in ("ndcgAtK", "mrrAtK", "judgedPoolRecallAtK")}
    return {
        "schema": REPORT_SCHEMA,
        "status": "OFFLINE_DOMAIN_FILTER_REPLAY_COMPLETE_NOT_QUALIFIED",
        "canonicalAuthority": False,
        "humanReviewMarkersPresent": True,
        "humanReviewAdmissionIndependentlyVerified": False,
        "productionPromotionEligible": False,
        "writesPerformed": False,
        "k": k,
        "taxonomyRevision": taxonomy_revision,
        "classifierArtifactChecksum": classifier_checksum,
        "candidateSnapshotRevision": snapshot_revision,
        "judgmentSetChecksum": judgment_checksum,
        "queryCount": len(query_results),
        "baselineSummary": baseline_summary,
        "domainPrefilterSummary": filtered_summary,
        "deltaPrefilterMinusBaseline": {
            metric: (filtered_summary[metric] - baseline_summary[metric])
            if filtered_summary[metric] is not None and baseline_summary[metric] is not None else None
            for metric in baseline_summary
        },
        "queries": query_results,
        "interpretationLimit": "Replays a filter over the supplied frozen candidate pools. Human-review markers and checksums are structurally checked but reviewer authority is not independently verified. This is not corpus recall, live pre-retrieval filtering, or production qualification.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Frozen, checksummed JSON input")
    parser.add_argument("--output", required=True, help="Local JSON report path")
    parser.add_argument("--k", type=int, default=10)
    args = parser.parse_args()
    document = json.loads(Path(args.input).read_text(encoding="utf-8"))
    report = evaluate_document(document, k=args.k)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "queryCount": report["queryCount"], "productionPromotionEligible": False, "output": str(output)}))


if __name__ == "__main__":
    main()
