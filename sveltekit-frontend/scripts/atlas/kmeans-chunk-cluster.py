#!/usr/bin/env python3
"""
K-means chunk clustering — targets codebase_chunk_index.content_embedding (halfvec(768))

This is the ANALYSIS / OFFLINE model space (768-dim legacy embeddings).
For the production 384-dim routing model see kmeans-chunk-cluster-384.py.

Model naming convention (central function — do not duplicate):
  mbk-spherical-content768-k{K}-v1

Elbow matrix (all three runs must complete before selecting baseline):
  k=64   inertia=23927.1  EVALUATION_CANDIDATE
  k=128  inertia=22457.3  ROUTING_BASELINE (engineering selection, not proven elbow)
  k=256  inertia=21118.5  EVALUATION_CANDIDATE (gain from 128→256 is 5.96%, nearly same as 64→128)

Selection rationale for k=128 as ROUTING_BASELINE:
  - k=256 improves inertia by only 5.96% more vs k=128's 6.14% gain from k=64
  - k=128 halves centroid/routing cardinality relative to k=256
  - Decisive metric is retrieval quality, not inertia alone
  - Evaluate: global ANN recall@20 vs cluster-routed recall@20 before enabling routing

Current active assignment: k=256 (last run).
To activate k=128 as baseline: --apply --k 128 --set-active

Usage:
  python kmeans-chunk-cluster.py --dry-run --k 128
  python kmeans-chunk-cluster.py --apply --k 128 --set-active
  python kmeans-chunk-cluster.py --apply --k 64
  python kmeans-chunk-cluster.py --apply --k 256
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


# ── Canonical model version function (single source of truth) ─────────────────
def make_model_version(
    *,
    source_name: str,
    vector_dim: int,
    k: int,
    version: int = 1,
) -> str:
    return f"mbk-spherical-{source_name}{vector_dim}-k{k}-v{version}"


def make_vector_contract(vector_dim: int) -> str:
    if vector_dim == 768:
        return "legacy-content-768-v1"
    if vector_dim == 384:
        return "canonical-content384-v1"
    return f"content-{vector_dim}-v1"


# ── CLI ──────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Spherical K-means for codebase_chunk_index (768-dim)")
parser.add_argument("--dry-run",        action="store_true", help="Cluster only, no DB writes")
parser.add_argument("--apply",          action="store_true", help="Write results to Postgres")
parser.add_argument("--set-active",     action="store_true",
                    help="Mark this model as the active assignment in atlas_cluster_models")
parser.add_argument("--load-centroids", action="store_true",
                    help="Load stored centroids from atlas_cluster_models instead of re-fitting")
parser.add_argument("--k",       type=int, default=128, help="Number of clusters (default 128)")
parser.add_argument("--batch",   type=int, default=500,  help="Fetch batch size (default 500)")
parser.add_argument("--limit",   type=int, default=0,    help="Max chunks to process (0=all)")
parser.add_argument("--verbose", action="store_true")
args = parser.parse_args()

if not args.dry_run and not args.apply:
    print("Pass --dry-run or --apply", file=sys.stderr)
    sys.exit(1)

K              = args.k
BATCH          = args.batch
LIMIT          = args.limit
VERBOSE        = args.verbose
DIM            = 768
MODEL_VER      = make_model_version(source_name="content", vector_dim=DIM, k=K)
VECTOR_CONTRACT = make_vector_contract(DIM)
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

print("=== K-means Chunk Clustering (768-dim Analysis/Routing Models) ===")
print(f"k={K}  batch={BATCH}  model_ver={MODEL_VER}  contract={VECTOR_CONTRACT}")
print(f"mode={'DRY-RUN' if args.dry_run else 'APPLY'}"
      + ("  set-active" if args.set_active else ""))
print()

# ── Schema migration (idempotent) ─────────────────────────────────────────────
with conn.cursor() as cur:
    cur.execute("""
        ALTER TABLE codebase_chunk_index
          ADD COLUMN IF NOT EXISTS kmeans_cluster       integer,
          ADD COLUMN IF NOT EXISTS kmeans_distance      real,
          ADD COLUMN IF NOT EXISTS second_cluster_id    integer,
          ADD COLUMN IF NOT EXISTS second_distance      real,
          ADD COLUMN IF NOT EXISTS cluster_margin       real,
          ADD COLUMN IF NOT EXISTS kmeans_model_version text,
          ADD COLUMN IF NOT EXISTS kmeans_vector_contract text,
          ADD COLUMN IF NOT EXISTS kmeans_assigned_at   timestamptz
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_cci_kmeans_cluster
          ON codebase_chunk_index (kmeans_cluster)
          WHERE kmeans_cluster IS NOT NULL
    """)
    # atlas_cluster_models — add metadata columns if missing
    cur.execute("""
        CREATE TABLE IF NOT EXISTS atlas_cluster_models (
          id                    serial PRIMARY KEY,
          model_version         text NOT NULL UNIQUE,
          k                     integer NOT NULL,
          dim                   integer NOT NULL,
          n_chunks              integer NOT NULL,
          centroids             jsonb NOT NULL,
          inertia               real,
          language_stats        jsonb,
          created_at            timestamptz NOT NULL DEFAULT NOW(),
          metadata              jsonb NOT NULL DEFAULT '{}',
          source_column         text,
          source_vector_dimension integer,
          source_embedding_model text,
          normalization         text,
          algorithm             text,
          random_seed           integer,
          manifest_hash         text,
          vector_contract       text,
          model_role            text,
          is_assignment_active  boolean NOT NULL DEFAULT false
        )
    """)
    cur.execute("""
        ALTER TABLE atlas_cluster_models
          ADD COLUMN IF NOT EXISTS vector_contract       text,
          ADD COLUMN IF NOT EXISTS model_role            text,
          ADD COLUMN IF NOT EXISTS is_assignment_active  boolean NOT NULL DEFAULT false
    """)
    conn.commit()

print("Schema ready ✓")

# ── Load embeddings (OFFSET pagination) ───────────────────────────────────────
print(f"Loading embeddings from codebase_chunk_index ...")

with conn.cursor() as cur:
    cur.execute("SELECT count(*) FROM codebase_chunk_index WHERE content_embedding IS NOT NULL")
    total_eligible = cur.fetchone()[0]

to_process = min(total_eligible, LIMIT) if LIMIT else total_eligible
print(f"Eligible : {total_eligible:,}")
print(f"Will use : {to_process:,}")
print()

ids        = []
embeddings = []
languages  = []

fetched = 0
offset  = 0
t0      = time.time()

while fetched < to_process:
    batch_size = min(BATCH, to_process - fetched)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, language, content_embedding::text
            FROM codebase_chunk_index
            WHERE content_embedding IS NOT NULL
            ORDER BY id
            LIMIT %s OFFSET %s
        """, (batch_size, offset))
        rows = cur.fetchall()

    if not rows:
        break

    for row_id, lang, emb_text in rows:
        vec = np.fromstring(emb_text.strip("[]"), dtype=np.float32, sep=",")
        assert len(vec) == DIM, f"Expected {DIM}-dim vector, got {len(vec)}"
        ids.append(row_id)
        embeddings.append(vec)
        languages.append(lang or "unknown")

    fetched += len(rows)
    offset  += len(rows)
    if VERBOSE or fetched % 5000 == 0:
        elapsed = time.time() - t0
        print(f"  Loaded {fetched:,}/{to_process:,}  ({elapsed:.1f}s)")

