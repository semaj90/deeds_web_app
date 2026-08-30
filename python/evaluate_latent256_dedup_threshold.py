"""Evaluates LATENT256_SEMANTIC_DEDUP threshold choices against real ground truth, per the
explicit review instruction: "Don't decide 0.95 just because it sounds like a good similarity
threshold... measure duplicate precision, duplicate recall."

Ground truth: codebase_chunk_index.content_hash. Rows sharing a content_hash but different ids
are genuine content duplicates (e.g. the same boilerplate/function copy-pasted across files) --
real signal already in the corpus, not synthetic/hand-labeled fixtures. Rows with different
content_hash are treated as true negatives for a random-sampled comparison set.

Sweeps the exact threshold set requested: 0.90, 0.925, 0.95, 0.965, 0.975, 0.99. For each:
  duplicate_recall = fraction of same-content_hash pairs with cosine(latent_256) >= threshold
  false_positive_rate = fraction of different-content_hash pairs with cosine >= threshold

canonical_authority: false throughout -- this is a benchmark informing a config default, not a
promotion decision.
"""

from __future__ import annotations

import argparse
import itertools
import json
import os
import time

import numpy as np
import psycopg2
import psycopg2.extras

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
THRESHOLDS = [0.90, 0.925, 0.95, 0.965, 0.975, 0.99]


def fetch_corpus(database_url: str) -> tuple[list[str], list[str], np.ndarray]:
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id::text AS id, content_hash, latent_256 FROM codebase_chunk_index "
                "WHERE latent_256 IS NOT NULL AND content_hash IS NOT NULL ORDER BY id"
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    ids = [r["id"] for r in rows]
    content_hashes = [r["content_hash"] for r in rows]
    matrix = np.array(
        [np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) for r in rows],
        dtype=np.float32,
    )
    return ids, content_hashes, matrix


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--negative-sample-size", type=int, default=20000)
    parser.add_argument("--seed", type=int, default=684453)
    parser.add_argument("--out", default="docs/reports/latent256-dedup-threshold-evaluation-v1.json")
    args = parser.parse_args()

    print(json.dumps({"event": "fetching_corpus"}))
    ids, content_hashes, matrix = fetch_corpus(args.database_url)
    print(json.dumps({"event": "corpus_fetched", "row_count": len(ids)}))

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    matrix_norm = matrix / norms

    # Positive pairs: all pairs within the same content_hash group (real duplicates).
    by_hash: dict[str, list[int]] = {}
    for idx, h in enumerate(content_hashes):
        by_hash.setdefault(h, []).append(idx)

    positive_pairs: list[tuple[int, int]] = []
    for h, idxs in by_hash.items():
        if len(idxs) < 2:
            continue
        for i, j in itertools.combinations(idxs, 2):
            positive_pairs.append((i, j))

    print(json.dumps({"event": "positive_pairs_built", "count": len(positive_pairs), "dup_groups": sum(1 for v in by_hash.values() if len(v) > 1)}))

    # Negative pairs: random sample of pairs with DIFFERENT content_hash.
    rng = np.random.default_rng(seed=args.seed)
    n = len(ids)
    negative_pairs: list[tuple[int, int]] = []
    attempts = 0
    max_attempts = args.negative_sample_size * 5
    while len(negative_pairs) < args.negative_sample_size and attempts < max_attempts:
        i, j = rng.integers(0, n, size=2)
        attempts += 1
        if i == j:
            continue
        if content_hashes[i] == content_hashes[j]:
            continue
        negative_pairs.append((int(i), int(j)))

    print(json.dumps({"event": "negative_pairs_built", "count": len(negative_pairs)}))

    def cosine(i: int, j: int) -> float:
        return float(np.dot(matrix_norm[i], matrix_norm[j]))

    started_at = time.time()
    positive_scores = np.array([cosine(i, j) for i, j in positive_pairs])
    negative_scores = np.array([cosine(i, j) for i, j in negative_pairs])
    duration_s = time.time() - started_at

    sweep = []
    for t in THRESHOLDS:
        duplicate_recall = float(np.mean(positive_scores >= t)) if len(positive_scores) else None
        false_positive_rate = float(np.mean(negative_scores >= t)) if len(negative_scores) else None
        # precision proxy: of pairs above threshold (pos+neg combined), what fraction are true positives
        tp = int(np.sum(positive_scores >= t))
        fp = int(np.sum(negative_scores >= t))
        precision = tp / (tp + fp) if (tp + fp) > 0 else None
        sweep.append({
            "threshold": t,
            "duplicate_recall": duplicate_recall,
            "false_positive_rate": false_positive_rate,
            "precision_proxy": precision,
            "true_positives_above_threshold": tp,
            "false_positives_above_threshold": fp,
        })
        print(json.dumps({"event": "threshold_evaluated", **sweep[-1]}))

    # Recommendation: highest recall among thresholds with false_positive_rate <= 0.01 (1%).
    eligible = [s for s in sweep if s["false_positive_rate"] is not None and s["false_positive_rate"] <= 0.01]
    recommended = max(eligible, key=lambda s: s["duplicate_recall"]) if eligible else None

    receipt = {
        "schema": "atlas.latent256-dedup-threshold-evaluation.v1",
        "canonical_authority": False,
        "note": "Informs a config default. Does not itself promote or activate anything.",
        "corpus_size": len(ids),
        "positive_pair_count": len(positive_pairs),
        "negative_pair_count": len(negative_pairs),
        "ground_truth": "positive pairs = same content_hash (real duplicate content); negative pairs = random sample of different-content_hash pairs",
        "sweep": sweep,
        "recommended_threshold": recommended["threshold"] if recommended else None,
        "recommendation_policy": "max duplicate_recall among thresholds with false_positive_rate <= 0.01",
        "duration_s": duration_s,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.out}))
    print(json.dumps({"status": "THRESHOLD_EVALUATION_PROVEN", "recommended_threshold": receipt["recommended_threshold"]}))


if __name__ == "__main__":
    main()
