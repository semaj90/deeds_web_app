#!/usr/bin/env python3
"""
K-means chunk clustering — targets codebase_chunks_384_hybrid Qdrant collection (384-dim content vectors)

This is the PRODUCTION routing model, trained on the canonical 384-dim embedding space.
The companion script (kmeans-chunk-cluster.py) targets content_embedding (768-dim) for analysis only.

Model versioning:
  mbk-spherical-content384-k{K}-v1  ← this script (production routing)
  mbk-spherical-content768-k{K}-v1  ← companion script (analysis/legacy)

Usage:
  python kmeans-chunk-cluster-384.py --dry-run
  python kmeans-chunk-cluster-384.py --apply --k 128
  python kmeans-chunk-cluster-384.py --apply --k 64
  python kmeans-chunk-cluster-384.py --apply --k 256
"""

import argparse
import json
import sys
import os
import time
from datetime import datetime, timezone

import numpy as np
import psycopg2
import psycopg2.extras
import requests

# ── CLI ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Spherical K-means for codebase_chunks_384_hybrid")
parser.add_argument("--dry-run", action="store_true", help="Parse + cluster, no DB writes")
parser.add_argument("--apply",   action="store_true", help="Write results to Postgres + Qdrant payload")
parser.add_argument("--k",       type=int, default=128, help="Number of clusters (default 128)")
parser.add_argument("--batch",   type=int, default=1000, help="Qdrant scroll batch size (default 1000)")
parser.add_argument("--limit",   type=int, default=0,    help="Max points to process (0=all)")
parser.add_argument("--qdrant-collection", default="codebase_chunks_384_hybrid")
parser.add_argument("--qdrant-url",        default="http://localhost:6333")
parser.add_argument("--vector-name",       default="content",
                    help="Named vector to use (default: content)")
parser.add_argument("--verbose", action="store_true")
args = parser.parse_args()

if not args.dry_run and not args.apply:
    print("Pass --dry-run or --apply", file=sys.stderr)
    sys.exit(1)

K              = args.k
BATCH          = args.batch
LIMIT          = args.limit
VERBOSE        = args.verbose
COLLECTION     = args.qdrant_collection
QDRANT_URL     = args.qdrant_url
VECTOR_NAME    = args.vector_name
MODEL_VER      = f"mbk-spherical-content384-k{K}-v1"
VECTOR_CONTRACT = "canonical-content384-v1"
EPS            = 1e-9

# ── Postgres ─────────────────────────────────────────────────────────────────
PG_HOST = os.environ.get("PG_HOST", "127.0.0.1")
PG_PORT = int(os.environ.get("PG_PORT", "5434"))
PG_USER = os.environ.get("PG_USER", "legal_admin")
PG_PASS = os.environ.get("PG_PASSWORD", "123456")
PG_DB   = os.environ.get("PG_DATABASE", "legal_ai_db")

conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, user=PG_USER,
                        password=PG_PASS, dbname=PG_DB)
conn.autocommit = False

print("=== K-means Chunk Clustering (384-dim Production Routing) ===")
print(f"k={K}  batch={BATCH}  model_ver={MODEL_VER}")
print(f"collection={COLLECTION}  vector={VECTOR_NAME}")
print(f"mode={'DRY-RUN' if args.dry_run else 'APPLY'}")
print()

# ── Schema migration (idempotent) ─────────────────────────────────────────────
with conn.cursor() as cur:
    # Separate column for 384-dim cluster assignment
    cur.execute("""
        ALTER TABLE codebase_chunk_index
          ADD COLUMN IF NOT EXISTS kmeans384_cluster       integer,
          ADD COLUMN IF NOT EXISTS kmeans384_distance      real,
          ADD COLUMN IF NOT EXISTS kmeans384_second_id     integer,
          ADD COLUMN IF NOT EXISTS kmeans384_second_dist   real,
          ADD COLUMN IF NOT EXISTS kmeans384_margin        real,
          ADD COLUMN IF NOT EXISTS kmeans384_model_version text,
          ADD COLUMN IF NOT EXISTS kmeans384_assigned_at   timestamptz
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_cci_kmeans384_cluster
          ON codebase_chunk_index (kmeans384_cluster)
          WHERE kmeans384_cluster IS NOT NULL
    """)
    conn.commit()

