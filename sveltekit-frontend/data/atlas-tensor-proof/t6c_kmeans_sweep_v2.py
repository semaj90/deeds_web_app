"""
T6c v2 (refined per design review 2026-08-10): RAPIDS KMeans coarse-routing
evaluation over the frozen semantic_768_r1_full.arrow corpus, sweeping both
K (cluster count) and C (nearest-centroids searched), against the T3a exact
oracle. Extremely narrow scope per explicit stop condition: no SOM, no RRF,
no AE, no Neo4j, no FeatureVector5 touched here.

Pre-registered invariant (checked, not assumed): semantic_768 confirmed
L2-normalized live (norms ~1.0000, std~0) before this run — so squared-
Euclidean KMeans objective is cosine-consistent for these vectors
(‖x−y‖² = 2−2cos(x,y) for unit vectors); no separate normalized derivative
artifact is needed.

IMPORT ORDER: torch before cuml (see t6c_kmeans_sweep.py docstring — GS1.33
cublas ABI fragility, confirmed live).

Run inside WSL2 (atlas-rapids-cu13 env):
  source ~/miniforge3/bin/activate atlas-rapids-cu13
  cd /mnt/c/Users/james/Videos/deeds-web-app/sveltekit-frontend/python
  python ../data/atlas-tensor-proof/t6c_kmeans_sweep_v2.py
"""
from __future__ import annotations
import sys, time, json, statistics
import torch  # MUST import before cuml
import numpy as np
import cupy as cp
import cuml
from cuml.cluster import KMeans

sys.path.insert(0, ".")
from parent_atlas_tensor.arrow_ipc import open_mmap, batch_matrix, write_ipc_file, fixed_f32, sha256_file
import pyarrow as pa

ARROW_PATH = "../data/atlas-tensor-proof/semantic_768_r1_full.arrow"
SOURCE_ARTIFACT_SHA256 = sha256_file(ARROW_PATH)
REPRESENTATION_REVISION = "semantic_768:r1_full"
K_SWEEP = [64, 128, 256]
C_SWEEP = [1, 2, 4, 8]
NUM_QUERIES = 20
SEED = 42
TOP_KS = [1, 5, 10]

src, reader = open_mmap(ARROW_PATH)
batch = reader.get_batch(0)
packet_keys = batch.column(0).to_pylist()
matrix = batch_matrix(batch, "semantic_768")
n, dim = matrix.shape
print(f"corpus: {n} rows x {dim} dims (source sha256={SOURCE_ARTIFACT_SHA256[:16]}...)")

rng = np.random.default_rng(SEED)
query_rows = rng.choice(n, size=NUM_QUERIES, replace=False)
all_idx = np.arange(n)

def cosine_topk(query_idx, corpus_idx, k):
    qv = matrix[query_idx]
    sub = matrix[corpus_idx]
    sims = sub @ qv  # already unit-normalized -> dot product == cosine similarity
    order = np.argsort(-sims)[:k]
    return [corpus_idx[i] for i in order]

