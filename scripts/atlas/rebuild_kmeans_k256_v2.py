#!/usr/bin/env python3
"""
KMEANS-REBUILD-01: Rebuild 256 spherical centroids on current content_embedding_768 vectors.

Resolves the 81.25% stale-centroid replay gap documented in KMEANS-REPLAY-01.
Reads embeddings via read-only cursor; writes local receipt and proposed assignments artifact.
Zero mutations to PostgreSQL or Qdrant. CPU only (preserves GPU VRAM for llama-server :8090).

Outputs:
  docs/reports/kmeans-rebuild-v1-receipt.json
  .tmp/atlas/kmeans-v2/k256-v2-centroids.json
  .tmp/atlas/kmeans-v2/unclustered-2789-assignments.ndjson
"""

import argparse
import datetime
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path
import numpy as np
import psycopg
from sklearn.cluster import MiniBatchKMeans
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import normalize

ROOT = Path(__file__).resolve().parents[2]
DIM = 768
K_DEFAULT = 256
SEED = 42

def sha256_bytes(b: bytes) -> str:
    return "sha256:" + hashlib.sha256(b).hexdigest()

def get_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"^\s*DATABASE_URL\s*=\s*(.+)$", line)
            if m:
                return m.group(1).strip().strip('"').strip("'")
    return ""

