#!/usr/bin/env python3
"""
Phase 89: CUDA K-Means Clustering for Error Embeddings
=======================================================
Called by POST /api/generate-cluster-summaries.

Reads raw_error_embeddings from Postgres, runs GPU-accelerated K-Means,
then prints structured output consumed by the TS route:

  CUDA: Available          (if GPU detected)
  CLUSTER_COORDINATES: ... (JSON array of centroid objects)
  CLUSTER_ASSIGNMENTS: ... (JSON dict: { clusterId: [errorId, ...] })

Usage:
  python scripts/phase89-cuda-clustering.py [--k N] [--max-errors N] [--dry-run]
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error
from collections import defaultdict

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5434/legal_ai_db")
K_DEFAULT    = int(os.getenv("PHASE89_K", "8"))
MAX_ERRORS   = int(os.getenv("PHASE89_MAX_ERRORS", "5000"))
MAX_ITERS    = int(os.getenv("PHASE89_ITERS", "50"))

# ── DB helpers ────────────────────────────────────────────────────────────────

def fetch_embeddings(max_rows: int):
    """Return list of (id, embedding_list) from raw_error_embeddings."""
    try:
        import psycopg2
        import psycopg2.extras
    except ImportError:
        print("[phase89] psycopg2 not installed — using REST fallback", file=sys.stderr)
        return []

    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur  = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        cur.execute(
            """
            SELECT id, embedding
            FROM   raw_error_embeddings
            WHERE  embedding IS NOT NULL
            ORDER  BY created_at DESC
            LIMIT  %s
            """,
            (max_rows,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        result = []
        for row in rows:
            emb = row["embedding"]
            if emb is None:
                continue
            if isinstance(emb, str):
                try:
                    emb = json.loads(emb)
                except Exception:
                    continue
            result.append((str(row["id"]), emb))
        return result
    except Exception as e:
        print(f"[phase89] DB fetch failed: {e}", file=sys.stderr)
        return []

# ── GPU K-Means ───────────────────────────────────────────────────────────────

def kmeans_gpu(embeddings, k: int, max_iters: int):
    """Run K-Means with CUDA if available, CPU fallback otherwise.
    Returns (labels: list[int], centroids: list[list[float]], cuda_used: bool).
    """
    n = len(embeddings)
    if n < k:
        k = max(1, n)

    try:
        import torch

        cuda = torch.cuda.is_available()
        if cuda:
            print("CUDA: Available", flush=True)
            mem = torch.cuda.get_device_properties(0).total_memory // (1024**2)
            print(f"[phase89] GPU: {torch.cuda.get_device_name(0)} ({mem} MB)", file=sys.stderr)
        else:
            print("[phase89] No CUDA — using CPU tensors", file=sys.stderr)

        device = "cuda" if cuda else "cpu"
        t = torch.tensor(embeddings, dtype=torch.float32, device=device)

        # L2-normalise for cosine K-Means
        norms = t.norm(dim=1, keepdim=True).clamp(min=1e-8)
        t = t / norms

        # Initialise centroids with K-Means++ style (random subset)
        perm = torch.randperm(n, device=device)[:k]
        centroids = t[perm].clone()

        labels = torch.zeros(n, dtype=torch.long, device=device)
        for _ in range(max_iters):
            # Assignment step (batch cosine similarity via matmul)
            sims   = torch.mm(t, centroids.T)          # (n, k)
            new_labels = sims.argmax(dim=1)

            if (new_labels == labels).all():
                break
            labels = new_labels

            # Update step
            new_c = torch.zeros_like(centroids)
            for c in range(k):
                mask = labels == c
                if mask.any():
                    new_c[c] = t[mask].mean(0)
                else:
                    new_c[c] = centroids[c]
            centroids = new_c

        labels_list    = labels.cpu().tolist()
        centroids_list = centroids.cpu().tolist()
        return labels_list, centroids_list, cuda

    except ImportError:
        print("[phase89] torch not available — pure-Python fallback", file=sys.stderr)

    # ── Pure-Python fallback ────────────────────────────────────────────────
    import random
    import math

    def dot(a, b):
        return sum(x * y for x, y in zip(a, b))

    def l2(v):
        return math.sqrt(sum(x * x for x in v)) or 1e-8

    def normalize(v):
        m = l2(v)
        return [x / m for x in v]

    normed = [normalize(e) for e in embeddings]
    centroids = [normed[i] for i in random.sample(range(n), k)]
    labels = [0] * n

    for _ in range(max_iters):
        changed = False
        for i, emb in enumerate(normed):
            sims  = [dot(emb, c) for c in centroids]
            best  = sims.index(max(sims))
            if best != labels[i]:
                labels[i] = best
                changed   = True
        if not changed:
            break
        for c in range(k):
            members = [normed[i] for i, l in enumerate(labels) if l == c]
            if members:
                dim = len(members[0])
                centroids[c] = [sum(m[d] for m in members) / len(members) for d in range(dim)]

    return labels, centroids, False

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Phase 89 CUDA K-Means clustering")
    parser.add_argument("--k",          type=int, default=K_DEFAULT,  help="Number of clusters")
    parser.add_argument("--max-errors", type=int, default=MAX_ERRORS, help="Max errors to process")
    parser.add_argument("--iters",      type=int, default=MAX_ITERS,  help="Max K-Means iterations")
    parser.add_argument("--dry-run",    action="store_true",          help="Skip output (test only)")
    args = parser.parse_args()

    print(f"[phase89] Fetching up to {args.max_errors} error embeddings...", file=sys.stderr)
    rows = fetch_embeddings(args.max_errors)

    if not rows:
        print("[phase89] No embeddings found — returning empty clustering", file=sys.stderr)
        print(f"CLUSTER_COORDINATES: []")
        print(f"CLUSTER_ASSIGNMENTS: {{}}")
        return

    ids        = [r[0] for r in rows]
    embeddings = [r[1] for r in rows]
    n          = len(embeddings)
    k          = min(args.k, n)

    print(f"[phase89] Running K-Means: n={n}, k={k}, iters={args.iters}", file=sys.stderr)
    labels, centroids, cuda_used = kmeans_gpu(embeddings, k, args.iters)

    # Build assignments dict: { clusterId: [errorId, ...] }
    assignments: dict = defaultdict(list)
    for idx, label in enumerate(labels):
        assignments[str(label)].append(ids[idx])

    # Build centroid coordinate objects
    coordinates = [
        {"id": c_idx, "centroid": centroid, "memberCount": len(assignments.get(str(c_idx), []))}
        for c_idx, centroid in enumerate(centroids)
    ]

    if args.dry_run:
        actual_k = len(set(labels))
        print(f"[phase89] DRY RUN — {actual_k} clusters from {n} errors (CUDA={'yes' if cuda_used else 'no'})",
              file=sys.stderr)
        return

    print(f"CLUSTER_COORDINATES: {json.dumps(coordinates)}", flush=True)
    print(f"CLUSTER_ASSIGNMENTS: {json.dumps(dict(assignments))}", flush=True)

    actual_k = len(set(labels))
    print(f"[phase89] Done — {actual_k} clusters, {n} errors, CUDA={'yes' if cuda_used else 'no'}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
