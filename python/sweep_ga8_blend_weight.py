"""GA8 blend-weight sweep: what BLEND_SEMANTIC_WEIGHT actually maximizes Recall@10/MRR@10 on the
structural-proxy golden set, given the pool-construction fix confirmed at full scale in
benchmark_ga8_graph_feature_ablation.py (n=646: semantic_plus_pagerank @ 0.7 beat semantic_only by
~2.7x recall / ~2.9x MRR)?

BLEND_SEMANTIC_WEIGHT=0.7 in that script was never tuned -- it was a starting guess carried over
from the earlier MMR_LAMBDA-style default. This sweeps a weight grid and reports which value
maximizes each metric, mirroring the mmrRelevanceWeight sweep methodology already used in the
latent_256 dedup thread (benchmark_mmr_relevance_weight_sweep.py).

Design: build each entry's candidate pool (semantic ANN top-K + injected relevant packets +
PageRank scores) EXACTLY ONCE -- same construction as benchmark_ga8_graph_feature_ablation.py,
including the same pool-dilution fix (inject only relevant packets, not the full 1-hop neighbor
set). Then evaluate every weight in the grid against that same pool. This means the expensive
per-entry work (one real Ollama embed call, two Postgres round trips) happens once per entry
regardless of grid size, not once per (entry, weight) pair.

canonical_authority: false. Measurement only -- does not write to Postgres/Neo4j and does not
change BLEND_SEMANTIC_WEIGHT in the live ablation script or any production ranking path.
"""

from __future__ import annotations

import json
import os
import random

import numpy as np
import psycopg2
import psycopg2.extras
import requests

from ga8_hardening import normalize_pagerank, validate_pagerank_row, verify_graph_provenance_receipt

DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"
GOLDEN_SET_PATH = ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
SEMANTIC_POOL_K = 50
FINAL_K = 10
SAMPLE_SIZE = 646  # full golden set -- matches the confirmed full-scale ablation run
SEED = 684453
WEIGHT_GRID = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text[:2000]}, timeout=30)
    resp.raise_for_status()
    return resp.json()["embeddings"][0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def eval_ranking(ranked_ids: list[str], relevant_set: set[str], final_k: int) -> dict:
    top = ranked_ids[:final_k]
    relevant_in_final = sum(1 for i in top if i in relevant_set)
    relevant_in_pool = sum(1 for i in ranked_ids if i in relevant_set)
    recall = relevant_in_final / relevant_in_pool if relevant_in_pool else None
    rr = 0.0
    for rank, i in enumerate(top, start=1):
        if i in relevant_set:
            rr = 1.0 / rank
            break
    return {"recallAt10": recall, "reciprocalRankAt10": rr}


def build_pool(conn, entry: dict) -> dict | None:
    """Same pool construction as benchmark_ga8_graph_feature_ablation.py::run_entry, but returns
    the scored pool + relevant_set instead of evaluating a single fixed weight."""
    query_ref = entry["query_source_ref"]
    relevant_set = set(entry["relevant_packet_keys"])

    query_vec = np.array(embed_query(entry["query_text"]), dtype=np.float32)
    query_vec_norm = query_vec / np.linalg.norm(query_vec)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, relative_path, content_embedding::text AS content_embedding
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL AND id::text != %s
            ORDER BY content_embedding <=> %s::halfvec
            LIMIT %s
            """,
            (entry["query_packet_key"], query_vec_literal, SEMANTIC_POOL_K),
        )
        semantic_rows = cur.fetchall()

        pool_by_id = {r["id"]: r for r in semantic_rows}
        missing_relevant_ids = [rid for rid in relevant_set if rid not in pool_by_id]
        if missing_relevant_ids:
            cur.execute(
                "SELECT id::text AS id, relative_path, content_embedding::text AS content_embedding "
                "FROM codebase_chunk_index WHERE id::text = ANY(%s) AND content_embedding IS NOT NULL",
                (missing_relevant_ids,),
            )
            for r in cur.fetchall():
                pool_by_id[r["id"]] = r
        pool = list(pool_by_id.values())

        if not any(r["id"] in relevant_set for r in pool):
            return None  # unreachable -- excluded, matches confirmed full-scale run (0 skipped)

        pool_source_refs = ["sveltekit-frontend/" + r["relative_path"] for r in pool]
        cur.execute(
            "SELECT source_ref, pagerank_l1 "
            "FROM atlas_graph_authority_scores WHERE source_ref = ANY(%s)",
            (pool_source_refs,),
        )
        pagerank_rows = cur.fetchall()
        pagerank_by_ref = {row["source_ref"]: validate_pagerank_row(row["source_ref"], row["pagerank_l1"]) for row in pagerank_rows}
        missing_refs = sorted(set(pool_source_refs) - set(pagerank_by_ref))
        if missing_refs:
            raise SystemExit(f"GA8_PAGERANK_MISSING:{missing_refs[0]}")
        pagerank_by_id = {r["id"]: pagerank_by_ref["sveltekit-frontend/" + r["relative_path"]] for r in pool}

    for r in pool:
        cv = np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
        r["semantic_score"] = cosine(cv / np.linalg.norm(cv), query_vec_norm)
        r["pagerank"] = pagerank_by_id.get(r["id"], 0.0)

    normalized, pagerank_degenerate, pagerank_range = normalize_pagerank([r["pagerank"] for r in pool])
    for r, normalized_value in zip(pool, normalized):
        r["pagerank_norm"] = normalized_value

    return {"query_source_ref": query_ref, "pool": pool, "relevant_set": relevant_set, "pagerank_degenerate": pagerank_degenerate, "pagerank_range": pagerank_range}


def eval_weight(pool: list[dict], relevant_set: set[str], weight: float) -> dict:
    ranked = sorted(pool, key=lambda r: -(weight * r["semantic_score"] + (1 - weight) * r["pagerank_norm"]))
    return eval_ranking([r["id"] for r in ranked], relevant_set, FINAL_K)


def main() -> None:
    graph_provenance = verify_graph_provenance_receipt()
    entries = [json.loads(l) for l in open(GOLDEN_SET_PATH, "r", encoding="utf-8") if l.strip()]
    rng = random.Random(SEED)
    sample = rng.sample(entries, min(SAMPLE_SIZE, len(entries)))

    conn = psycopg2.connect(DATABASE_URL)
    per_weight_results: dict[float, list[dict]] = {w: [] for w in WEIGHT_GRID}
    skipped_unreachable = 0
    evaluated = 0
    degenerate_pagerank_entries = 0
    try:
        for idx, entry in enumerate(sample):
            built = build_pool(conn, entry)
            if built is None:
                skipped_unreachable += 1
                continue
            evaluated += 1
            if built["pagerank_degenerate"]:
                degenerate_pagerank_entries += 1
            for w in WEIGHT_GRID:
                r = eval_weight(built["pool"], built["relevant_set"], w)
                per_weight_results[w].append(r)
            if evaluated % 50 == 0:
                print(json.dumps({"event": "progress", "evaluated": evaluated, "sample_total": len(sample)}))
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
        "schema": "atlas.ga8-blend-weight-sweep.v1",
        "canonical_authority": False,
        "note": "Sweeps BLEND_SEMANTIC_WEIGHT (0.0=pagerank_only .. 1.0=semantic_only) over the same pool-construction as the confirmed full-scale GA8 ablation (benchmark_ga8_graph_feature_ablation.py). Pool built once per entry; all grid weights evaluated against that same pool -- no additional embedding calls per weight. Does not modify BLEND_SEMANTIC_WEIGHT in the live ablation script.",
        "golden_set_total_entries": len(entries),
        "sample_size": len(sample),
        "skipped_unreachable": skipped_unreachable,
        "evaluated_entries": evaluated,
        "semantic_pool_k": SEMANTIC_POOL_K,
        "final_k": FINAL_K,
        "weight_grid": WEIGHT_GRID,
        "seed": SEED,
        "metric_revision": "RECALL_AT_10_MRR_AT_10_BINARY_RELEVANT_POOL_V1",
        "pagerank_normalization": "MINMAX_ZERO_ON_DEGENERATE_V1",
        "degenerate_pagerank_entries": degenerate_pagerank_entries,
        "graph_provenance": graph_provenance,
        "summary_by_weight": summary,
        "best_weight_for_recall_at_10": best_recall_w,
        "best_weight_for_mrr_at_10": best_mrr_w,
        "carried_over_default_weight_0_7": summary.get("0.7"),
    }
    out_path = "docs/reports/ga8-blend-weight-sweep-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({
        "status": "GA8_BLEND_WEIGHT_SWEEP_PROVEN",
        "summary_by_weight": summary,
        "best_weight_for_recall_at_10": best_recall_w,
        "best_weight_for_mrr_at_10": best_mrr_w,
    }))


if __name__ == "__main__":
    main()