print(f"Loaded {len(embeddings):,} embeddings in {time.time()-t0:.1f}s")

if len(embeddings) == 0:
    print("No embeddings found — exiting")
    sys.exit(0)

# ── L2-normalize (spherical K-means) ─────────────────────────────────────────
X = np.vstack(embeddings)   # (N, DIM)
norms = np.linalg.norm(X, axis=1, keepdims=True)
norms = np.where(norms < EPS, 1.0, norms)
X_norm = X / norms
assert X_norm.shape[1] == DIM

print(f"Normalized to unit sphere  shape={X_norm.shape}  dtype={X_norm.dtype}")
print()

# ── MiniBatchKMeans or load stored centroids ──────────────────────────────────
from sklearn.cluster import MiniBatchKMeans
from sklearn.preprocessing import normalize

if args.load_centroids:
    print(f"Loading stored centroids from atlas_cluster_models (k={K}) ...")
    t1 = time.time()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT centroids, inertia FROM atlas_cluster_models WHERE model_version = %s",
            (MODEL_VER,)
        )
        row = cur.fetchone()
    if row is None:
        print(f"ERROR: No stored centroids for {MODEL_VER}. Run without --load-centroids to fit.",
              file=sys.stderr)
        conn.close()
        sys.exit(1)
    centroid_data, stored_inertia = row
    if isinstance(centroid_data, str):
        centroid_data = json.loads(centroid_data)
    centroids = np.array(centroid_data, dtype=np.float32)
    centroids = normalize(centroids, norm="l2")
    if centroids.shape != (K, DIM):
        print(f"ERROR: Stored centroids shape {centroids.shape} != expected ({K}, {DIM})",
              file=sys.stderr)
        conn.close()
        sys.exit(1)
    print(f"Loaded {K} centroids in {time.time()-t1:.1f}s  stored_inertia={stored_inertia:.4f}")
    # Fake km object for summary output
    class _FakeKM:
        inertia_ = stored_inertia
    km = _FakeKM()
else:
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
    centroids = normalize(km.cluster_centers_, norm="l2")  # (K, DIM)

# ── Top-2 distances ───────────────────────────────────────────────────────────
print("Computing top-2 centroid distances ...")
t2 = time.time()

