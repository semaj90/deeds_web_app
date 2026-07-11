#!/usr/bin/env python3
"""
Phase 4: cuVS Recall Baseline Validation
=========================================

Establishes ground truth for IVF-Flat accuracy vs Qdrant brute-force.
Validates search latency and informs n_lists/n_probes tuning.

Target metrics:
  - Recall@10 >= 0.95
  - Recall@50 >= 0.97
  - Recall@100 >= 0.98
  - Latency: <10ms per query (batch 100 queries)

Inputs:
  - 40,554 embeddings (768-dim, normalized float32) from Postgres codebase_chunk_index
  - 100 random query embeddings
  - Row ID mapping for recovery

Outputs:
  - Recall@K results (tab-separated)
  - Latency distribution (mean, p50, p95, p99)
  - n_lists/n_probes recommendations
  - Postgres table: cuVS_recall_validation (schema created, results inserted)
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Tuple, List
import numpy as np
import pandas as pd

# cuVS imports
try:
    import cuvs
    from cuvs.neighbors import ivf_flat
    import cupy as cp
except ImportError as e:
    print(f"ERROR: cuVS not available: {e}", file=sys.stderr)
    print("Install: pip install cuvs cupy-cuda12x", file=sys.stderr)
    sys.exit(1)

# Postgres import
try:
    import psycopg
except ImportError:
    print("ERROR: psycopg3 not installed", file=sys.stderr)
    print("Install: pip install psycopg[binary]", file=sys.stderr)
    sys.exit(1)


def fetch_embeddings_from_postgres(
    db_url: str, limit: int = None
) -> Tuple[np.ndarray, List[str], List[int]]:
    """
    Fetch embeddings from Postgres codebase_chunk_index.

    Returns:
      - embeddings (ndarray, N x 768)
      - relative_paths (list of str, length N)
      - row_ids (list of int, length N)
    """
    try:
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT id, relative_path, content_embedding
                    FROM codebase_chunk_index
                    WHERE content_embedding IS NOT NULL
                """
                if limit:
                    query += f" LIMIT {limit}"

                cur.execute(query)
                rows = cur.fetchall()

        if not rows:
            print("ERROR: No embeddings found in codebase_chunk_index", file=sys.stderr)
            sys.exit(1)

        row_ids = [int(r[0]) for r in rows]
        relative_paths = [str(r[1]) for r in rows]
        def to_vec(raw):
            if raw is None:
                return None
            if isinstance(raw, str):
                return np.array(json.loads(raw), dtype=np.float32)
            return np.array(raw, dtype=np.float32)

        embeddings = np.stack([to_vec(r[2]) for r in rows])

        print(f"Loaded {len(rows)} embeddings from Postgres (shape: {embeddings.shape})")

        # Normalize to unit vectors (L2)
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        embeddings = embeddings / (norms + 1e-8)

        return embeddings, relative_paths, row_ids

    except Exception as e:
        print(f"ERROR: Failed to fetch embeddings: {e}", file=sys.stderr)
        sys.exit(1)


def select_query_embeddings(embeddings: np.ndarray, n_queries: int = 100) -> Tuple[np.ndarray, List[int]]:
    """
    Randomly select query embeddings from the dataset.
    Returns queries and their original indices (for ground truth).
    """
    indices = np.random.choice(len(embeddings), size=min(n_queries, len(embeddings)), replace=False)
    return embeddings[indices], indices


def build_ivf_flat_index(embeddings: np.ndarray, n_lists: int = 100) -> Tuple[ivf_flat.IVFFlat, np.ndarray]:
    """
    Build IVF-Flat index on GPU using cuVS.

    Args:
      - embeddings (N x D, float32, normalized)
      - n_lists (int, number of clusters)

    Returns:
      - index object (ready for search)
      - embeddings_gpu (cupy array, for reference)
    """
    print(f"Building IVF-Flat index with n_lists={n_lists}...")

    # Transfer to GPU
    embeddings_gpu = cp.asarray(embeddings)

    # Build IVF-Flat index
    index_params = ivf_flat.IndexParams(
        n_lists=n_lists,
        metric="cosine",  # cosine distance on normalized vectors
    )
    index = ivf_flat.build(index_params, embeddings_gpu)

    print(f"Index built successfully")
    return index, embeddings_gpu


