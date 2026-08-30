"""First real (proxy-golden, not silver-keyword) Recall@10/MRR@10 comparison for baseline vs.
latent_256 (exact_and_semantic+refill) vs. semantic_768_mmr, using
docs/reports/structural-proxy-golden-set-build-v1.json's 646 entries as ground truth.

Distinct from every earlier benchmark in this thread, which used keyword-match SILVER labels
(a candidate counts as "relevant" if its path lexically contains a query keyword). Here,
relevance is the golden set's own real ground truth: a packet is relevant iff it's a real
importer of the query file (STRUCTURAL_PROXY_IMPORTERS methodology, operator-selected
2026-08-10). Still explicitly a PROXY, not human-verified -- structurally related != necessarily
what a human would want -- but it is a materially stronger signal than lexical keyword overlap.

Samples SAMPLE_SIZE entries (seeded) from the 646 for a first real run -- embedding every entry's
query text via Ollama for a full run is straightforward to scale later, this establishes whether
the result direction holds before spending that time.
"""

from __future__ import annotations

import json
import os
import random
import time

import numpy as np
import psycopg2
import psycopg2.extras
import requests

DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
OLLAMA_URL = "http://127.0.0.1:11434"
EMBED_MODEL = "embeddinggemma:latest"
GOLDEN_SET_PATH = ".tmp/atlas/structural-proxy-golden-set-v1.ndjson"
THRESHOLD = 0.90
POOL_K = 50
FINAL_K = 10
MMR_WEIGHT = 0.5
SAMPLE_SIZE = 60
SEED = 684453


