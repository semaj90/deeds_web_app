"""ANN-vs-exact parity proof for the codebase_chunks_latent256 Qdrant collection.

Distinct from the recall-comparison benchmark (compare_semantic_representation_recall.py), which
measured whether a REDUCED DIMENSION preserves neighbor structure vs. the 768d ground truth,
computed only within a held-out validation subset. This script measures a different question:
does Qdrant's live HNSW approximate index actually return what EXACT brute-force search would,
within the SAME 256-dim latent_256 space, over the FULL corpus Qdrant actually searches (all
55,169 points) -- not a held-out subset.

HNSW can silently underperform its own theoretical recall if ef_construction/m are misconfigured,
or if points were indexed inconsistently. This proof exists to catch that, not to re-litigate
which representation is best (already answered by the recall comparison).

Ground truth: exact cosine top-k computed in numpy over the full latent_256 matrix fetched from
Postgres. Candidate: Qdrant's live /points/search top-k for the same query vector, same k,
self excluded from both sides.
"""

from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import psycopg2
import psycopg2.extras
import requests

DEFAULT_DATABASE_URL = "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db"
DEFAULT_QDRANT_URL = "http://127.0.0.1:6333"
COLLECTION_NAME = "codebase_chunks_latent256"


def fetch_full_corpus(database_url: str) -> tuple[list[str], np.ndarray]:
    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id::text AS id, latent_256 FROM codebase_chunk_index WHERE latent_256 IS NOT NULL ORDER BY id"
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    ids = [r["id"] for r in rows]
    matrix = np.array(
        [np.fromstring(r["latent_256"].strip("[]"), sep=",", dtype=np.float32) for r in rows],
        dtype=np.float32,
    )
    return ids, matrix


def exact_top_k(matrix_norm: np.ndarray, query_idx: int, k: int) -> list[int]:
    scores = matrix_norm @ matrix_norm[query_idx]
    scores[query_idx] = -np.inf  # exclude self
    order = np.argsort(-scores, kind="stable")
    return order[:k].tolist()


def qdrant_top_k(qdrant_url: str, query_vector: list[float], query_id: str, k: int) -> list[str]:
    resp = requests.post(
        f"{qdrant_url}/collections/{COLLECTION_NAME}/points/search",
        json={"vector": query_vector, "limit": k + 1, "with_payload": False},
        timeout=15,
    )
    resp.raise_for_status()
    hits = resp.json()["result"]
    ids = [str(h["id"]) for h in hits if str(h["id"]) != query_id]
    return ids[:k]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL))
    parser.add_argument("--qdrant-url", default=os.getenv("QDRANT_URL", DEFAULT_QDRANT_URL))
    parser.add_argument("--sample-size", type=int, default=200)
    parser.add_argument("--k", type=int, default=10)
    parser.add_argument("--seed", type=int, default=684453)
    parser.add_argument("--out", default="docs/reports/latent256-ann-exact-parity-v1.json")
    args = parser.parse_args()

    print(json.dumps({"event": "fetching_corpus"}))
    ids, matrix = fetch_full_corpus(args.database_url)
    print(json.dumps({"event": "corpus_fetched", "row_count": len(ids), "embedding_dim": matrix.shape[1]}))

    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1.0, norms)
    matrix_norm = matrix / norms

    rng = np.random.default_rng(seed=args.seed)
    sample_indices = rng.choice(len(ids), size=min(args.sample_size, len(ids)), replace=False)

    started_at = time.time()
    per_query_overlap: list[float] = []
    exact_zero_hits = 0

    for i, idx in enumerate(sample_indices):
        query_id = ids[idx]
        query_vector = matrix[idx].tolist()

        exact_indices = exact_top_k(matrix_norm, idx, args.k)
        exact_ids = set(ids[j] for j in exact_indices)

        qdrant_ids = set(qdrant_top_k(args.qdrant_url, query_vector, query_id, args.k))

        overlap = len(exact_ids & qdrant_ids) / args.k
        per_query_overlap.append(overlap)
        if overlap == 0:
            exact_zero_hits += 1

        if (i + 1) % 50 == 0:
            print(json.dumps({"event": "progress", "completed": i + 1, "total": len(sample_indices)}))

    duration_s = time.time() - started_at
    mean_overlap = float(np.mean(per_query_overlap))
    receipt = {
        "schema": "atlas.latent256-ann-exact-parity.v1",
        "canonical_authority": False,
        "collection": COLLECTION_NAME,
        "corpus_size": len(ids),
        "sample_size": len(sample_indices),
        "k": args.k,
        "seed": args.seed,
        "mean_overlap_at_k": mean_overlap,
        "zero_overlap_queries": exact_zero_hits,
        "duration_s": duration_s,
        "ground_truth": "exact cosine top-k over the full 55,169-row latent_256 corpus fetched from Postgres",
        "candidate": "Qdrant live HNSW /points/search on codebase_chunks_latent256, same query vector, self excluded",
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(receipt, fh, indent=2)
    print(json.dumps({"event": "receipt_written", "path": args.out}))
    status = "ANN_EXACT_PARITY_PROVEN" if mean_overlap >= 0.9 else "ANN_EXACT_PARITY_DEGRADED"
    print(json.dumps({"status": status, "mean_overlap_at_k": mean_overlap, "zero_overlap_queries": exact_zero_hits}))


if __name__ == "__main__":
    main()