def brute_force_search(queries: np.ndarray, embeddings: np.ndarray, k: int = 100) -> np.ndarray:
    """
    Brute-force exact NN via cosine similarity (ground truth).
    Returns indices (N_queries x k).
    """
    print(f"Computing brute-force ground truth (k={k})...")

    # Cosine similarity via dot product (both normalized)
    scores = queries @ embeddings.T  # (N_queries, N_embeddings)

    # Get top-k indices (descending)
    neighbors = np.argsort(-scores, axis=1)[:, :k]

    return neighbors


def ivf_flat_search(
    index: ivf_flat.IVFFlat,
    queries_gpu: np.ndarray,
    k: int = 100,
    n_probes: int = 10,
) -> np.ndarray:
    """
    IVF-Flat search on GPU.

    Args:
      - index: built IVF-Flat index
      - queries_gpu (cupy array, N_queries x 768)
      - k (int, top-k results)
      - n_probes (int, number of clusters to probe)

    Returns:
      - neighbors (ndarray, N_queries x k)
    """
    print(f"IVF-Flat search (k={k}, n_probes={n_probes})...")

    # Search
    search_params = ivf_flat.SearchParams(n_probes=n_probes)
    distances_gpu, neighbors_gpu = ivf_flat.search(
        search_params,
        index,
        queries_gpu,
        k,
    )

    # Transfer back to host
    neighbors = cp.asnumpy(neighbors_gpu)

    return neighbors


def compute_recall(ground_truth_row: np.ndarray, predicted_row: np.ndarray, k: int) -> float:
    """
    Compute Recall@k for a single query row.
    """
    gt_set = set(map(int, ground_truth_row[:k]))
    pred_set = set(map(int, predicted_row[:k]))
    return len(gt_set & pred_set) / len(gt_set) if gt_set else 1.0


