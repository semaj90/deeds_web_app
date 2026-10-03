#!/usr/bin/env python
"""EMBEDDINGGEMMA_768_PARITY_01 (read-only): compare a live embedder endpoint against the local sentence-transformers
reference (models/embeddinggemma_300m). No database, Qdrant or Valkey access. Emits a receipt; PROVEN only if all gates pass.
Usage: python python/atlas_embeddinggemma_parity_v1.py [--endpoint http://127.0.0.1:8097/embed] [--out docs/reports/embeddinggemma-parity-v1.json]
"""
import argparse, hashlib, json, math, os, sys, urllib.request
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
FIXTURE = [
    "Validates the session token and returns the authenticated user record for the request.",
    "Builds a deterministic candidate ordinal map from admitted source revisions.",
    "def rerank(candidates, query): return sorted(candidates, key=lambda c: -c.score)",
    "CUDA kernel that packs residency sort keys from packet glyph fields.",
    "Postgres full-text search over chunk summaries with trigram fallback.",
    "The quick brown fox jumps over the lazy dog.",
    "SELECT packet_key, source_ref FROM atlas_packets WHERE feature_id = $1",
    "Louvain community detection parity between NetworkX and cuGraph.",
    "Handles HTTP errors and retries with exponential backoff.",
    "Legal citation extraction from court opinions.",
    "Svelte 5 rune based state store for chat sessions.",
    "Invalidate Redis cache keys after the Postgres write succeeds.",
]
GATES = {"cosine_min": 0.999, "cosine_mean": 0.9995, "topk_overlap_min": 1.0, "norm_tol": 1e-3}


def call_endpoint(url, texts):
    req = urllib.request.Request(url, data=json.dumps({"texts": texts}).encode(), headers={"content-type": "application/json"})
    return np.array(json.load(urllib.request.urlopen(req, timeout=120))["embeddings"], dtype=np.float64)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default="http://127.0.0.1:8097/embed")
    ap.add_argument("--reference", default=os.path.join(ROOT, "models", "embeddinggemma_300m"))
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "reports", "embeddinggemma-parity-v1.json"))
    a = ap.parse_args()

    from sentence_transformers import SentenceTransformer
    ref_model = SentenceTransformer(a.reference, device="cpu")
    # Document-style input: no task prefix on either side, so the comparison isolates the executor.
    ref = np.array(ref_model.encode(FIXTURE, normalize_embeddings=True), dtype=np.float64)
    got = call_endpoint(a.endpoint, FIXTURE)
    again = call_endpoint(a.endpoint, FIXTURE)

    dims = {"reference": int(ref.shape[1]), "endpoint": int(got.shape[1])}
    finite = bool(np.isfinite(got).all())
    norms = np.linalg.norm(got, axis=1)
    got_n = got / np.clip(norms[:, None], 1e-12, None)
    cos = np.sum(got_n * ref, axis=1)
    # top-k self-retrieval overlap: for each item, ranking of the other items must agree
    k = 5
    sim_r, sim_g = ref @ ref.T, got_n @ got_n.T
    overlaps = []
    for i in range(len(FIXTURE)):
        r = [j for j in np.argsort(-sim_r[i]) if j != i][:k]
        g = [j for j in np.argsort(-sim_g[i]) if j != i][:k]
        overlaps.append(len(set(r) & set(g)) / k)
    checks = {
        "dimension_768": dims["endpoint"] == 768 and dims["reference"] == 768,
        "finite": finite,
        "l2_normalized": bool(np.all(np.abs(norms - 1.0) <= GATES["norm_tol"])),
        "deterministic": bool(np.array_equal(got, again)),
        "cosine_min_ok": bool(cos.min() >= GATES["cosine_min"]),
        "cosine_mean_ok": bool(cos.mean() >= GATES["cosine_mean"]),
        "topk_overlap_ok": bool(min(overlaps) >= GATES["topk_overlap_min"]),
    }
    receipt = {
        "schema": "atlas.embeddinggemma-parity-receipt.v1",
        "status": "EMBEDDINGGEMMA_768_PARITY_PROVEN" if all(checks.values()) else "PARITY_NOT_PROVEN",
        "endpoint": a.endpoint, "referencePath": os.path.relpath(a.reference, ROOT).replace("\\", "/"),
        "fixtureSha256": "sha256:" + hashlib.sha256("\n".join(FIXTURE).encode()).hexdigest(), "fixtureCount": len(FIXTURE),
        "dims": dims, "gates": GATES, "checks": checks,
        "cosine": {"min": float(cos.min()), "mean": float(cos.mean()), "perItem": [float(x) for x in cos]},
        "topkOverlap": {"k": k, "min": float(min(overlaps)), "mean": float(np.mean(overlaps))},
        "normRange": [float(norms.min()), float(norms.max())],
        "databaseWrites": 0, "qdrantWrites": 0, "valkeyWrites": 0,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf8") as f:
        json.dump(receipt, f, indent=2)
    print(json.dumps({k: receipt[k] for k in ("status", "dims", "checks", "cosine", "topkOverlap")}, indent=2)[:1800])
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
