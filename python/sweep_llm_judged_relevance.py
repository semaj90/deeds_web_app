"""BLEND_SEMANTIC_WEIGHT sweep against LLM-judged relevance (LLM_JUDGED_PROXY, not
human-verified) instead of the STRUCTURAL_PROXY_IMPORTERS golden set's IMPORTS-derived relevance.

Purpose: the prior full-scale weight sweep (sweep_ga8_blend_weight.py, n=646) found recall/MRR
declining monotonically as semantic weight increases, with pure PageRank (weight=0.0) winning
outright -- flagged there as likely circular, since IMPORTS-derived relevance and PageRank are
both computed from the same import graph. build_llm_judged_relevance_set.py built an independent
relevance signal (local LLM judging candidate summaries against the query file's summary, with NO
access to the IMPORTS graph or PageRank scores) for 60 sampled queries, specifically to test
whether the PageRank dominance survives on ground truth that isn't graph-derived.

Confirmed near-zero overlap between the two relevance definitions (2/60 entries, 2 total pairs)
-- the LLM-judged set is not simply reproducing IMPORTS-relevance, so this is a materially
different test, not a restatement of the same result.

Reuses build_pool()/eval_ranking() from sweep_ga8_blend_weight.py unchanged (same semantic-ANN +
PageRank-join construction, already validated to reproduce the confirmed ablation numbers exactly)
-- only the relevant_set source changes, from entry["relevant_packet_keys"] (IMPORTS) to the
LLM-judged record's llm_judged_relevant_packet_keys.

canonical_authority: false. Measurement only.
"""

from __future__ import annotations

import json
import os

import numpy as np
import psycopg2

import sweep_ga8_blend_weight as base

LLM_JUDGED_PATH = ".tmp/atlas/llm-judged-relevance-v1.ndjson"
WEIGHT_GRID = base.WEIGHT_GRID


def main() -> None:
    records = [json.loads(l) for l in open(LLM_JUDGED_PATH, "r", encoding="utf-8") if l.strip()]
    records_with_signal = [r for r in records if r["llm_judged_relevant_packet_keys"]]
    skipped_no_positive_signal = len(records) - len(records_with_signal)

    conn = psycopg2.connect(base.DATABASE_URL)
    per_weight_results: dict[float, list[dict]] = {w: [] for w in WEIGHT_GRID}
    skipped_unreachable = 0
    evaluated = 0
    try:
        for rec in records_with_signal:
            synthetic_entry = {
                "query_source_ref": rec["query_source_ref"],
                "query_packet_key": rec["query_packet_key"],
                "query_text": rec["query_text"],
                "relevant_packet_keys": rec["llm_judged_relevant_packet_keys"],
            }
            built = base.build_pool(conn, synthetic_entry)
            if built is None:
                skipped_unreachable += 1
                continue
            evaluated += 1
            for w in WEIGHT_GRID:
                r = base.eval_weight(built["pool"], built["relevant_set"], w)
                per_weight_results[w].append(r)
    finally:
        conn.close()

    summary = {}
    for w in WEIGHT_GRID:
        rs = per_weight_results[w]
        recalls = [r["recallAt10"] for r in rs if r["recallAt10"] is not None]
        rrs = [r["reciprocalRankAt10"] for r in rs]
        summary[str(w)] = {
            "avg_recall_at_10": float(np.mean(recalls)) if recalls else None,
            "avg_mrr_at_10": float(np.mean(rrs)) if rrs else None,
            "n": len(rs),
        }

    best_recall_w = max(summary, key=lambda k: summary[k]["avg_recall_at_10"] or -1)
    best_mrr_w = max(summary, key=lambda k: summary[k]["avg_mrr_at_10"] or -1)

    receipt = {
        "schema": "atlas.ga8-blend-weight-sweep-llm-judged.v1",
        "canonical_authority": False,
        "evidence_tier": "LLM_JUDGED_PROXY",
        "not_human_verified": True,
        "note": "Same weight sweep as sweep_ga8_blend_weight.py (reuses its build_pool/eval_weight unchanged), but relevance ground truth is LLM-judged (ornith-1.5-9b judging candidate summaries against the query file's summary, blind to the IMPORTS graph and PageRank scores) instead of IMPORTS-derived. Tests whether the pure-PageRank dominance found on the IMPORTS-derived golden set (docs/reports/ga8-blend-weight-sweep-v1.json) survives on a relevance signal not computed from the same graph PageRank is computed from. Confirmed near-zero overlap between the two relevance definitions (2/60 entries had any overlapping packet) before running this -- this is testing a materially different label, not restating the same one.",
        "llm_judged_relevance_source": LLM_JUDGED_PATH,
        "llm_judged_total_records": len(records),
        "skipped_no_positive_signal": skipped_no_positive_signal,
        "skipped_unreachable": skipped_unreachable,
        "evaluated_entries": evaluated,
        "semantic_pool_k": base.SEMANTIC_POOL_K,
        "final_k": base.FINAL_K,
        "weight_grid": WEIGHT_GRID,
        "summary_by_weight": summary,
        "best_weight_for_recall_at_10": best_recall_w,
        "best_weight_for_mrr_at_10": best_mrr_w,
    }
    out_path = "docs/reports/ga8-blend-weight-sweep-llm-judged-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({
        "status": "GA8_BLEND_WEIGHT_SWEEP_LLM_JUDGED_PROVEN",
        "evaluated_entries": evaluated,
        "skipped_no_positive_signal": skipped_no_positive_signal,
        "summary_by_weight": summary,
        "best_weight_for_recall_at_10": best_recall_w,
        "best_weight_for_mrr_at_10": best_mrr_w,
    }))


if __name__ == "__main__":
    main()