print("Schema ready ✓")

# ── Load vectors from Qdrant (scroll API) ─────────────────────────────────────
print(f"Scrolling vectors from Qdrant collection '{COLLECTION}' (vector='{VECTOR_NAME}') ...")
t0 = time.time()

qdrant_ids  = []   # Qdrant point IDs (strings)
source_refs = []   # source_ref payload field → links to Postgres
embeddings  = []
languages   = []

offset = None
fetched = 0

while True:
    if LIMIT and fetched >= LIMIT:
        break

    batch_limit = BATCH
    if LIMIT:
        batch_limit = min(BATCH, LIMIT - fetched)

    payload_body = {
        "limit": batch_limit,
        "with_vectors": [VECTOR_NAME],
        "with_payload": ["source_ref", "language"],
    }
    if offset is not None:
        payload_body["offset"] = offset

    resp = requests.post(
        f"{QDRANT_URL}/collections/{COLLECTION}/points/scroll",
        json=payload_body,
        timeout=60,
    )
    resp.raise_for_status()
    data = resp.json()
    points = data.get("result", {}).get("points", [])
    next_offset = data.get("result", {}).get("next_page_offset")

    for pt in points:
        vec = pt.get("vector", {})
        if isinstance(vec, dict):
            vec = vec.get(VECTOR_NAME)
        if not vec or len(vec) != 384:
            continue
        qdrant_ids.append(str(pt["id"]))
        source_refs.append(pt.get("payload", {}).get("source_ref", ""))
        embeddings.append(np.array(vec, dtype=np.float32))
        languages.append(pt.get("payload", {}).get("language", "unknown") or "unknown")

    fetched += len(points)
    elapsed = time.time() - t0

    if VERBOSE or fetched % 5000 == 0:
        print(f"  Scrolled {fetched:,}  ({elapsed:.1f}s)")

    if not next_offset or not points:
        break
    offset = next_offset

print(f"Loaded {len(embeddings):,} vectors in {time.time()-t0:.1f}s")

if len(embeddings) == 0:
    print("No vectors found — exiting")
    sys.exit(0)

# ── L2-normalize (spherical K-means) ─────────────────────────────────────────
X = np.vstack(embeddings)   # (N, 384)
norms = np.linalg.norm(X, axis=1, keepdims=True)
norms = np.where(norms < EPS, 1.0, norms)
X_norm = X / norms
DIM = X_norm.shape[1]

assert DIM == 384, f"Expected 384-dim vectors, got {DIM}"
print(f"Normalized  shape={X_norm.shape}  dtype={X_norm.dtype}")
print()

# ── MiniBatchKMeans ───────────────────────────────────────────────────────────
from sklearn.cluster import MiniBatchKMeans
from sklearn.preprocessing import normalize

print(f"Fitting MiniBatchKMeans k={K} ...")
t1 = time.time()

km = MiniBatchKMeans(
    n_clusters=K,
    batch_size=max(1024, BATCH * 4),
    n_init=5,
    max_iter=200,
    random_state=42,
    verbose=0,
)
km.fit(X_norm)
fit_time = time.time() - t1
print(f"Fit complete in {fit_time:.1f}s  inertia={km.inertia_:.4f}")

centroids = normalize(km.cluster_centers_, norm="l2")  # (K, 384)

# ── Top-2 distances ───────────────────────────────────────────────────────────
print("Computing top-2 centroid distances ...")
t2 = time.time()

SCORE_CHUNK = 5000
N = len(qdrant_ids)
assignments = np.empty(N, dtype=np.int32)
d1_arr      = np.empty(N, dtype=np.float32)
second_ids  = np.empty(N, dtype=np.int32)
d2_arr      = np.empty(N, dtype=np.float32)
margin_arr  = np.empty(N, dtype=np.float32)

