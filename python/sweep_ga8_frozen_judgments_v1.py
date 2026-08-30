"""GA8-ABLATION-02: pure offline semantic/PageRank weight sweep over immutable artifacts.

Inputs only:
  1) FrozenSemanticCandidatePoolV1 NDJSON
  2) LlmJudgedSemanticRelevanceV2 NDJSON
  3) GraphAuthorityFeatureSnapshotV1 JSON

No PostgreSQL, Qdrant, embedding model, LLM, or label discovery is permitted in this process.
Primary metric is nDCG@10; MRR@10 and judgedPoolRecall@10 use relevance grade >= 2.

canonical_authority: false
human_gold_relevance_set_proven: false
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from statistics import mean
from typing import Any

from ga8_judge_v2_common import (
    canonical_json,
    judged_pool_recall_at_k,
    load_ndjson,
    ndcg_at_k,
    reciprocal_rank_at_k,
    sha256_json,
)

FROZEN_POOL_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
JUDGMENT_PATH = os.getenv("GA8_JUDGMENT_PATH", ".tmp/atlas/ga8-llm-judged-semantic-relevance-v2.ndjson")
GRAPH_SNAPSHOT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_PATH", ".tmp/atlas/ga8-graph-authority-feature-snapshot-v1.json")
REPORT_PATH = os.getenv("GA8_FROZEN_ABLATION_REPORT", "docs/reports/ga8-frozen-llm-silver-ablation-v1.json")
FINAL_K = int(os.getenv("GA8_FINAL_K", "10"))
WEIGHT_GRID = [round(i / 10.0, 1) for i in range(11)]
RELEVANT_GRADE = 2


def pool_checksum_payload(pool: dict[str, Any]) -> dict[str, Any]:
    return {
        "queryId": pool["queryId"],
        "queryTextChecksum": pool["queryTextChecksum"],
        "queryEmbeddingChecksum": pool["queryEmbeddingChecksum"],
        "poolK": pool["poolK"],
        "candidates": [
            {
                "poolOrdinal": row["poolOrdinal"],
                "candidateId": row["candidateId"],
                "sourceRef": row["sourceRef"],
                "sourceRevision": row.get("sourceRevision"),
                "semanticScore": row["semanticScore"],
                "evidenceTextChecksum": row["evidenceTextChecksum"],
            }
            for row in pool["candidates"]
        ],
    }


def load_graph_snapshot() -> dict[str, Any]:
    payload = json.loads(Path(GRAPH_SNAPSHOT_PATH).read_text(encoding="utf-8"))
    if payload.get("schema") != "atlas.graph-authority-feature-snapshot.v1":
        raise SystemExit("GA8_GRAPH_SNAPSHOT_SCHEMA_MISMATCH")
    if sha256_json(payload.get("rows", [])) != payload.get("vectorChecksum"):
        raise SystemExit("GA8_GRAPH_SNAPSHOT_CHECKSUM_MISMATCH")
    return payload


def aggregate(values: list[float | None]) -> float | None:
    finite = [float(v) for v in values if v is not None]
    return mean(finite) if finite else None


def main() -> None:
    if FINAL_K <= 0:
        raise SystemExit("GA8_FINAL_K_INVALID")

    pools = load_ndjson(FROZEN_POOL_PATH)
    judgments = load_ndjson(JUDGMENT_PATH)
    graph = load_graph_snapshot()
    if not pools or not judgments:
        raise SystemExit("GA8_OFFLINE_INPUT_EMPTY")

    for pool in pools:
        if pool.get("schema") != "atlas.frozen-semantic-candidate-pool.v1":
            raise SystemExit("GA8_FROZEN_POOL_SCHEMA_MISMATCH")
        if int(pool.get("labelInputsUsed", -1)) != 0 or int(pool.get("graphInputsUsed", -1)) != 0:
            raise SystemExit("GA8_FROZEN_POOL_TAINTED")
        if sha256_json(pool_checksum_payload(pool)) != pool.get("candidatePoolChecksum"):
            raise SystemExit(f"GA8_CANDIDATE_POOL_CHECKSUM_MISMATCH:{pool.get('queryId')}")

    expected_snapshot_revision = sha256_json([
        {"queryId": pool["queryId"], "candidatePoolChecksum": pool["candidatePoolChecksum"]}
        for pool in pools
    ])
    snapshot_revisions = {str(pool.get("candidateSnapshotRevision")) for pool in pools}
    if snapshot_revisions != {expected_snapshot_revision}:
        raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MISMATCH")
    if str(graph.get("candidateSnapshotRevision")) != expected_snapshot_revision:
        raise SystemExit("GA8_GRAPH_CANDIDATE_SNAPSHOT_MISMATCH")

    judgment_universes = {str(row.get("judgmentUniverseChecksum")) for row in judgments}
    if len(judgment_universes) != 1 or "None" in judgment_universes:
        raise SystemExit("GA8_JUDGMENT_UNIVERSE_MIXED_OR_MISSING")
    judgment_universe_checksum = next(iter(judgment_universes))

    judgments_by_query: dict[str, dict[str, dict[str, Any]]] = {}
    for row in judgments:
        if row.get("schema") != "atlas.llm-judged-semantic-relevance.v2":
            raise SystemExit("GA8_JUDGMENT_SCHEMA_MISMATCH")
        judgments_by_query.setdefault(str(row["queryId"]), {})[str(row["candidateId"])] = row

    graph_by_key = {
        (str(row["queryId"]), str(row["candidateId"])): row
        for row in graph.get("rows", [])
    }

    per_weight: dict[float, list[dict[str, float | None]]] = {w: [] for w in WEIGHT_GRID}
    query_receipts: list[dict[str, Any]] = []
    skipped_no_positive = 0
    skipped_no_stable = 0
    total_unstable_rows = 0

    for pool in pools:
        query_id = str(pool["queryId"])
        judgment_map = judgments_by_query.get(query_id, {})
        if not judgment_map:
            skipped_no_stable += 1
            continue

        # Normalize PageRank over the complete frozen pool before judgment filtering so labels
        # cannot influence feature normalization.
        graph_values = []
        for candidate in pool["candidates"]:
            graph_row = graph_by_key.get((query_id, str(candidate["candidateId"])))
            graph_values.append(float(graph_row["pageRank"]) if graph_row else 0.0)
        max_page_rank = max(graph_values, default=0.0) or 1.0

        stable_rows: list[dict[str, Any]] = []
        unstable = 0
        for candidate in pool["candidates"]:
            candidate_id = str(candidate["candidateId"])
            judgment = judgment_map.get(candidate_id)
            if not judgment or judgment.get("stable") is not True or judgment.get("relevanceGrade") is None:
                unstable += 1
                continue
            graph_row = graph_by_key.get((query_id, candidate_id))
            page_rank = float(graph_row["pageRank"]) if graph_row else 0.0
            stable_rows.append({
                "candidateId": candidate_id,
                "poolOrdinal": int(candidate["poolOrdinal"]),
                "semanticScore": float(candidate["semanticScore"]),
                "pageRank": page_rank,
                "pageRankNorm": page_rank / max_page_rank,
                "pageRankPresent": bool(graph_row and graph_row.get("pageRankPresent")),
                "grade": int(judgment["relevanceGrade"]),
            })
        total_unstable_rows += unstable
        if not stable_rows:
            skipped_no_stable += 1
            continue

        all_grades = [row["grade"] for row in stable_rows]
        if not any(grade >= RELEVANT_GRADE for grade in all_grades):
            skipped_no_positive += 1
            continue

        query_metric_receipt: dict[str, Any] = {
            "queryId": query_id,
            "candidatePoolChecksum": pool["candidatePoolChecksum"],
            "stableCandidateCount": len(stable_rows),
            "unstableCandidateCount": unstable,
            "pageRankPresentStableCandidates": sum(1 for row in stable_rows if row["pageRankPresent"]),
            "metrics": {},
        }
        for weight in WEIGHT_GRID:
            ranked = sorted(
                stable_rows,
                key=lambda row: (
                    -(weight * row["semanticScore"] + (1.0 - weight) * row["pageRankNorm"]),
                    row["poolOrdinal"],
                    row["candidateId"],
                ),
            )
            ranked_grades = [row["grade"] for row in ranked]
            metrics = {
                "ndcgAt10": ndcg_at_k(ranked_grades, all_grades, FINAL_K),
                "mrrAt10": reciprocal_rank_at_k(ranked_grades, FINAL_K, RELEVANT_GRADE),
                "judgedPoolRecallAt10": judged_pool_recall_at_k(ranked_grades, all_grades, FINAL_K, RELEVANT_GRADE),
            }
            per_weight[weight].append(metrics)
            query_metric_receipt["metrics"][str(weight)] = metrics
        query_receipts.append(query_metric_receipt)

    summary: dict[str, Any] = {}
    for weight in WEIGHT_GRID:
        rows = per_weight[weight]
        summary[str(weight)] = {
            "avgNdcgAt10": aggregate([row["ndcgAt10"] for row in rows]),
            "avgMrrAt10": aggregate([row["mrrAt10"] for row in rows]),
            "avgJudgedPoolRecallAt10": aggregate([row["judgedPoolRecallAt10"] for row in rows]),
            "n": len(rows),
        }

    evaluated_weights = [str(w) for w in WEIGHT_GRID if summary[str(w)]["avgNdcgAt10"] is not None]
    if not evaluated_weights:
        raise SystemExit("GA8_NO_EVALUABLE_QUERIES")

    def best(metric: str) -> str:
        return max(evaluated_weights, key=lambda w: float(summary[w][metric]))

    report = {
        "schema": "atlas.ga8-frozen-llm-silver-ablation.v1",
        "status": "GA8_LLM_SILVER_FROZEN_ABLATION_PROVEN",
        "evaluationClass": "OFFLINE_RERANK_ABLATION_CONDITIONAL_ON_SEMANTIC_ADMISSION",
        "canonicalAuthority": False,
        "humanGoldRelevanceSetProven": False,
        "candidateSnapshotRevision": expected_snapshot_revision,
        "judgmentUniverseChecksum": judgment_universe_checksum,
        "graphRevision": graph["graphRevision"],
        "graphFeatureRevision": graph["featureRevision"],
        "graphVectorChecksum": graph["vectorChecksum"],
        "candidatePoolPath": FROZEN_POOL_PATH,
        "judgmentPath": JUDGMENT_PATH,
        "graphSnapshotPath": GRAPH_SNAPSHOT_PATH,
        "weightGrid": WEIGHT_GRID,
        "finalK": FINAL_K,
        "relevantGradeThreshold": RELEVANT_GRADE,
        "metrics": {
            "primary": "nDCG@10",
            "secondary": ["MRR@10 grade>=2", "judgedPoolRecall@10 grade>=2"],
            "corpusRecallClaimed": False,
        },
        "evaluatedQueries": len(query_receipts),
        "skippedNoPositiveSignal": skipped_no_positive,
        "skippedNoStableJudgments": skipped_no_stable,
        "unstableJudgmentRowsExcluded": total_unstable_rows,
        "summaryByWeight": summary,
        "bestWeightByNdcgAt10": best("avgNdcgAt10"),
        "bestWeightByMrrAt10": best("avgMrrAt10"),
        "bestWeightByJudgedPoolRecallAt10": best("avgJudgedPoolRecallAt10"),
        "queryReceiptsChecksum": sha256_json(query_receipts),
        "queryReceipts": query_receipts,
        "writes": {
            "postgres": False,
            "qdrant": False,
            "neo4j": False,
            "valkey": False,
        },
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json({k: v for k, v in report.items() if k != "queryReceipts"}))


if __name__ == "__main__":
    main()
