"""
T6c proof (parent-atlas-tensor-residency-integration): RAPIDS KMeans over the
already-proven semantic_768 Arrow corpus. Evaluation sweep across K, measured
against the T3a exact-oracle top-10 (no AE, no SOM, no FeatureVector5, no RRF
changes needed for this step).

IMPORT ORDER MATTERS: torch must be imported before cuml/cudf in this conda
env (atlas-rapids-cu13) or cuml raises a cublas symbol-version ImportError.
Confirmed live 2026-08-10 — this is the same fragility already documented in
this session as GS1.33 (torch-before-cudf/cugraph). Do not reorder these imports.

Run inside WSL2 (atlas-rapids-cu13 env), from the mounted repo root:
  source ~/miniforge3/bin/activate atlas-rapids-cu13
  cd /mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python
  python ../data/atlas-tensor-proof/t6c_kmeans_sweep.py
"""
from __future__ import annotations
import sys, time, json, statistics
import torch  # MUST import before cuml — see module docstring
import numpy as np
import cupy as cp
from cuml.cluster import KMeans

sys.path.insert(0, ".")
from parent_atlas_tensor.arrow_ipc import open_mmap, batch_matrix, write_ipc_file, fixed_f32, sha256_file
import pyarrow as pa

ARROW_PATH = "../data/atlas-tensor-proof/semantic_768_r1_full.arrow"
K_SWEEP = [64, 128, 256]
NUM_QUERIES = 20
SEED = 42
TOP_K = 10
TOP_CLUSTERS = [1, 3]  # coarse-routing candidate sets to test recall against

src, reader = open_mmap(ARROW_PATH)
batch = reader.get_batch(0)
packet_keys = batch.column(0).to_pylist()
matrix = batch_matrix(batch, "semantic_768")
n, dim = matrix.shape
print(f"corpus: {n} rows x {dim} dims")

rng = np.random.default_rng(SEED)
query_rows = rng.choice(n, size=NUM_QUERIES, replace=False)

def cosine_topk(query, corpus_idx, k):
    qn = matrix[query] / (np.linalg.norm(matrix[query]) + 1e-12)
    sub = matrix[corpus_idx]
    cn = sub / (np.linalg.norm(sub, axis=1, keepdims=True) + 1e-12)
    sims = cn @ qn
    order = np.argsort(-sims)[:k]
    return set(corpus_idx[i] for i in order)

# full-corpus exact oracle top-10 for each query (same method as T3a/T6b)
all_idx = np.arange(n)
oracle_sets = {int(q): cosine_topk(int(q), all_idx, TOP_K) for q in query_rows}

results = []
gpu_matrix = cp.asarray(matrix, dtype=cp.float32)

for K in K_SWEEP:
    t0 = time.time()
    km = KMeans(n_clusters=K, random_state=SEED, n_init=10)
    labels = km.fit_predict(gpu_matrix)
    fit_ms = (time.time() - t0) * 1000
    labels_np = cp.asnumpy(labels).astype(np.int32)
    centroids_np = cp.asnumpy(km.cluster_centers_).astype(np.float32)
    inertia = float(km.inertia_)

    sizes = np.bincount(labels_np, minlength=K)
    empty_clusters = int(np.sum(sizes == 0))
    size_p50 = float(np.percentile(sizes, 50))
    size_p95 = float(np.percentile(sizes, 95))

    recalls = {tc: [] for tc in TOP_CLUSTERS}
    centroid_search_times = []
    for q in query_rows:
        q = int(q)
        t1 = time.time()
        dists_to_centroids = np.linalg.norm(centroids_np - matrix[q], axis=1)
        nearest_clusters = np.argsort(dists_to_centroids)
        centroid_search_times.append((time.time() - t1) * 1000)
        for tc in TOP_CLUSTERS:
            chosen_clusters = set(nearest_clusters[:tc].tolist())
            candidate_idx = all_idx[np.isin(labels_np, list(chosen_clusters))]
            if len(candidate_idx) < TOP_K:
                recalls[tc].append(0.0)
                continue
            restricted_top10 = cosine_topk(q, candidate_idx, TOP_K)
            recall = len(restricted_top10 & oracle_sets[q]) / TOP_K
            recalls[tc].append(recall)

    row = {
        "K": K,
        "fit_ms": round(fit_ms, 1),
        "inertia": inertia,
        "empty_clusters": empty_clusters,
        "cluster_size_p50": size_p50,
        "cluster_size_p95": size_p95,
        "mean_centroid_search_ms": round(statistics.mean(centroid_search_times), 3),
        **{f"mean_recall_at_10_top{tc}cluster": round(statistics.mean(recalls[tc]), 4) for tc in TOP_CLUSTERS},
        **{f"min_recall_at_10_top{tc}cluster": round(min(recalls[tc]), 4) for tc in TOP_CLUSTERS},
    }
    results.append(row)
    print(json.dumps(row, indent=2))

    # persist centroid + membership artifacts, revision-qualified by K (sweep, no canonical K chosen yet)
    centroid_ids = [f"centroid:semantic_768:k{K}:r1:{i}" for i in range(K)]
    centroid_batch = pa.RecordBatch.from_arrays(
        [pa.array(centroid_ids, type=pa.string()), fixed_f32(centroids_np)],
        ["centroid_id", "centroid_768"],
    )
    centroid_path = f"../data/atlas-tensor-proof/centroids_k{K}_r1.arrow"
    write_ipc_file(centroid_path, [centroid_batch])

    membership_batch = pa.RecordBatch.from_arrays(
        [pa.array(packet_keys, type=pa.string()), pa.array([centroid_ids[l] for l in labels_np], type=pa.string())],
        ["packet_key", "centroid_id"],
    )
    membership_path = f"../data/atlas-tensor-proof/membership_k{K}_r1.arrow"
    write_ipc_file(membership_path, [membership_batch])
    print(f"  persisted: {centroid_path} (sha256={sha256_file(centroid_path)[:16]}...), "
          f"{membership_path} (sha256={sha256_file(membership_path)[:16]}...)")

print("\n=== SWEEP SUMMARY ===")
print(json.dumps(results, indent=2))
