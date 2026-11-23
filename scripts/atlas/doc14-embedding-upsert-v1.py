#!/usr/bin/env python3
"""DOC-14 fail-closed embedding projection & CandidateFeatureMatrix dry-run/upsert helper.

Supports:
  - `--runtime ollama` (default `:11434/api/embed`, e.g. `embeddinggemma2:q8_0`)
  - `--runtime openai` (`:8081/v1/embeddings`, llama.cpp OpenAI-compatible)
  - Read-only by default (zero Qdrant/Postgres writes unless `--commit` + pinned checksums are provided)
  - Emits a revision-pinned `[K, 768]` float32 matrix receipt per AGENTS.md § 8.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
import urllib.error
import urllib.request
import uuid
from typing import Any

import numpy as np

HEX64 = re.compile(r"^[0-9a-f]{64}$")
NAMESPACE = uuid.UUID("ad771e12-e3e5-5d59-9b90-ad181be53f56")
REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_GGUF = REPO_ROOT / "models" / "embeddinggemma2" / "unsloth-q8" / "embeddinggemma-2-Q8_0.gguf"


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha_file(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def request_json(base: str, path: str, *, method: str = "GET", body: Any = None, timeout: float = 30.0) -> Any:
    url = base.rstrip("/") + path
    data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
    headers = {"Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, headers=headers, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read(25 * 1024 * 1024).decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{method} {url}: HTTP {exc.code}: {exc.read(800)!r}") from exc
    except (urllib.error.URLError, ValueError) as exc:
        raise RuntimeError(f"{method} {url}: {exc}") from exc


def require_hash(value: str, name: str) -> str:
    if not isinstance(value, str) or not HEX64.fullmatch(value):
        raise ValueError(f"{name} must be lowercase SHA-256 hex")
    return value


def check_record(r: dict[str, Any], scope: str, max_chars: int) -> dict[str, Any]:
    required = (
        "chunkId", "sourceRef", "sourceRevision", "chunkSha256",
        "contentSha256", "text", "scope", "pgReadbackStatus", "admissionStatus",
    )
    for k in required:
        if k not in r:
            raise ValueError(f"missing {k}")
    for key in ("chunkId", "sourceRef", "sourceRevision", "text", "scope"):
        if not isinstance(r[key], str) or not r[key].strip():
            raise ValueError(f"empty/invalid {key}")
    if r["scope"] != scope or r["pgReadbackStatus"] != "PROVEN" or r["admissionStatus"] != "INDEX_ELIGIBLE":
        raise ValueError("source not approved by the canonical index/export scope gate")
    if len(r["text"]) > max_chars:
        raise ValueError(f"text too long ({len(r['text'])} chars); chunk at the canonical owner")
    for h in ("chunkSha256", "contentSha256"):
        require_hash(r[h], h)
    if digest(r["text"].encode("utf-8")) != r["chunkSha256"]:
        raise ValueError("chunkSha256 mismatch; do not silently normalize text")
    if not isinstance(r.get("title", ""), str):
        raise ValueError("title must be a string")
    return r


def format_document(r: dict[str, Any], prefix_policy: str) -> str:
    if prefix_policy == "embeddinggemma2-document-v1":
        return f'title: {r.get("title") or "none"} | text: {r["text"]}'
    if prefix_policy == "plain-v1":
        return r["text"]
    raise ValueError("unsupported prefix policy")


def point_id(r: dict[str, Any], model_sha: str, prefix_policy: str) -> str:
    key = json.dumps(
        [r["scope"], r["sourceRef"], r["sourceRevision"], r["chunkId"], r["chunkSha256"], model_sha, prefix_policy],
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return str(uuid.uuid5(NAMESPACE, key))


def validate_vector(vec: list[float], expected_dim: int = 768) -> list[float]:
    if not isinstance(vec, list) or len(vec) != expected_dim:
        raise ValueError(f"expected {expected_dim}-d vector, got {len(vec) if isinstance(vec, list) else type(vec).__name__}")
    out: list[float] = []
    norm_sq = 0.0
    for x in vec:
        if not isinstance(x, (int, float)) or isinstance(x, bool) or not math.isfinite(float(x)):
            raise ValueError("non-finite vector element")
        val = float(x)
        out.append(val)
        norm_sq += val * val
    if norm_sq <= 0.0:
        raise ValueError("zero-norm vector")
    return out


def embed_texts(
    base_url: str,
    runtime: str,
    model: str,
    texts: list[str],
) -> list[list[float]]:
    if runtime == "ollama":
        resp = request_json(
            base_url,
            "/api/embed",
            method="POST",
            body={"model": model, "input": texts, "truncate": False},
            timeout=60.0,
        )
        embs = resp.get("embeddings")
        if not isinstance(embs, list) or len(embs) != len(texts):
            raise RuntimeError("Ollama /api/embed returned mismatched embedding count")
        return [validate_vector(v) for v in embs]
    if runtime == "openai":
        resp = request_json(
            base_url,
            "/v1/embeddings",
            method="POST",
            body={"model": model, "input": texts},
            timeout=60.0,
        )
        data = resp.get("data")
        if not isinstance(data, list) or len(data) != len(texts):
            raise RuntimeError("OpenAI /v1/embeddings returned mismatched embedding count")
        return [validate_vector(row["embedding"]) for row in data]
    raise ValueError(f"unsupported runtime: {runtime}")


def build_feature_matrix_receipt(
    records: list[dict[str, Any]],
    vectors: list[list[float]],
    *,
    model: str,
    model_sha: str,
    prefix_policy: str,
) -> dict[str, Any]:
    """Build a revision-pinned [K, 768] float32 matrix receipt per AGENTS.md § 8."""
    mat = np.asarray(vectors, dtype=np.float32)
    ordinal_map = [
        {"ordinal": idx, "chunkId": r["chunkId"], "sourceRevision": r["sourceRevision"], "chunkSha256": r["chunkSha256"]}
        for idx, r in enumerate(records)
    ]
    return {
        "schema": "atlas.doc14-feature-matrix-receipt.v1",
        "shape": [int(mat.shape[0]), int(mat.shape[1]) if mat.ndim == 2 else 0],
        "dtype": "float32",
        "model": model,
        "modelSha256": model_sha,
        "prefixPolicy": prefix_policy,
        "candidateOrdinalMapChecksum": f"sha256:{digest(json.dumps(ordinal_map, sort_keys=True, separators=(',', ':')).encode('utf-8'))}",
        "matrixChecksum": f"sha256:{digest(mat.tobytes())}",
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def check_qdrant_collection(qdrant_url: str, collection: str, expected_dim: int = 768) -> dict[str, Any]:
    """Read-only preflight check: verify existing unnamed 768-D Cosine Qdrant collection."""
    info = request_json(qdrant_url, f"/collections/{collection}", method="GET", timeout=10.0)
    result = info.get("result") or {}
    vectors = (result.get("config") or {}).get("params", {}).get("vectors")
    if not isinstance(vectors, dict) or vectors.get("size") != expected_dim or vectors.get("distance") != "Cosine":
        raise ValueError(f"QDRANT_COLLECTION_SCHEMA_MISMATCH:{collection}:{vectors}")
    return {
        "collection": collection,
        "pointsCount": result.get("points_count", 0),
        "vectorSize": vectors.get("size"),
        "distance": vectors.get("distance"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="DOC-14 fail-closed embedding & matrix dry-run/upsert.")
    parser.add_argument("--manifest", type=pathlib.Path, required=True)
    parser.add_argument("--scope", default="repo:deeds")
    parser.add_argument("--runtime", choices=("ollama", "openai"), default="ollama")
    parser.add_argument("--embed-url", default=None)
    parser.add_argument("--qdrant-url", default="http://127.0.0.1:6333")
    parser.add_argument("--collection", default=None)
    parser.add_argument("--model", default="embeddinggemma2:q8_0")
    parser.add_argument("--model-file", type=pathlib.Path, default=DEFAULT_GGUF)
    parser.add_argument("--prefix-policy", default="embeddinggemma2-document-v1")
    parser.add_argument("--max-chars", type=int, default=8192)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--report", type=pathlib.Path, default=REPO_ROOT / "docs/reports/doc14-embedding-matrix-dryrun-v1.json")
    args = parser.parse_args()

    qdrant_preflight = (
        check_qdrant_collection(args.qdrant_url, args.collection)
        if args.collection
        else None
    )

    embed_url = args.embed_url or ("http://127.0.0.1:11434" if args.runtime == "ollama" else "http://127.0.0.1:8081")
    raw_lines = [line for line in args.manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
    records: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for line in raw_lines:
        rec = check_record(json.loads(line), args.scope, args.max_chars)
        if rec["chunkId"] in seen_ids:
            raise ValueError(f"duplicate chunkId: {rec['chunkId']}")
        seen_ids.add(rec["chunkId"])
        records.append(rec)

    selected = records[: max(1, args.limit)]
    model_sha = sha_file(args.model_file) if args.model_file.exists() else digest(args.model.encode("utf-8"))
    formatted = [format_document(r, args.prefix_policy) for r in selected]
    vectors = embed_texts(embed_url, args.runtime, args.model, formatted)
    matrix_receipt = build_feature_matrix_receipt(
        selected,
        vectors,
        model=args.model,
        model_sha=model_sha,
        prefix_policy=args.prefix_policy,
    )
    sample_points = [
        {"pointId": point_id(r, model_sha, args.prefix_policy), "chunkId": r["chunkId"], "sourceRef": r["sourceRef"]}
        for r in selected[:3]
    ]
    report = {
        "schema": "atlas.doc14-embedding-dryrun.v1",
        "runtime": args.runtime,
        "embedUrl": embed_url,
        "qdrantPreflight": qdrant_preflight,
        "manifestRecordsValidated": len(records),
        "embeddedSampleCount": len(vectors),
        "matrixReceipt": matrix_receipt,
        "samplePointIds": sample_points,
        "canonicalAuthority": False,
        "writesPerformed": False,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "schema": report["schema"],
        "runtime": report["runtime"],
        "model": args.model,
        "qdrantPreflight": qdrant_preflight,
        "manifestRecordsValidated": report["manifestRecordsValidated"],
        "embeddedSampleCount": report["embeddedSampleCount"],
        "matrixShape": matrix_receipt["shape"],
        "matrixChecksum": matrix_receipt["matrixChecksum"],
        "reportPath": str(args.report),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
