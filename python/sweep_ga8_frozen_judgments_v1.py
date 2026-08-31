"""GA8-ABLATION-02: pure offline semantic/PageRank weight sweep over immutable artifacts.

Inputs only:
  1) FrozenSemanticCandidatePoolV1 NDJSON
  2) LlmJudgedSemanticRelevanceV2 NDJSON
  3) GraphAuthorityFeatureSnapshotV1 JSON

No database, Qdrant, embedding, LLM, graph-store, or label-discovery calls are allowed here.
A query is evaluated only when every frozen candidate has a resolved judgment and a present
PageRank value. Both semantic and PageRank features are min-max normalized over the complete
frozen pool before ranking so a weight is interpretable as a true blend coefficient.

canonical_authority: false
human_gold_relevance_set_proven: false
"""
from __future__ import annotations

import json
import math
import os
from pathlib import Path
from statistics import mean
from typing import Any

from ga8_judge_v2_common import canonical_json, judged_pool_recall_at_k, load_ndjson, ndcg_at_k, reciprocal_rank_at_k, sha256_json, sha256_text

FROZEN_POOL_PATH = os.getenv("GA8_FROZEN_POOL_PATH", ".tmp/atlas/ga8-frozen-semantic-candidate-pools-v1.ndjson")
JUDGMENT_PATH = os.getenv("GA8_JUDGMENT_PATH", ".tmp/atlas/ga8-llm-judged-semantic-relevance-v2.ndjson")
GRAPH_SNAPSHOT_PATH = os.getenv("GA8_GRAPH_SNAPSHOT_PATH", ".tmp/atlas/ga8-graph-authority-feature-snapshot-v1.json")
REPORT_PATH = os.getenv("GA8_FROZEN_ABLATION_REPORT", "docs/reports/ga8-frozen-llm-silver-ablation-v1.json")
FINAL_K = int(os.getenv("GA8_FINAL_K", "10"))
WEIGHT_GRID = [round(i / 10.0, 1) for i in range(11)]
RELEVANT_GRADE = 2
FEATURE_NORMALIZATION = "PER_QUERY_MIN_MAX_OVER_COMPLETE_FROZEN_POOL_V1"


def pool_checksum_payload(pool: dict[str, Any]) -> dict[str, Any]:
    return {
        "queryId": pool["queryId"], "queryText": pool["queryText"],
        "queryTextChecksum": pool["queryTextChecksum"], "queryEmbeddingChecksum": pool["queryEmbeddingChecksum"],
        "representationId": pool["representationId"], "embeddingModelRevision": pool["embeddingModelRevision"],
        "poolK": pool["poolK"], "candidates": pool["candidates"],
    }


def validate_pool(pool: dict[str, Any]) -> None:
    if pool.get("schema") != "atlas.frozen-semantic-candidate-pool.v1": raise SystemExit("GA8_FROZEN_POOL_SCHEMA_MISMATCH")
    if int(pool.get("labelInputsUsed", -1)) != 0 or int(pool.get("graphInputsUsed", -1)) != 0: raise SystemExit("GA8_FROZEN_POOL_TAINTED")
    if sha256_text(str(pool.get("queryText", ""))) != pool.get("queryTextChecksum"): raise SystemExit("GA8_QUERY_TEXT_CHECKSUM_MISMATCH")
    candidates = list(pool.get("candidates") or [])
    ids = [str(c.get("candidateId")) for c in candidates]
    if len(ids) != len(set(ids)): raise SystemExit("GA8_DUPLICATE_POOL_CANDIDATE")
    if [int(c.get("poolOrdinal", -1)) for c in candidates] != list(range(len(candidates))): raise SystemExit("GA8_POOL_ORDINAL_GAP")
    for c in candidates:
        if sha256_text(str(c.get("evidenceText") or "")) != c.get("evidenceTextChecksum"):
            raise SystemExit("GA8_EVIDENCE_CHECKSUM_MISMATCH")
    if sha256_json(pool_checksum_payload(pool)) != pool.get("candidatePoolChecksum"):
        raise SystemExit(f"GA8_CANDIDATE_POOL_CHECKSUM_MISMATCH:{pool.get('queryId')}")


def load_graph_snapshot() -> dict[str, Any]:
    payload = json.loads(Path(GRAPH_SNAPSHOT_PATH).read_text(encoding="utf-8"))
    if payload.get("schema") != "atlas.graph-authority-feature-snapshot.v1": raise SystemExit("GA8_GRAPH_SNAPSHOT_SCHEMA_MISMATCH")
    if sha256_json(payload.get("rows", [])) != payload.get("vectorChecksum"): raise SystemExit("GA8_GRAPH_SNAPSHOT_CHECKSUM_MISMATCH")
    expected_snapshot_checksum = sha256_json({
        "candidateSnapshotRevision": payload.get("candidateSnapshotRevision"),
        "provenance": {
            "graphRevision": payload.get("graphRevision"), "featureRevision": payload.get("featureRevision"),
            "provenanceReceiptChecksum": payload.get("provenanceReceiptChecksum"),
            "qualification": payload.get("qualification"), "tableCarriesJoinableRevision": payload.get("tableCarriesJoinableRevision"),
        },
        "rows": payload.get("rows", []),
    })
    if expected_snapshot_checksum != payload.get("snapshotChecksum"): raise SystemExit("GA8_GRAPH_SNAPSHOT_PROVENANCE_CHECKSUM_MISMATCH")
    if int(payload.get("pageRankMissingRows", -1)) != 0: raise SystemExit("GA8_GRAPH_SNAPSHOT_HAS_MISSING_ROWS")
    return payload


