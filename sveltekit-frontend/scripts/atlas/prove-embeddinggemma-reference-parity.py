#!/usr/bin/env python3
"""EG-GGUF-4 read-only local SentenceTransformers ↔ llama.cpp parity proof.

No downloads are permitted. Hugging Face/Transformers offline modes are forced
before importing SentenceTransformers. Both executors receive the exact same
already-formatted EmbeddingGemma inputs; no prompt_name is applied by the
reference model, preventing accidental double prompting.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import urllib.request
from typing import Any

# Force cache/local behavior even if a caller has network access.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import numpy as np
from sentence_transformers import SentenceTransformer

NATIVE_DIM = 768
PROMPT_REVISION = "embeddinggemma-prompt-v1"


def retrieval_query(text: str) -> str:
    return f"task: search result | query: {text.strip()}"


def code_query(text: str) -> str:
    return f"task: code retrieval | query: {text.strip()}"


def classification_query(text: str) -> str:
    return f"task: classification | query: {text.strip()}"


def document(text: str, title: str = "none") -> str:
    return f"title: {(title.strip() or 'none')} | text: {text.strip()}"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def float32_digest(values: np.ndarray) -> str:
    return hashlib.sha256(np.asarray(values, dtype="<f4").tobytes(order="C")).hexdigest()


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom > 0 else float("nan")


def http_embeddings(server_url: str, texts: list[str]) -> np.ndarray:
    body = json.dumps({"input": texts}).encode("utf-8")
    request = urllib.request.Request(
        f"{server_url.rstrip('/')}/v1/embeddings",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        parsed = json.loads(response.read().decode("utf-8"))
    rows = parsed.get("data") or []
    if len(rows) != len(texts):
        raise RuntimeError(f"LLAMA_CPP_EMBEDDING_COUNT_MISMATCH:{len(rows)}:{len(texts)}")
    vectors = np.asarray([row.get("embedding") for row in rows], dtype=np.float32)
    if vectors.shape != (len(texts), NATIVE_DIM):
        raise RuntimeError(f"LLAMA_CPP_NATIVE_SHAPE_MISMATCH:{vectors.shape}")
    if not np.isfinite(vectors).all():
        raise RuntimeError("LLAMA_CPP_NONFINITE_VECTOR")
    return vectors


def top_k(scores: np.ndarray, k: int) -> list[int]:
    return np.argsort(-scores, kind="stable")[:k].astype(int).tolist()


def overlap(a: list[int], b: list[int]) -> float:
    if not a or not b:
        return 0.0
    return len(set(a) & set(b)) / min(len(a), len(b))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-dir", type=Path, required=True)
    parser.add_argument("--server-url", default="http://127.0.0.1:8081")
    parser.add_argument("--report", type=Path, default=Path("docs/reports/embeddinggemma-reference-parity.json"))
    parser.add_argument("--min-vector-cosine", type=float, default=0.995)
    parser.add_argument("--min-topk-overlap", type=float, default=0.80)
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    model_dir = args.model_dir.resolve()
    if not model_dir.is_dir():
        raise FileNotFoundError(f"LOCAL_REFERENCE_MODEL_DIR_NOT_FOUND:{model_dir}")

    model_file = model_dir / "model.safetensors"
    model_file_sha256 = sha256_file(model_file) if model_file.is_file() else None

    model = SentenceTransformer(
        str(model_dir),
        device=args.device,
        local_files_only=True,
        trust_remote_code=False,
    )

    direct_inputs = [
        retrieval_query("How does Parent Atlas resolve canonical packet identity?"),
        code_query("Find GraphifyStructuralMaterializer source revision logic"),
        classification_query("debug a stale Qdrant projection lineage failure"),
        document("Graphify structural evidence preserves source spans and revision lineage.", "Parent Atlas structural evidence"),
    ]
    reference = np.asarray(model.encode(direct_inputs, normalize_embeddings=True, convert_to_numpy=True), dtype=np.float32)
    challenger = http_embeddings(args.server_url, direct_inputs)
    if reference.shape != challenger.shape or reference.shape[1] != NATIVE_DIM:
        raise RuntimeError(f"REFERENCE_SHAPE_MISMATCH:{reference.shape}:{challenger.shape}")

    direct_rows: list[dict[str, Any]] = []
    for index, text in enumerate(direct_inputs):
        score = cosine(reference[index], challenger[index])
        direct_rows.append({
            "index": index,
            "formattedTextSha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "cosine": score,
            "referenceNorm": float(np.linalg.norm(reference[index])),
            "challengerNorm": float(np.linalg.norm(challenger[index])),
            "referenceDigest": float32_digest(reference[index]),
            "challengerDigest": float32_digest(challenger[index]),
        })

    queries = [
        code_query("find graphify source revision resolver"),
        retrieval_query("postgres qdrant projection lineage"),
        code_query("query router classification tensor exporter"),
    ]
    documents = [
        document("Graphify resolves structural syntax and source provenance through the 8095 Tree-sitter evidence path.", "Graphify"),
        document("PostgreSQL owns canonical packet identity while Qdrant is a rebuildable semantic projection.", "Projection lineage"),
        document("The query router combines classification_mrl_128 with deterministic query features.", "Query routing"),
        document("Valkey stores ephemeral hot state and must not become canonical evidence authority.", "Cache policy"),
        document("cuVS brute force is an exact semantic executor and CAGRA is an approximate challenger.", "GPU search"),
        document("Tombstones observe a deleted source but cannot directly delete canonical storage.", "Lifecycle"),
        document("ts-morph contributes TypeScript compiler semantic facts after structural span grounding.", "TypeScript semantics"),
        document("BM25, miniCOIL, and SPLADE are sparse executors and do not earn separate logical votes.", "Sparse retrieval"),
    ]

    ref_q = np.asarray(model.encode(queries, normalize_embeddings=True, convert_to_numpy=True), dtype=np.float32)
    ref_d = np.asarray(model.encode(documents, normalize_embeddings=True, convert_to_numpy=True), dtype=np.float32)
    q8_q = http_embeddings(args.server_url, queries)
    q8_d = http_embeddings(args.server_url, documents)

    ref_scores = ref_q @ ref_d.T
    q8_scores = q8_q @ q8_d.T
    ranking_rows = []
    for index in range(len(queries)):
        ref_rank = top_k(ref_scores[index], args.top_k)
        q8_rank = top_k(q8_scores[index], args.top_k)
        ranking_rows.append({
            "queryIndex": index,
            "referenceTopK": ref_rank,
            "challengerTopK": q8_rank,
            "topKOverlap": overlap(ref_rank, q8_rank),
        })

    min_direct_cosine = min(row["cosine"] for row in direct_rows)
    mean_direct_cosine = sum(row["cosine"] for row in direct_rows) / len(direct_rows)
    min_topk_overlap = min(row["topKOverlap"] for row in ranking_rows)
    mean_topk_overlap = sum(row["topKOverlap"] for row in ranking_rows) / len(ranking_rows)
    blockers = []
    if min_direct_cosine < args.min_vector_cosine:
        blockers.append(f"VECTOR_COSINE_BELOW_THRESHOLD:{min_direct_cosine}")
    if min_topk_overlap < args.min_topk_overlap:
        blockers.append(f"TOPK_OVERLAP_BELOW_THRESHOLD:{min_topk_overlap}")

    report = {
        "schema": "atlas.embeddinggemma-reference-parity-receipt.v1",
        "modelId": "google/embeddinggemma-300m",
        "referenceExecutor": "sentence-transformers",
        "referenceModelDir": str(model_dir),
        "referenceModelSafetensorsSha256": model_file_sha256,
        "referenceLocalFilesOnly": True,
        "referenceTrustRemoteCode": False,
        "challengerExecutor": "llama.cpp",
        "challengerServerUrl": args.server_url,
        "nativeDimension": NATIVE_DIM,
        "promptRevision": PROMPT_REVISION,
        "sameFormattedInputCompared": True,
        "floatEqualityRequired": False,
        "directVectorParity": direct_rows,
        "rankingParity": ranking_rows,
        "minDirectCosine": min_direct_cosine,
        "meanDirectCosine": mean_direct_cosine,
        "minTopKOverlap": min_topk_overlap,
        "meanTopKOverlap": mean_topk_overlap,
        "thresholds": {
            "minVectorCosine": args.min_vector_cosine,
            "minTopKOverlap": args.min_topk_overlap,
            "topK": args.top_k,
        },
        "downloadsPerformed": False,
        "qdrantWrites": False,
        "postgresWrites": False,
        "valkeyWrites": False,
        "canonicalWritesAllowed": False,
        "canonicalRepresentationChanged": False,
        "status": "PROVEN_REFERENCE_PARITY_READ_ONLY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "producerRevision": "prove-embeddinggemma-reference-parity.v1",
    }

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "blockers": blockers, "report": str(args.report)}, indent=2))
    return 0 if not blockers else 2


if __name__ == "__main__":
    raise SystemExit(main())