SCORE_CHUNK = 5000
N = len(ids)
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

    if VERBOSE and (start // SCORE_CHUNK) % 10 == 0:
        print(f"  Scored {end:,}/{N:,}")

print(f"Scoring done in {time.time()-t2:.1f}s")
print(f"  avg distance={d1_arr.mean():.4f}  avg margin={margin_arr.mean():.4f}")

# ── Pre-commit validation ─────────────────────────────────────────────────────
if assignments.shape[0] != N:
    raise RuntimeError(f"Assignment count mismatch: {assignments.shape[0]} != {N}")
if int(assignments.min()) < 0:
    raise RuntimeError(f"Negative cluster assignment: min={assignments.min()}")
if int(assignments.max()) >= K:
    raise RuntimeError(f"Cluster ID exceeds k={K}: max={assignments.max()}")

print(f"Pre-commit validation passed: {N:,} assignments in [0, {K-1}]")

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
    print(f"  cluster {c:3d}: {cluster_sizes[c]:5d} chunks  dominant_lang={top_lang}")

empty = int((cluster_sizes == 0).sum())
if empty > 0:
    print(f"  WARNING: {empty} empty cluster(s)")

# ── DRY-RUN exit ──────────────────────────────────────────────────────────────
if args.dry_run:
    print()
    print("[DRY-RUN] Sample (first 5 chunks):")
    for i in range(min(5, N)):
        print(f"  id={str(ids[i])[:8]}  cluster={assignments[i]:3d}  d1={d1_arr[i]:.4f}"
              f"  d2={d2_arr[i]:.4f}  margin={margin_arr[i]:.4f}")
    print()
    print(f"Model version  : {MODEL_VER}")
    print(f"Vector contract: {VECTOR_CONTRACT}")
    print("DRY-RUN complete — no writes.")
    conn.close()
    sys.exit(0)

# ── Write centroid model ───────────────────────────────────────────────────────
print()
print(f"Writing centroid model to atlas_cluster_models ...")

centroid_list = centroids.tolist()
centroid_json = json.dumps(centroid_list)
model_role    = "ROUTING_BASELINE" if K == 128 else "EVALUATION_CANDIDATE"

with conn.cursor() as cur:
    cur.execute("""
        INSERT INTO atlas_cluster_models
          (model_version, k, dim, n_chunks, centroids, inertia, language_stats,
           source_column, source_vector_dimension, source_embedding_model,
           normalization, algorithm, random_seed,
           vector_contract, model_role, is_assignment_active)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s::jsonb,
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s)
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
          vector_contract         = EXCLUDED.vector_contract,
          model_role              = EXCLUDED.model_role,
          created_at              = NOW()
    """, (MODEL_VER, K, DIM, N, centroid_json,
          float(km.inertia_), json.dumps(lang_stats),
          'codebase_chunk_index.content_embedding', DIM, 'embeddinggemma-300m',
          'l2', 'minibatch-spherical-kmeans', 42,
          VECTOR_CONTRACT, model_role, False))
    conn.commit()

print("Centroid model saved ✓")

# ── Write per-chunk assignments (atomic batch) ────────────────────────────────
print(f"Writing {N:,} chunk assignments ...")
t3 = time.time()

WRITE_BATCH = 500
written     = 0
now_ts      = datetime.now(timezone.utc).isoformat()

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
            VECTOR_CONTRACT,
            now_ts,
            ids[i],
        )
        for i in range(start, end)
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            UPDATE codebase_chunk_index AS cci
            SET
              kmeans_cluster         = data.kmeans_cluster::integer,
              kmeans_distance        = data.kmeans_distance::real,
              second_cluster_id      = data.second_cluster_id::integer,
              second_distance        = data.second_distance::real,
              cluster_margin         = data.cluster_margin::real,
              kmeans_model_version   = data.kmeans_model_version,
              kmeans_vector_contract = data.kmeans_vector_contract,
              kmeans_assigned_at     = data.kmeans_assigned_at::timestamptz
            FROM (VALUES %s) AS data(
              kmeans_cluster, kmeans_distance, second_cluster_id,
              second_distance, cluster_margin, kmeans_model_version,
              kmeans_vector_contract, kmeans_assigned_at, id
            )
            WHERE cci.id = data.id::uuid
        """, batch)
        conn.commit()

    written += end - start
    if VERBOSE or written % 5000 == 0:
        print(f"  Written {written:,}/{N:,}  ({time.time()-t3:.1f}s)")

# ── Mark active assignment in registry ────────────────────────────────────────
if args.set_active:
    with conn.cursor() as cur:
        # Clear all active flags for this vector space
        cur.execute("""
            UPDATE atlas_cluster_models
            SET is_assignment_active = false
            WHERE vector_contract = %s
        """, (VECTOR_CONTRACT,))
        # Set this model as active
        cur.execute("""
            UPDATE atlas_cluster_models
            SET is_assignment_active = true
            WHERE model_version = %s
        """, (MODEL_VER,))
        conn.commit()
    print(f"  Marked {MODEL_VER} as active assignment ✓")

total_time = time.time() - t0
print()
print("─────────────────────────────────────────")
print("K-means Chunk Clustering complete")
print(f"  Chunks clustered : {written:,}")
print(f"  k                : {K}")
print(f"  model_version    : {MODEL_VER}")
print(f"  vector_contract  : {VECTOR_CONTRACT}")
print(f"  inertia          : {km.inertia_:.4f}")
print(f"  avg d1           : {d1_arr.mean():.4f}")
print(f"  avg margin       : {margin_arr.mean():.4f}")
print(f"  total time       : {total_time:.1f}s")
print("─────────────────────────────────────────")

conn.close()