# full-corpus exact oracle for each query, at each requested top-K
oracle = {int(q): {k: set(cosine_topk(int(q), all_idx, k)) for k in TOP_KS} for q in query_rows}

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
    cluster_stats = {
        "empty_clusters": int(np.sum(sizes == 0)),
        "cluster_size_min": int(sizes.min()),
        "cluster_size_median": float(np.median(sizes)),
        "cluster_size_p95": float(np.percentile(sizes, 95)),
        "cluster_size_max": int(sizes.max()),
    }

    dist_to_own_centroid = np.linalg.norm(matrix - centroids_np[labels_np], axis=1)

    for C in C_SWEEP:
        candidate_fracs, centroid_route_times, candidate_exact_times = [], [], []
        recalls = {k: [] for k in TOP_KS}
        for q in query_rows:
            q = int(q)
            t1 = time.time()
            dists = np.linalg.norm(centroids_np - matrix[q], axis=1)
            nearest = np.argsort(dists)[:C]
            centroid_route_times.append((time.time() - t1) * 1000)

            candidate_idx = all_idx[np.isin(labels_np, nearest)]
            candidate_fracs.append(len(candidate_idx) / n)

            t2 = time.time()
            for k in TOP_KS:
                if len(candidate_idx) < k:
                    recalls[k].append(0.0)
                    continue
                restricted = set(cosine_topk(q, candidate_idx, k))
                recalls[k].append(len(restricted & oracle[q][k]) / k)
            candidate_exact_times.append((time.time() - t2) * 1000)

        row = {
            "K": K, "C": C,
            "centroids_searched": C,
            "candidate_count_mean": round(statistics.mean(candidate_fracs) * n, 1),
            "candidate_fraction_mean": round(statistics.mean(candidate_fracs), 4),
            "candidate_fraction_p95": round(float(np.percentile(candidate_fracs, 95)), 4),
            "recall_at_1": round(statistics.mean(recalls[1]), 4),
            "recall_at_5": round(statistics.mean(recalls[5]), 4),
            "recall_at_10": round(statistics.mean(recalls[10]), 4),
            "centroid_route_ms_p50": round(float(np.percentile(centroid_route_times, 50)), 4),
            "centroid_route_ms_p95": round(float(np.percentile(centroid_route_times, 95)), 4),
            "candidate_exact_ms_p50": round(float(np.percentile(candidate_exact_times, 50)), 4),
            "candidate_exact_ms_p95": round(float(np.percentile(candidate_exact_times, 95)), 4),
            "inertia": inertia,
            "fit_ms": round(fit_ms, 1),
            **cluster_stats,
        }
        results.append(row)
        print(json.dumps(row))

    # --- persist three logically separate artifacts for this K ---
    centroid_ids = [f"centroid:semantic_768:k{K}:r1:{i}" for i in range(K)]

    centroid_batch = pa.RecordBatch.from_arrays(
        [pa.array(centroid_ids, type=pa.string()), fixed_f32(centroids_np)],
        ["centroid_id", "centroid_768"],
    )
    centroid_path = f"../data/atlas-tensor-proof/centroids_r1_k{K}.arrow"
    write_ipc_file(centroid_path, [centroid_batch])

    membership_batch = pa.RecordBatch.from_arrays(
        [
            pa.array(packet_keys, type=pa.string()),
            pa.array([centroid_ids[l] for l in labels_np], type=pa.string()),
            pa.array(dist_to_own_centroid.tolist(), type=pa.float32()),
        ],
        ["packet_key", "centroid_id", "distance_to_centroid"],
    )
    membership_path = f"../data/atlas-tensor-proof/membership_r1_k{K}.arrow"
    write_ipc_file(membership_path, [membership_batch])

    run_manifest = {
        "sourceArtifactId": "semantic_768_r1_full.arrow",
        "sourceSha256": SOURCE_ARTIFACT_SHA256,
        "representationRevision": REPRESENTATION_REVISION,
        "algorithmRevision": "cuml.KMeans-v1",
        "rapidsCumlVersion": cuml.__version__,
        "K": K,
        "seed": SEED,
        "nInit": 10,
        "inertia": inertia,
        "fitDurationMs": round(fit_ms, 1),
        "centroidArtifact": {"path": centroid_path, "sha256": sha256_file(centroid_path)},
        "membershipArtifact": {"path": membership_path, "sha256": sha256_file(membership_path)},
        "semanticVectorsConfirmedL2Normalized": True,
    }
    manifest_path = f"../data/atlas-tensor-proof/kmeans_run_r1_k{K}.json"
    with open(manifest_path, "w") as f:
        json.dump(run_manifest, f, indent=2)
    print(f"  persisted K={K}: {centroid_path}, {membership_path}, {manifest_path}")

print("\n=== T6c v2 FULL RESULT TABLE ===")
print(json.dumps(results, indent=2))