for start in range(0, N, SCORE_CHUNK):
    end   = min(start + SCORE_CHUNK, N)
    chunk = X_norm[start:end]
    sims  = chunk @ centroids.T

    top2_idx = np.argsort(-sims, axis=1)[:, :2]
    c1 = top2_idx[:, 0]
    c2 = top2_idx[:, 1]
    s1 = sims[np.arange(len(chunk)), c1]
    s2 = sims[np.arange(len(chunk)), c2]
    d1 = 1.0 - s1
    d2 = 1.0 - s2
    margin = (d2 - d1) / np.maximum(d2, EPS)

    assignments[start:end] = c1
    d1_arr[start:end]      = d1
    second_ids[start:end]  = c2
    d2_arr[start:end]      = d2
    margin_arr[start:end]  = margin

print(f"Scoring done in {time.time()-t2:.1f}s")
print(f"  avg distance={d1_arr.mean():.4f}  avg margin={margin_arr.mean():.4f}")

# ── Language stats ─────────────────────────────────────────────────────────────
lang_arr   = np.array(languages)
lang_stats = {}
for c in range(K):
    mask = assignments == c
    if mask.sum() == 0:
        lang_stats[str(c)] = {}
        continue
    langs_in = lang_arr[mask]
    unique, counts = np.unique(langs_in, return_counts=True)
    lang_stats[str(c)] = {l: int(n) for l, n in zip(unique, counts)}

cluster_sizes = np.bincount(assignments, minlength=K)
top5 = np.argsort(-cluster_sizes)[:5]
print("\nTop-5 clusters by size:")
for c in top5:
    langs = lang_stats.get(str(c), {})
    top_lang = max(langs, key=langs.get) if langs else "?"
    print(f"  cluster {c:3d}: {cluster_sizes[c]:5d} points  dominant_lang={top_lang}")

# ── DRY-RUN exit ──────────────────────────────────────────────────────────────
if args.dry_run:
    print()
    print("[DRY-RUN] Sample (first 5 points):")
    for i in range(min(5, N)):
        print(f"  qdrant_id={qdrant_ids[i][:12]}  cluster={assignments[i]:3d}  "
              f"d1={d1_arr[i]:.4f}  margin={margin_arr[i]:.4f}  "
              f"source_ref={source_refs[i][:40]}")
    print()
    print("DRY-RUN complete — no writes.")
    conn.close()
    sys.exit(0)

# ── Write centroid model to atlas_cluster_models ──────────────────────────────
print()
print("Writing centroid model to atlas_cluster_models ...")

centroid_list = centroids.tolist()
centroid_json = json.dumps(centroid_list)

with conn.cursor() as cur:
    cur.execute("""
        ALTER TABLE atlas_cluster_models
          ADD COLUMN IF NOT EXISTS source_column text,
          ADD COLUMN IF NOT EXISTS source_vector_dimension integer,
          ADD COLUMN IF NOT EXISTS source_embedding_model text,
          ADD COLUMN IF NOT EXISTS normalization text,
          ADD COLUMN IF NOT EXISTS algorithm text,
          ADD COLUMN IF NOT EXISTS random_seed integer,
          ADD COLUMN IF NOT EXISTS manifest_hash text
    """)
    cur.execute("""
        INSERT INTO atlas_cluster_models
          (model_version, k, dim, n_chunks, centroids, inertia, language_stats,
           source_column, source_vector_dimension, source_embedding_model,
           normalization, algorithm, random_seed)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb,
                %s, %s, %s, %s, %s, %s)
        ON CONFLICT (model_version) DO UPDATE SET
          k                       = EXCLUDED.k,
          dim                     = EXCLUDED.dim,
          n_chunks                = EXCLUDED.n_chunks,
          centroids               = EXCLUDED.centroids,
          inertia                 = EXCLUDED.inertia,
          language_stats          = EXCLUDED.language_stats,
          source_column           = EXCLUDED.source_column,
          source_vector_dimension = EXCLUDED.source_vector_dimension,
          source_embedding_model  = EXCLUDED.source_embedding_model,
          normalization           = EXCLUDED.normalization,
          algorithm               = EXCLUDED.algorithm,
          random_seed             = EXCLUDED.random_seed,
          created_at              = NOW()
    """, (MODEL_VER, K, DIM, N, centroid_json,
          float(km.inertia_), json.dumps(lang_stats),
          f'{COLLECTION}.{VECTOR_NAME}', DIM, 'embeddinggemma:latest',
          'l2', 'minibatch-spherical-kmeans', 42))
    conn.commit()

print("Centroid model saved ✓")