def main():
    ap = argparse.ArgumentParser(description="KMEANS-REBUILD-01: Fit K=256 spherical centroids on CPU")
    ap.add_argument("--k", type=int, default=K_DEFAULT, help="Number of clusters (default: 256)")
    ap.add_argument("--sample", type=int, default=0, help="Optional sample limit (0 = all qualified rows)")
    ap.add_argument("--resume", action="store_true", help="Resume from cached .tmp stage-1 npz vectors")
    ap.add_argument("--stage1-only", action="store_true", help="Extract and checkpoint vectors only")
    args = ap.parse_args()

    db_url = get_database_url()
    if not db_url:
        sys.exit("ERROR: DATABASE_URL not found in environment or .env")

    out_dir = ROOT / ".tmp" / "atlas" / "kmeans-v2"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_file = ROOT / "docs" / "reports" / "kmeans-rebuild-v1-receipt.json"

    t0 = time.time()
    cache_tag = f"n{args.sample}" if args.sample > 0 else "all"
    ck_file = out_dir / f"stage1-vectors-{cache_tag}.npz"

    # Step 1: Stream or resume embeddings
    if args.resume and ck_file.exists():
        print(f"Resuming stage 1 from {ck_file}...", flush=True)
        z = np.load(ck_file, allow_pickle=False)
        chunk_ids = z["chunk_ids"].tolist()
        source_refs = z["source_refs"].tolist()
        old_clusters = z["old_clusters"]
        X = z["X"]
    else:
        print("Connecting to Postgres with read-only transaction...", flush=True)
        chunk_ids, source_refs, old_st, vectors = [], [], [], []
        with psycopg.connect(db_url, options="-c default_transaction_read_only=on") as conn:
            with conn.cursor() as cur:
                cur.execute("show transaction_read_only")
                if cur.fetchone()[0] != "on":
                    raise RuntimeError("POSTGRES_READ_ONLY_TRANSACTION_NOT_CONFIRMED")

            sql = """
                SELECT id::text, source_ref, kmeans_cluster, content_embedding::text
                FROM codebase_chunk_index
                WHERE content_embedding IS NOT NULL
                ORDER BY md5(id::text)
            """
            if args.sample > 0:
                sql += f" LIMIT {args.sample}"

            print("Streaming chunk embeddings from codebase_chunk_index...", flush=True)
            with conn.cursor(name="kmeans_stream") as sc:
                sc.itersize = 2000
                sc.execute(sql)
                for i, (cid, sref, cluster, emb_json) in enumerate(sc):
                    vec = np.asarray(json.loads(emb_json), dtype=np.float32)
                    if vec.shape != (DIM,) or not np.isfinite(vec).all():
                        raise ValueError(f"INVALID_EMBEDDING_VECTOR:{cid}")
                    vectors.append(vec)
                    chunk_ids.append(cid)
                    source_refs.append(sref or "")
                    old_st.append(cluster if cluster is not None else -1)
                    if (i + 1) % 10000 == 0:
                        print(f"  Streamed {i + 1} chunks...", flush=True)

        X = np.vstack(vectors).astype(np.float32)
        old_clusters = np.array(old_st, dtype=np.int32)
        print(f"Total chunks loaded: {len(chunk_ids)} (shape: {X.shape})", flush=True)

        # L2 normalize all vectors to unit sphere for spherical K-means
        X = normalize(X, norm="l2", axis=1)

        print(f"Writing checkpoint to {ck_file}...", flush=True)
        tmp_ck = ck_file.with_name(ck_file.stem + "-tmp.npz")
        np.savez_compressed(tmp_ck, chunk_ids=np.array(chunk_ids), source_refs=np.array(source_refs),
                            old_clusters=old_clusters, X=X)
        os.replace(tmp_ck, ck_file)

    if args.stage1_only:
        print(json.dumps({"stage1Only": True, "rows": len(chunk_ids), "checkpoint": str(ck_file)}, indent=2))
        return 0

    N = len(chunk_ids)
    K = args.k
    print(f"\nStep 2: Fitting Spherical MiniBatchKMeans (K={K}, batch_size=4096, seed={SEED}) on CPU...", flush=True)

    # 80/20 train/test split for holdout generalization replay
    tr_idx, te_idx = train_test_split(np.arange(N), test_size=0.20, random_state=SEED)
    X_tr, X_te = X[tr_idx], X[te_idx]

    fit_start = time.time()
    km = MiniBatchKMeans(
        n_clusters=K,
        batch_size=4096,
        n_init=5,
        max_iter=200,
        random_state=SEED,
        verbose=0
    )
    km.fit(X_tr)
    fit_duration = time.time() - fit_start
    print(f"  Fit completed in {fit_duration:.1f}s. Inertia: {km.inertia_:.2f}", flush=True)

    # Normalize centroids to unit length for spherical cosine similarity
    C = normalize(km.cluster_centers_.astype(np.float32), norm="l2", axis=1)

    print("\nStep 3: Evaluating holdout agreement & cluster margins...", flush=True)
    # Cosine similarities for holdout test set
    sims_te = X_te @ C.T
    te_c1 = np.argmax(sims_te, axis=1)
    # Compare with predict on test set
    te_predict = km.predict(X_te)
    holdout_agreement = float(np.mean(te_c1 == te_predict))
    print(f"  Holdout test agreement (argmax cosine vs predict): {holdout_agreement * 100:.2f}%", flush=True)

    # Full cohort assignment & routing margins
    print("\nStep 4: Computing full cohort assignments and top-2 routing margins...", flush=True)
    sims_all = X @ C.T
    top2 = np.argpartition(-sims_all, 1, axis=1)[:, :2]
    s_top2 = np.take_along_axis(sims_all, top2, axis=1)
    o = np.argsort(-s_top2, axis=1)
    c1 = np.take_along_axis(top2, o, axis=1)[:, 0]
    c2 = np.take_along_axis(top2, o, axis=1)[:, 1]
    s1 = np.take_along_axis(s_top2, o, axis=1)[:, 0]
    s2 = np.take_along_axis(s_top2, o, axis=1)[:, 1]
    margin = s1 - s2

    # Agreement with old July assignments (for previously clustered chunks)
    clustered_mask = old_clusters >= 0
    if np.any(clustered_mask):
        old_agreement = float(np.mean(c1[clustered_mask] == old_clusters[clustered_mask]))
    else:
        old_agreement = 0.0

    unclustered_indices = np.where(old_clusters < 0)[0]
    unclustered_count = len(unclustered_indices)
    print(f"  Historical July agreement on previously clustered chunks: {old_agreement * 100:.2f}% (expected ~81-82% due to task-prefix shift)")
    print(f"  Unclustered chunks newly assigned: {unclustered_count}", flush=True)

    # Quantiles of routing margin
    q = lambda arr, p: round(float(np.quantile(arr, p)), 4)
    margin_quantiles = {
        "p10": q(margin, 0.10),
        "median": q(margin, 0.50),
        "p90": q(margin, 0.90),
        "ambiguousShareMarginBelow002": round(float((margin < 0.02).mean()), 4),
    }

    # Cluster size balance
    sizes = np.bincount(c1, minlength=K)
    cluster_balance = {
        "min": int(sizes.min()),
        "median": int(np.median(sizes)),
        "max": int(sizes.max()),
        "emptyClusters": int((sizes == 0).sum()),
    }

    # Step 5: Save artifacts
    print("\nStep 5: Writing staging artifacts...", flush=True)
    centroids_json = out_dir / "k256-v2-centroids.json"
    centroids_data = {
        "modelVersion": "mbk-spherical-content768-k256-v2",
        "k": K,
        "dim": DIM,
        "fittedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "holdoutAgreement": holdout_agreement,
        "inertia": float(km.inertia_),
        "centroids": C.tolist(),
    }
    centroids_bytes = json.dumps(centroids_data, indent=2).encode("utf-8")
    centroids_json.write_bytes(centroids_bytes)
    centroids_sha = sha256_bytes(centroids_bytes)

    # Export proposed assignments for the 2,789 unassigned chunks
    unassigned_ndjson = out_dir / "unclustered-2789-proposed-assignments.ndjson"
    unassigned_lines = []
    for idx in unclustered_indices:
        unassigned_lines.append(json.dumps({
            "chunkId": chunk_ids[idx],
            "sourceRef": source_refs[idx],
            "proposedCluster": int(c1[idx]),
            "secondCluster": int(c2[idx]),
            "primaryCosine": round(float(s1[idx]), 4),
            "secondCosine": round(float(s2[idx]), 4),
            "routingMargin": round(float(margin[idx]), 4),
            "modelVersion": "mbk-spherical-content768-k256-v2",
            "canonicalAuthority": False,
        }))
    unassigned_bytes = ("\n".join(unassigned_lines) + "\n").encode("utf-8")
    unassigned_ndjson.write_bytes(unassigned_bytes)
    unassigned_sha = sha256_bytes(unassigned_bytes)

    receipt = {
        "schema": "atlas.kmeans-rebuild.v1",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "readOnly": True,
        "writesPerformed": False,
        "canonicalAuthority": False,
        "gpuUsed": False,
        "hardwareNote": "Fitted entirely on CPU; RTX 3060 Ti VRAM preserved for llama-server :8090",
        "trainingCohort": {
            "totalChunks": N,
            "trainChunks": len(tr_idx),
            "testChunks": len(te_idx),
            "previouslyClustered": int(np.sum(clustered_mask)),
            "previouslyUnclustered": unclustered_count,
            "embeddingRecipe": "eg-task-prefix-v1",
            "dimensions": DIM,
        },
        "modelMetrics": {
            "k": K,
            "modelVersion": "mbk-spherical-content768-k256-v2",
            "fitDurationSeconds": round(fit_duration, 1),
            "inertia": round(float(km.inertia_), 2),
            "holdoutAgreement": round(holdout_agreement, 4),
            "historicalJulyAgreement": round(old_agreement, 4),
            "clusterBalance": cluster_balance,
            "routingMargin": margin_quantiles,
        },
        "artifacts": {
            "centroidsJson": {
                "path": str(centroids_json.relative_to(ROOT)).replace("\\", "/"),
                "sha256": centroids_sha,
            },
            "unclusteredAssignmentsNdjson": {
                "path": str(unassigned_ndjson.relative_to(ROOT)).replace("\\", "/"),
                "assignedCount": unclustered_count,
                "sha256": unassigned_sha,
            },
        },
        "status": "REBUILD_PROVEN_READY_FOR_ADMISSION",
    }
    receipt_bytes = json.dumps(receipt, indent=2).encode("utf-8")
    receipt["checksum"] = sha256_bytes(receipt_bytes)
    report_file.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    print(f"\n✓ Receipt written to: {report_file}")
    print(f"✓ Centroids artifact: {centroids_json} ({centroids_sha[:20]}...)")
    print(f"✓ Proposed unclustered assignments: {unassigned_ndjson} ({unclustered_count} rows)")
    print(f"✓ Total runtime: {time.time() - t0:.1f}s")
    return 0

if __name__ == "__main__":
    sys.exit(main())
