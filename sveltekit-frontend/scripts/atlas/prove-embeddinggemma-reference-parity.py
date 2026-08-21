#!/usr/bin/env python3
"""Compare local SentenceTransformers FP EmbeddingGemma with llama.cpp Q8.

Offline only: local_files_only=True and HF/Transformers offline flags are forced.
The same already-formatted strings are sent to both executors. This proves
cosine/neighborhood parity, not float equality, and performs no canonical writes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")

import numpy as np
import requests
from sentence_transformers import SentenceTransformer

PROMPT_REVISION = "embeddinggemma-prompt-v1"
NATIVE_DIM = 768


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def l2(v: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(v))
    if not np.isfinite(n) or n <= 0:
        raise ValueError("invalid vector norm")
    return (v / n).astype(np.float32, copy=False)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(l2(a), l2(b)))


def q8_embed(server_url: str, texts: list[str]) -> np.ndarray:
    response = requests.post(
        f"{server_url.rstrip('/')}/v1/embeddings",
        json={"input": texts}, timeout=120,
    )
    response.raise_for_status()
    rows = response.json().get("data", [])
    vectors = np.asarray([row["embedding"] for row in rows], dtype=np.float32)
    if vectors.shape != (len(texts), NATIVE_DIM):
        raise ValueError(f"Q8 shape mismatch: {vectors.shape}")
    return vectors


def topk(query: np.ndarray, docs: np.ndarray, k: int) -> list[int]:
    q = l2(query)
    normalized = np.asarray([l2(row) for row in docs], dtype=np.float32)
    scores = normalized @ q
    return np.argsort(-scores, kind="stable")[:k].tolist()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--server-url", default="http://127.0.0.1:8081")
    parser.add_argument("--output", type=Path, default=Path("docs/reports/embeddinggemma-reference-parity.json"))
    parser.add_argument("--min-cosine", type=float, default=0.995)
    parser.add_argument("--min-topk-overlap", type=float, default=0.80)
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    if not args.model_dir.exists():
        raise FileNotFoundError(args.model_dir)

    model = SentenceTransformer(
        str(args.model_dir),
        local_files_only=True,
        trust_remote_code=False,
        device="cpu",
    )

    prompts = [
        "task: search result | query: How does Parent Atlas resolve canonical packet identity?",
        "task: code retrieval | query: Find GraphifyStructuralMaterializer source revision logic",
        "task: classification | query: debug a stale Qdrant projection lineage failure",
        "title: Parent Atlas structural evidence | text: Graphify structural evidence preserves source spans and revision lineage.",
    ]
    fp = np.asarray(model.encode(prompts, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False), dtype=np.float32)
    q8 = q8_embed(args.server_url, prompts)
    if fp.shape != (len(prompts), NATIVE_DIM):
        raise ValueError(f"reference shape mismatch: {fp.shape}")
    pair_cosines = [cosine(fp[i], q8[i]) for i in range(len(prompts))]

    queries = [
        "task: code retrieval | query: find structural source revision ownership",
        "task: search result | query: persistent semantic projection lineage",
        "task: search result | query: graph pagerank evidence routing",
    ]
    documents = [
        "title: source revision | text: Git and source-version receipts establish repository revision provenance.",
        "title: structural materializer | text: Tree-sitter extracts source spans, syntax status, and structural evidence.",
        "title: Qdrant projection | text: Qdrant stores persistent semantic retrieval projections and payload filters.",
        "title: Postgres owner | text: PostgreSQL owns canonical packet identity, lineage, and durable receipts.",
        "title: graph ranking | text: PageRank and personalized PageRank produce graph features for ranking.",
        "title: cache | text: Valkey stores ephemeral hot candidate and routing cache state.",
        "title: sparse | text: BM25 and sparse retrieval provide lexical evidence for exact terminology.",
        "title: GPU | text: cuVS brute force is an exact semantic oracle while CAGRA is an ANN executor.",
    ]
    fp_q = np.asarray(model.encode(queries, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False), dtype=np.float32)
    fp_d = np.asarray(model.encode(documents, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False), dtype=np.float32)
    q8_q = q8_embed(args.server_url, queries)
    q8_d = q8_embed(args.server_url, documents)

    overlaps = []
    rankings = []
    for i in range(len(queries)):
        a = topk(fp_q[i], fp_d, args.top_k)
        b = topk(q8_q[i], q8_d, args.top_k)
        overlap = len(set(a) & set(b)) / args.top_k
        overlaps.append(overlap)
        rankings.append({"queryIndex": i, "referenceTopK": a, "q8TopK": b, "overlap": overlap})

    blockers = []
    min_cosine = min(pair_cosines)
    mean_overlap = float(np.mean(overlaps))
    if min_cosine < args.min_cosine:
        blockers.append(f"NATIVE_COSINE_BELOW_THRESHOLD:{min_cosine}")
    if mean_overlap < args.min_topk_overlap:
        blockers.append(f"TOPK_OVERLAP_BELOW_THRESHOLD:{mean_overlap}")

    receipt: dict[str, Any] = {
        "schema": "atlas.embeddinggemma-reference-parity-receipt.v1",
        "status": "PROVEN_REFERENCE_PARITY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "modelDirectory": str(args.model_dir),
        "referenceExecutor": "sentence-transformers-local",
        "referenceModelLocalOnly": True,
        "q8Executor": "llama.cpp",
        "serverUrl": args.server_url,
        "nativeDimension": NATIVE_DIM,
        "promptRevision": PROMPT_REVISION,
        "formattedPromptDigests": [sha256_text(text) for text in prompts],
        "sameFormattedInput": True,
        "nativeVectorCosines": pair_cosines,
        "nativeVectorCosineMin": min_cosine,
        "topK": args.top_k,
        "rankings": rankings,
        "meanTopKOverlap": mean_overlap,
        "thresholds": {"minCosine": args.min_cosine, "minTopKOverlap": args.min_topk_overlap},
        "floatEqualityRequired": False,
        "downloadsAllowed": False,
        "qdrantWrites": False,
        "postgresWrites": False,
        "valkeyWrites": False,
        "canonicalWritesAllowed": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0 if not blockers else 2


if __name__ == "__main__":
    raise SystemExit(main())