def run_phase4_validation():
    """Main Phase 4 validation pipeline."""

    # Configuration
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://legal_admin:password@127.0.0.1:5434/legal_ai_db"
    )
    query_seed = int(os.environ.get("PHASE4_CUVS_QUERY_SEED", "42"))
    n_queries = 100
    n_lists = int(os.environ.get("PHASE4_CUVS_N_LISTS", "190"))  # IVF-Flat clusters
    n_probes_list = [5, 10, 20, 25, 30, 35, 37, 40]  # Test multiple probe counts
    k_values = [10, 50, 100]  # Test Recall@K for these K values

    print("=" * 80)
    print("Phase 4: cuVS Recall Baseline Validation")
    print("=" * 80)
    print(f"Timestamp: {datetime.now().isoformat()}")
    print(f"Query seed: {query_seed}")
    print()

    # Step 1: Fetch embeddings
    print("Step 1: Loading embeddings from Postgres...")
    embeddings, relative_paths, row_ids = fetch_embeddings_from_postgres(db_url)
    print()

    # Step 2: Select query embeddings
    print(f"Step 2: Selecting {n_queries} random query embeddings...")
    np.random.seed(query_seed)
    query_embeddings, query_indices = select_query_embeddings(embeddings, n_queries)
    print(f"Selected indices: {query_indices}")
    print()

    # Step 3: Compute brute-force ground truth
    print("Step 3: Computing brute-force ground truth...")
    ground_truth_100 = brute_force_search(query_embeddings, embeddings, k=100)
    print(f"Ground truth shape: {ground_truth_100.shape}")
    print()

    # Step 4: Build IVF-Flat index
    print(f"Step 4: Building IVF-Flat index (n_lists={n_lists})...")
    index, embeddings_gpu = build_ivf_flat_index(embeddings, n_lists)
    print()

    # Step 5: Run searches with different n_probes
    print("Step 5: Running IVF-Flat searches with different n_probes values...")
    queries_gpu = cp.asarray(query_embeddings)

    results = []

    for n_probes in n_probes_list:
        print(f"\n  n_probes={n_probes}:")

        # Warm-up run
        _ = ivf_flat_search(index, queries_gpu, k=100, n_probes=n_probes)

        # Timed runs (5 iterations for latency stats)
        latencies = []
        neighbors_list = []

        for run in range(5):
            start = time.perf_counter()
            neighbors = ivf_flat_search(index, queries_gpu, k=100, n_probes=n_probes)
            elapsed = time.perf_counter() - start

            latencies.append(elapsed * 1000)  # Convert to ms
            if run == 0:
                neighbors_list.append(neighbors)

        neighbors = neighbors_list[0]

        # Compute recall@K for this n_probes
        recalls = {}
        for k in k_values:
            # For each query, compute recall
            query_recalls = []
            for q_idx in range(len(query_embeddings)):
                ground = ground_truth_100[q_idx]
                predicted = neighbors[q_idx]
                recall = compute_recall(ground, predicted, k)
                query_recalls.append(recall)

            recalls[f"recall@{k}"] = np.mean(query_recalls)

        # Latency stats
        latency_mean = np.mean(latencies)
        latency_p50 = np.percentile(latencies, 50)
        latency_p95 = np.percentile(latencies, 95)
        latency_p99 = np.percentile(latencies, 99)

        print(f"    Recall@10: {recalls['recall@10']:.4f}")
        print(f"    Recall@50: {recalls['recall@50']:.4f}")
        print(f"    Recall@100: {recalls['recall@100']:.4f}")
        print(f"    Latency (ms): mean={latency_mean:.2f}, p50={latency_p50:.2f}, p95={latency_p95:.2f}, p99={latency_p99:.2f}")

        results.append({
            "n_probes": n_probes,
            "recall@10": recalls["recall@10"],
            "recall@50": recalls["recall@50"],
            "recall@100": recalls["recall@100"],
            "latency_ms_mean": latency_mean,
            "latency_ms_p50": latency_p50,
            "latency_ms_p95": latency_p95,
            "latency_ms_p99": latency_p99,
        })

    print()
    print("=" * 80)
    print("RESULTS")
    print("=" * 80)

    # Print table
    df = pd.DataFrame(results)
    print(df.to_string(index=False))
    print()

    # Save results
    output_json = "phase4-cuVS-recall-results.json"
    with open(output_json, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Results saved to: {output_json}")
    print()

    # Recommendations
    print("RECOMMENDATIONS:")
    print("-" * 80)
    for _, row in df.iterrows():
        n_probes = int(row["n_probes"])
        recall_10 = row["recall@10"]
        recall_50 = row["recall@50"]
        recall_100 = row["recall@100"]
        latency = row["latency_ms_mean"]

        status = "✅"
        if recall_10 < 0.95 or recall_50 < 0.97 or recall_100 < 0.98 or latency > 10:
            status = "⚠️"

        print(f"{status} n_probes={n_probes:2d}: Recall@10={recall_10:.4f}, @50={recall_50:.4f}, @100={recall_100:.4f}, Latency={latency:6.2f}ms")

    passing_rows = df[
        (df["recall@10"] >= 0.95)
        & (df["recall@50"] >= 0.97)
        & (df["recall@100"] >= 0.98)
        & (df["latency_ms_mean"] < 10)
    ]
    if not passing_rows.empty:
        best = passing_rows.sort_values(["latency_ms_mean", "recall@100"], ascending=[True, False]).iloc[0]
        print()
        print(
            "Recommended config: "
            f"n_lists={n_lists}, n_probes={int(best['n_probes'])} "
            f"(Recall@10={best['recall@10']:.4f}, "
            f"Recall@50={best['recall@50']:.4f}, "
            f"Recall@100={best['recall@100']:.4f}, "
            f"Latency={best['latency_ms_mean']:.2f}ms)"
        )
    else:
        print()
        print("No config met all targets in this sweep. Adjust n_lists/n_probes and rerun.")

    print()
    print("Target metrics:")
    print("  - Recall@10 >= 0.95")
    print("  - Recall@50 >= 0.97")
    print("  - Recall@100 >= 0.98")
    print("  - Latency < 10ms")
    print()


if __name__ == "__main__":
    run_phase4_validation()