def aggregate(values: list[float | None]) -> float | None:
    vals = [float(v) for v in values if v is not None]
    return mean(vals) if vals else None


def minmax(values: list[float]) -> list[float]:
    if not values: return []
    lo, hi = min(values), max(values)
    if not math.isfinite(lo) or not math.isfinite(hi): raise SystemExit("GA8_NON_FINITE_FEATURE")
    if hi == lo: return [0.5 for _ in values]
    return [(v - lo) / (hi - lo) for v in values]


def main() -> None:
    if FINAL_K <= 0: raise SystemExit("GA8_FINAL_K_INVALID")
    pools, judgments, graph = load_ndjson(FROZEN_POOL_PATH), load_ndjson(JUDGMENT_PATH), load_graph_snapshot()
    if not pools or not judgments: raise SystemExit("GA8_OFFLINE_INPUT_EMPTY")
    if len({str(p.get("queryId")) for p in pools}) != len(pools): raise SystemExit("GA8_DUPLICATE_QUERY_ID")
    for pool in pools: validate_pool(pool)

    expected_snapshot_revision = sha256_json([{"queryId": p["queryId"], "candidatePoolChecksum": p["candidatePoolChecksum"]} for p in pools])
    if {str(p.get("candidateSnapshotRevision")) for p in pools} != {expected_snapshot_revision}: raise SystemExit("GA8_CANDIDATE_SNAPSHOT_REVISION_MISMATCH")
    if str(graph.get("candidateSnapshotRevision")) != expected_snapshot_revision: raise SystemExit("GA8_GRAPH_CANDIDATE_SNAPSHOT_MISMATCH")

    expected_keys = {(str(p["queryId"]), str(c["candidateId"])) for p in pools for c in p["candidates"]}

    judgments_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in judgments:
        if row.get("schema") != "atlas.llm-judged-semantic-relevance.v2": raise SystemExit("GA8_JUDGMENT_SCHEMA_MISMATCH")
        key = (str(row["queryId"]), str(row["candidateId"]))
        if key in judgments_by_key: raise SystemExit("GA8_DUPLICATE_JUDGMENT_COORDINATE")
        judgments_by_key[key] = row
    if set(judgments_by_key) != expected_keys: raise SystemExit("GA8_JUDGMENT_UNIVERSE_NOT_EXACT")

    graph_rows = graph.get("rows", [])
    graph_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in graph_rows:
        key = (str(row["queryId"]), str(row["candidateId"]))
        if key in graph_by_key: raise SystemExit("GA8_DUPLICATE_GRAPH_COORDINATE")
        graph_by_key[key] = row
    if set(graph_by_key) != expected_keys: raise SystemExit("GA8_GRAPH_UNIVERSE_NOT_EXACT")
    if any(r.get("pageRankPresent") is not True or r.get("pageRank") is None for r in graph_rows): raise SystemExit("GA8_GRAPH_ROW_MISSING_PAGERANK")

    # Recompute the judgment universe from the frozen pools and the immutable judge contract carried by rows.
    prompt_checksums = {str(r.get("judgePromptChecksum")) for r in judgments}
    model_revisions = {str(r.get("judgeModelRevision")) for r in judgments}
    presentation_checksums = {str(r.get("presentationPolicyChecksum")) for r in judgments}
    stored_universes = {str(r.get("judgmentUniverseChecksum")) for r in judgments}
    if any(len(s) != 1 or "None" in s for s in (prompt_checksums, model_revisions, presentation_checksums, stored_universes)):
        raise SystemExit("GA8_JUDGE_CONTRACT_MIXED_OR_MISSING")
    prompt_checksum, model_revision, presentation_checksum, stored_universe = next(iter(prompt_checksums)), next(iter(model_revisions)), next(iter(presentation_checksums)), next(iter(stored_universes))
    recomputed_universe = sha256_json([{
        "queryId": p["queryId"], "candidatePoolChecksum": p["candidatePoolChecksum"], "judgePromptChecksum": prompt_checksum,
        "judgeModelRevision": model_revision, "presentationPolicyChecksum": presentation_checksum,
    } for p in pools])
    if recomputed_universe != stored_universe: raise SystemExit("GA8_JUDGMENT_UNIVERSE_CHECKSUM_MISMATCH")

    per_weight: dict[float, list[dict[str, float | None]]] = {w: [] for w in WEIGHT_GRID}
    query_receipts: list[dict[str, Any]] = []
    skipped_unresolved = skipped_no_positive = 0

    for pool in pools:
        query_id = str(pool["queryId"])
        candidates = list(pool["candidates"])
        query_judgments = [judgments_by_key[(query_id, str(c["candidateId"]))] for c in candidates]
        if any(j.get("resolved") is not True or j.get("relevanceGrade") is None for j in query_judgments):
            skipped_unresolved += 1
            continue
        grades = [int(j["relevanceGrade"]) for j in query_judgments]
        if not any(g >= RELEVANT_GRADE for g in grades):
            skipped_no_positive += 1
            continue

        semantic_raw = [float(c["semanticScore"]) for c in candidates]
        pagerank_raw = [float(graph_by_key[(query_id, str(c["candidateId"]))]["pageRank"]) for c in candidates]
        semantic_norm, pagerank_norm = minmax(semantic_raw), minmax(pagerank_raw)
        rows = [{
            "candidateId": str(candidates[i]["candidateId"]), "poolOrdinal": int(candidates[i]["poolOrdinal"]),
            "semanticNorm": semantic_norm[i], "pageRankNorm": pagerank_norm[i], "grade": grades[i],
        } for i in range(len(candidates))]

        qr: dict[str, Any] = {"queryId": query_id, "candidatePoolChecksum": pool["candidatePoolChecksum"], "candidateCount": len(rows), "metrics": {}}
        for weight in WEIGHT_GRID:
            ranked = sorted(rows, key=lambda r: (-(weight * r["semanticNorm"] + (1.0 - weight) * r["pageRankNorm"]), r["poolOrdinal"], r["candidateId"]))
            ranked_grades = [r["grade"] for r in ranked]
            metrics = {
                "ndcgAt10": ndcg_at_k(ranked_grades, grades, FINAL_K),
                "mrrAt10": reciprocal_rank_at_k(ranked_grades, FINAL_K, RELEVANT_GRADE),
                "judgedPoolRecallAt10": judged_pool_recall_at_k(ranked_grades, grades, FINAL_K, RELEVANT_GRADE),
            }
            per_weight[weight].append(metrics); qr["metrics"][str(weight)] = metrics
        query_receipts.append(qr)

    summary: dict[str, Any] = {}
    for weight in WEIGHT_GRID:
        rs = per_weight[weight]
        summary[str(weight)] = {
            "avgNdcgAt10": aggregate([r["ndcgAt10"] for r in rs]), "avgMrrAt10": aggregate([r["mrrAt10"] for r in rs]),
            "avgJudgedPoolRecallAt10": aggregate([r["judgedPoolRecallAt10"] for r in rs]), "n": len(rs),
        }
    evaluated = [str(w) for w in WEIGHT_GRID if summary[str(w)]["avgNdcgAt10"] is not None]
    if not evaluated: raise SystemExit("GA8_NO_EVALUABLE_QUERIES")
    best = lambda metric: max(evaluated, key=lambda w: float(summary[w][metric]))

    report = {
        "schema": "atlas.ga8-frozen-llm-silver-ablation.v1", "status": "GA8_LLM_SILVER_FROZEN_ABLATION_PROVEN",
        "evaluationClass": "OFFLINE_RERANK_ABLATION_CONDITIONAL_ON_SEMANTIC_ADMISSION",
        "canonicalAuthority": False, "humanGoldRelevanceSetProven": False, "candidateSnapshotRevision": expected_snapshot_revision,
        "judgmentUniverseChecksum": recomputed_universe, "graphRevision": graph["graphRevision"], "graphFeatureRevision": graph["featureRevision"],
        "graphProvenanceReceiptChecksum": graph["provenanceReceiptChecksum"], "graphVectorChecksum": graph["vectorChecksum"],
        "graphSnapshotChecksum": graph["snapshotChecksum"], "featureNormalization": FEATURE_NORMALIZATION,
        "candidatePoolPath": FROZEN_POOL_PATH, "judgmentPath": JUDGMENT_PATH, "graphSnapshotPath": GRAPH_SNAPSHOT_PATH,
        "weightGrid": WEIGHT_GRID, "finalK": FINAL_K, "relevantGradeThreshold": RELEVANT_GRADE,
        "metrics": {"primary": "nDCG@10", "secondary": ["MRR@10 grade>=2", "judgedPoolRecall@10 grade>=2"], "corpusRecallClaimed": False},
        "evaluatedQueries": len(query_receipts), "skippedQueriesWithUnresolvedJudgments": skipped_unresolved,
        "skippedNoPositiveSignal": skipped_no_positive, "summaryByWeight": summary,
        "bestWeightByNdcgAt10": best("avgNdcgAt10"), "bestWeightByMrrAt10": best("avgMrrAt10"),
        "bestWeightByJudgedPoolRecallAt10": best("avgJudgedPoolRecallAt10"),
        "queryReceiptsChecksum": sha256_json(query_receipts), "queryReceipts": query_receipts,
        "writes": {"postgres": False, "qdrant": False, "neo4j": False, "valkey": False},
    }
    Path(REPORT_PATH).parent.mkdir(parents=True, exist_ok=True)
    Path(REPORT_PATH).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(canonical_json({k: v for k, v in report.items() if k != "queryReceipts"}))


if __name__ == "__main__": main()