# ── Build source_ref → Qdrant id map for Postgres join ───────────────────────
# Map source_ref → list of (qdrant_id, cluster, d1, d2, margin) for Postgres writes
print(f"\nBuilding source_ref → chunk lookup ...")

# Fetch Postgres chunk IDs by source_ref for join
source_ref_set = set(sr for sr in source_refs if sr)
print(f"  Unique source_refs: {len(source_ref_set):,}")

# Write kmeans384 assignments to codebase_chunk_index
# Join on qdrant_id (stored in codebase_chunk_index.qdrant_id)
# Fall back to source_ref match if qdrant_id is unavailable
print(f"Writing {N:,} cluster assignments to codebase_chunk_index ...")
t3 = time.time()

WRITE_BATCH = 500
written = 0
skipped = 0
now_ts  = datetime.now(timezone.utc).isoformat()

for start in range(0, N, WRITE_BATCH):
    end   = min(start + WRITE_BATCH, N)
    batch = [
        (
            int(assignments[i]),
            float(d1_arr[i]),
            int(second_ids[i]),
            float(d2_arr[i]),
            float(margin_arr[i]),
            MODEL_VER,
            now_ts,
            qdrant_ids[i],       # join key
        )
        for i in range(start, end)
    ]

    with conn.cursor() as cur:
        # Primary join: qdrant_id column
        psycopg2.extras.execute_values(cur, """
            UPDATE codebase_chunk_index AS cci
            SET
              kmeans384_cluster       = data.cluster::integer,
              kmeans384_distance      = data.d1::real,
              kmeans384_second_id     = data.second_id::integer,
              kmeans384_second_dist   = data.d2::real,
              kmeans384_margin        = data.margin::real,
              kmeans384_model_version = data.model_ver,
              kmeans384_assigned_at   = data.ts::timestamptz
            FROM (VALUES %s) AS data(
              cluster, d1, second_id, d2, margin, model_ver, ts, qdrant_id
            )
            WHERE cci.qdrant_id = data.qdrant_id
        """, batch)
        conn.commit()

    written += end - start
    if VERBOSE or written % 5000 == 0:
        print(f"  Written {written:,}/{N:,}  ({time.time()-t3:.1f}s)")

# ── Also update Qdrant payload with kmeans384_cluster ────────────────────────
print(f"\nUpdating Qdrant payload field 'kmeans384_cluster' ...")
t4 = time.time()
QDRANT_BATCH = 100

for start in range(0, N, QDRANT_BATCH):
    end = min(start + QDRANT_BATCH, N)
    points = []
    for i in range(start, end):
        points.append({
            "id": qdrant_ids[i],
            "payload": {
                "kmeans384_cluster": int(assignments[i]),
                "kmeans384_margin":  float(margin_arr[i]),
                "kmeans384_model":   MODEL_VER,
            }
        })
    resp = requests.post(
        f"{QDRANT_URL}/collections/{COLLECTION}/points/payload?wait=false",
        json={"points": [p["id"] for p in points],
              "payload": {k: v for p in points for k, v in p["payload"].items()}},
        timeout=30,
    )
    # Use batch set per point to avoid key collision
    for pt in points:
        requests.post(
            f"{QDRANT_URL}/collections/{COLLECTION}/points/payload?wait=false",
            json={"points": [pt["id"]], "payload": pt["payload"]},
            timeout=10,
        )

    if VERBOSE and (start // QDRANT_BATCH) % 50 == 0:
        print(f"  Qdrant payload updated {min(end,N):,}/{N:,}")

print(f"Qdrant payload update done in {time.time()-t4:.1f}s")

total_time = time.time() - t0
print()
print("─────────────────────────────────────────")
print("384-dim K-means Clustering complete")
print(f"  Points clustered : {written:,}")
print(f"  k                : {K}")
print(f"  model_version    : {MODEL_VER}")
print(f"  vector_contract  : {VECTOR_CONTRACT}")
print(f"  inertia          : {km.inertia_:.4f}")
print(f"  avg d1           : {d1_arr.mean():.4f}")
print(f"  avg margin       : {margin_arr.mean():.4f}")
print(f"  total time       : {total_time:.1f}s")
print("─────────────────────────────────────────")

conn.close()