def embed_query(text: str) -> list[float]:
    resp = requests.post(f"{OLLAMA_URL}/api/embed", json={"model": EMBED_MODEL, "input": text[:2000]}, timeout=30)
    resp.raise_for_status()
    return resp.json()["embeddings"][0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def select_baseline(rows: list[dict], final_k: int) -> list[dict]:
    return rows[:final_k]


def select_exact_and_semantic(rows: list[dict], final_k: int, threshold: float) -> list[dict]:
    seen_hash: dict[str, str] = {}
    stage_a = []
    for r in rows:
        h = r.get("content_hash")
        if not h:
            stage_a.append(r)
            continue
        if h in seen_hash:
            continue
        seen_hash[h] = r["id"]
        stage_a.append(r)
    selected: list[dict] = []
    selected_vecs: list[np.ndarray] = []
    for r in stage_a:
        if len(selected) >= final_k:
            break
        vec = r["latent_vec"]
        if vec is None:
            selected.append(r)
            continue
        if any(cosine(vec, sv) >= threshold for sv in selected_vecs):
            continue
        selected_vecs.append(vec)
        selected.append(r)
    return selected


def select_semantic_768_mmr(rows: list[dict], final_k: int, query_vec_norm: np.ndarray, weight: float) -> list[dict]:
    remaining = list(rows)
    selected: list[dict] = []
    while remaining and len(selected) < final_k:
        best_idx, best_score = None, -1e9
        for i, r in enumerate(remaining):
            relevance = cosine(r["content_vec_norm"], query_vec_norm)
            redundancy = max((cosine(r["content_vec_norm"], s["content_vec_norm"]) for s in selected), default=0.0)
            score = weight * relevance - (1 - weight) * redundancy
            if score > best_score:
                best_score, best_idx = score, i
        selected.append(remaining.pop(best_idx))
    return selected


def run_entry(conn, entry: dict) -> dict:
    query_vec = np.array(embed_query(entry["query_text"]), dtype=np.float32)
    query_vec_norm = query_vec / np.linalg.norm(query_vec)
    query_vec_literal = "[" + ",".join(f"{v:.6f}" for v in query_vec) + "]"
    relevant_set = set(entry["relevant_packet_keys"])

    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id::text AS id, content_hash, latent_256::text AS latent_256,
                   content_embedding::text AS content_embedding
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL AND latent_256 IS NOT NULL AND id::text != %s
            ORDER BY content_embedding <=> %s::halfvec
            LIMIT %s
            """,
            (entry["query_packet_key"], query_vec_literal, POOL_K),
        )
        rows = cur.fetchall()

    for r in rows:
        r["latent_vec"] = np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) if r["latent_256"] else None
        cv = np.fromstring(r["content_embedding"].strip("[]"), sep=",", dtype=np.float32)
        r["content_vec_norm"] = cv / np.linalg.norm(cv)
        r["is_relevant"] = r["id"] in relevant_set

    relevant_in_pool = sum(1 for r in rows if r["is_relevant"])

    policies_fns = {
        "baseline": lambda: select_baseline(rows, FINAL_K),
        "exact_and_semantic": lambda: select_exact_and_semantic(rows, FINAL_K, THRESHOLD),
        "semantic_768_mmr": lambda: select_semantic_768_mmr(rows, FINAL_K, query_vec_norm, MMR_WEIGHT),
    }

    policies = {}
    for name, fn in policies_fns.items():
        selected = fn()
        relevant_selected = [r for r in selected if r["is_relevant"]]
        recall = len(relevant_selected) / relevant_in_pool if relevant_in_pool else None
        rr = 0.0
        for rank, r in enumerate(selected, start=1):
            if r["is_relevant"]:
                rr = 1.0 / rank
                break
        policies[name] = {"recallAt10": recall, "reciprocalRankAt10": rr}

    return {
        "query_source_ref": entry["query_source_ref"],
        "relevant_in_pool": relevant_in_pool,
        "relevant_total": len(relevant_set),
        "policies": policies,
    }


def main() -> None:
    entries = []
    with open(GOLDEN_SET_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                entries.append(json.loads(line))

    rng = random.Random(SEED)
    sample = rng.sample(entries, min(SAMPLE_SIZE, len(entries)))

    conn = psycopg2.connect(DATABASE_URL)
    started_at = time.time()
    results = []
    skipped_zero_relevant_in_pool = 0
    try:
        for entry in sample:
            r = run_entry(conn, entry)
            if r["relevant_in_pool"] == 0:
                skipped_zero_relevant_in_pool += 1
                continue
            results.append(r)
            print(json.dumps({"event": "entry_complete", "query_source_ref": r["query_source_ref"], "relevant_in_pool": r["relevant_in_pool"], "policies": r["policies"]}))
    finally:
        conn.close()
    duration_s = time.time() - started_at

    summary = {}
    for policy in ["baseline", "exact_and_semantic", "semantic_768_mmr"]:
        recalls = [r["policies"][policy]["recallAt10"] for r in results if r["policies"][policy]["recallAt10"] is not None]
        rrs = [r["policies"][policy]["reciprocalRankAt10"] for r in results]
        summary[policy] = {
            "avg_recall_at_10_golden_proxy": float(np.mean(recalls)) if recalls else None,
            "avg_mrr_at_10_golden_proxy": float(np.mean(rrs)) if rrs else None,
            "n": len(recalls),
        }

    receipt = {
        "schema": "atlas.golden-proxy-relevance-eval.v1",
        "canonical_authority": False,
        "note": "Uses the STRUCTURAL_PROXY_IMPORTERS golden set (646 entries, sampled to " + str(SAMPLE_SIZE) + ") as ground truth -- a materially stronger signal than the earlier keyword-match silver standard, but still a structural PROXY, not human-verified. Entries where the query's known-relevant packets didn't appear in the retrieved top-50 pool at all are excluded (skipped_zero_relevant_in_pool) since no policy could recover them regardless of selection logic -- that's a retrieval-depth limitation, not a selection-policy result.",
        "golden_set_path": GOLDEN_SET_PATH,
        "golden_set_total_entries": len(entries),
        "sample_size": len(sample),
        "skipped_zero_relevant_in_pool": skipped_zero_relevant_in_pool,
        "evaluated_entries": len(results),
        "pool_k": POOL_K,
        "final_k": FINAL_K,
        "threshold": THRESHOLD,
        "mmr_weight": MMR_WEIGHT,
        "seed": SEED,
        "summary": summary,
        "duration_s": duration_s,
    }
    out_path = "docs/reports/golden-proxy-relevance-eval-v1.json"
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": out_path}))
    print(json.dumps({"status": "GOLDEN_PROXY_RELEVANCE_EVAL_PROVEN", "summary": summary}))


if __name__ == "__main__":
    main()
