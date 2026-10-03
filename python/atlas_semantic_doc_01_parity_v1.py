"""SEMANTIC-DOC-01 parity proof (READ ONLY): EmbeddingGemma GGUF executor on :8081 vs the local full-precision reference (SentenceTransformers, CPU).

Same exact input strings on both sides (document prompt contract `title: {title} | text: {text}`), a stratified sample of admitted canonical chunks read from
Postgres with SELECT only. Writes only docs/reports/semantic-doc-01-embedding-parity-v1.json. No Postgres/Qdrant/Valkey writes; not Ollama.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8081"
SAMPLE = 48
QUERIES = [
    "hnsw iterative scan strict order", "postgres 18 asynchronous io method worker", "uuidv7 time ordered uuid function", "drizzle-kit generate migration command",
    "svelte 5 derived state rune", "bitmap heap scan and bitmap index scan", "pgvector halfvec cosine operator class", "sveltekit load function server data",
    "bits ui dialog child snippet", "scan_mem_multiplier max_scan_tuples",
]
THRESHOLDS = {"mean_cosine_min": 0.98, "min_cosine_min": 0.95, "top1_agreement_min": 0.8}


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def gguf_embed(texts: list[str]) -> np.ndarray:
    out = []
    for i in range(0, len(texts), 8):
        req = urllib.request.Request(f"{BASE}/v1/embeddings", data=json.dumps({"input": texts[i:i + 8], "model": "embeddinggemma"}).encode(), headers={"content-type": "application/json"})
        data = json.load(urllib.request.urlopen(req, timeout=120))["data"]
        out.extend(d["embedding"] for d in sorted(data, key=lambda d: d["index"]))
    return np.asarray(out, dtype=np.float64)


def main() -> int:
    rows = subprocess.run(
        ["docker", "exec", "legal-ai-postgres", "psql", "-U", "legal_admin", "-d", "legal_ai_db", "-tAc",
         "SELECT json_agg(r) FROM (SELECT c.chunk_id, p.title, c.text FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id ORDER BY c.chunk_id) r"],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout
    chunks = json.loads(rows)
    step = max(1, len(chunks) // SAMPLE)
    picked = [c for c in chunks[::step][:SAMPLE] if len(c["text"]) < 2800]
    docs = [f"title: {c['title'] or 'none'} | text: {c['text']}" for c in picked]
    queries = [f"task: search result | query: {q}" for q in QUERIES]

    from sentence_transformers import SentenceTransformer  # local reference, CPU only (GPU is shared with Ornith)

    ref_dir = ROOT / "models" / "embeddinggemma_300m"
    model = SentenceTransformer(str(ref_dir), device="cpu")
    ref_docs = model.encode(docs, normalize_embeddings=True, convert_to_numpy=True, batch_size=4).astype(np.float64)
    ref_q = model.encode(queries, normalize_embeddings=True, convert_to_numpy=True).astype(np.float64)
    ex_docs = gguf_embed(docs)
    ex_q = gguf_embed(queries)
    ex_docs /= np.linalg.norm(ex_docs, axis=1, keepdims=True)
    ex_q /= np.linalg.norm(ex_q, axis=1, keepdims=True)

    cos_docs = np.sum(ref_docs * ex_docs, axis=1)
    cos_q = np.sum(ref_q * ex_q, axis=1)
    ref_rank = np.argsort(-(ref_q @ ref_docs.T), axis=1)
    ex_rank = np.argsort(-(ex_q @ ex_docs.T), axis=1)
    top1 = float(np.mean(ref_rank[:, 0] == ex_rank[:, 0]))
    top5 = float(np.mean([len(set(ref_rank[i, :5]) & set(ex_rank[i, :5])) / 5 for i in range(len(queries))]))
    all_cos = np.concatenate([cos_docs, cos_q])

    gguf = ROOT / "models" / "embeddinggemma-300m-q8_0.gguf"
    safet = ref_dir / "model.safetensors"
    checks = {
        "mean_cosine": float(all_cos.mean()), "min_cosine": float(all_cos.min()), "top1_agreement": top1, "top5_overlap": top5,
    }
    ok = checks["mean_cosine"] >= THRESHOLDS["mean_cosine_min"] and checks["min_cosine"] >= THRESHOLDS["min_cosine_min"] and top1 >= THRESHOLDS["top1_agreement_min"]
    receipt = {
        "schema": "atlas.semantic-doc-01-embedding-parity.v1", "generatedAt": datetime.now(timezone.utc).isoformat(), "gate": "SEMANTIC-DOC-01 parity (EG-GGUF-4 equivalent)",
        "executor": {"url": BASE, "kind": "llama-server EmbeddingGemma GGUF Q8_0, pooling mean, ctx 1024 (NOT Ollama)", "artifact": str(gguf.relative_to(ROOT)), "artifactSha256": sha256_file(gguf),
                     "artifactMatchesPublishedGgmlOrg": False, "note": "checksum differs from the cited ggml-org release, so parity is measured here rather than inherited"},
        "reference": {"kind": "SentenceTransformers full-precision, CPU", "model": "models/embeddinggemma_300m (google/embeddinggemma-300m)", "safetensorsSha256": sha256_file(safet)},
        "promptContract": {"document": "title: {page title | none} | text: {chunk text}", "query": "task: search result | query: {text}", "identicalStringsOnBothSides": True},
        "sample": {"documents": len(docs), "queries": len(queries), "stratifiedEvery": step},
        "measured": checks, "thresholds": THRESHOLDS,
        "perDocumentCosine": {"min": float(cos_docs.min()), "mean": float(cos_docs.mean())}, "perQueryCosine": {"min": float(cos_q.min()), "mean": float(cos_q.mean())},
        "result": "EMBEDDING_PARITY_PROVEN" if ok else "EMBEDDING_PARITY_NOT_PROVEN",
        "writes": {"postgres": 0, "qdrant": 0, "valkey": 0, "neo4j": 0, "graphify": 0},
    }
    (ROOT / "docs" / "reports" / "semantic-doc-01-embedding-parity-v1.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": receipt["result"], **checks, "docs": len(docs)}, indent=1))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
