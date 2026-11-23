"""Bag-of-Words Sparse CSR + Clustering (UMAP/KMeans/DBSCAN) + Relation Proposal Bridge (v1).

Separates derived clustering from source-backed relation proposals:
  1. Builds deterministic Bag-of-Words sparse CSR (`build_task_keyword_csr_v1`).
  2. Runs 2D projection + KMeans + DBSCAN + trustworthiness (CPU oracle by default;
     WSL2 `cuml` when `--allow-gpu` and MEM-04 preflight pass). Clustering organizes
     chunks for review; it NEVER mints ontology relations.
  3. Extracts & verifies exact UTF-8 byte-span `PROPOSED` relations
     (`extract_and_verify_import_proposals_from_chunks_v1`).

Read-only / non-canonical (`canonicalAuthority=False`, `writesPerformed=False`).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np
from sklearn.cluster import DBSCAN, KMeans
from sklearn.manifold import trustworthiness

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "python"))
sys.path.insert(0, str(REPO_ROOT / "scripts" / "atlas"))

from atlas_graph_runtime.relation_proposal_verifier_v1 import (
    extract_and_verify_import_proposals_from_chunks_v1,
)
from atlas_graph_runtime.task_feature_gate_v1 import build_task_keyword_csr_v1

CHUNKS_PATH = REPO_ROOT / "docs" / "reports" / "doc14-admitted-chunks.jsonl"
RECEIPT_PATH = REPO_ROOT / "docs" / "reports" / "bow-relation-clustering-receipt-v1.json"


def run_bow_relation_clustering_v1(
    chunks: Sequence[dict[str, Any]],
    *,
    n_clusters: int = 4,
    allow_gpu: bool = False,
    source_readback_fn: Callable[[str], bytes | None] | None = None,
    require_source_readback: bool = False,
) -> dict[str, Any]:
    if not chunks:
        raise ValueError("EMPTY_CHUNKS")

    tasks = [
        {
            "taskId": str(c["chunkId"]),
            "taskRevision": str(c["sourceRevision"]),
            "scope": "repo:deeds",
            "sourceRef": str(c["sourceRef"]),
            # Task revision and full-source content digest are distinct fields.
            # The feature-gate contract requires a prefixed content SHA-256.
            "sourceSha256": "sha256:" + str(c["contentSha256"]).removeprefix("sha256:"),
            "text": str(c.get("text") or ""),
            "proposedDomains": [],
        }
        for c in chunks
    ]
    bow_csr = build_task_keyword_csr_v1(tasks)

    # Reconstruct dense float32 matrix from sparse CSR for clustering/UMAP
    n_rows, n_cols = bow_csr["shape"]
    x_dense = np.zeros((n_rows, n_cols), dtype=np.float32)
    indptr = bow_csr["indptr"]
    indices = bow_csr["indices"]
    data = bow_csr["data"]
    for i in range(n_rows):
        start, end = int(indptr[i]), int(indptr[i + 1])
        x_dense[i, indices[start:end]] = data[start:end]

    # L2-normalize rows for cosine-aligned clustering
    norms = np.linalg.norm(x_dense, axis=1, keepdims=True)
    x_norm = np.divide(x_dense, np.maximum(norms, 1e-8))

    backend = "cpu_sklearn_svd_oracle"
    k = min(max(2, n_clusters), n_rows)
    if allow_gpu:
        try:
            from cuml.cluster import DBSCAN as CumlDBSCAN, KMeans as CumlKMeans  # type: ignore
            from cuml.manifold import UMAP as CumlUMAP  # type: ignore
            from cuml.metrics import trustworthiness as cuml_trustworthiness  # type: ignore

            km_labels = CumlKMeans(n_clusters=k, random_state=42).fit_predict(x_norm).tolist()
            db_labels = CumlDBSCAN(eps=0.9, min_samples=2).fit_predict(x_norm).tolist()
            x_2d = np.asarray(
                CumlUMAP(n_components=2, n_neighbors=min(10, max(2, n_rows - 1)), random_state=42).fit_transform(x_norm),
                dtype=np.float32,
            )
            trust = float(cuml_trustworthiness(x_norm, x_2d, n_neighbors=min(5, max(1, n_rows - 1))))
            backend = "cuml_gpu"
        except ImportError:
            allow_gpu = False

    if not allow_gpu:
        centered = x_norm - np.mean(x_norm, axis=0, keepdims=True)
        _u, _s, vt = np.linalg.svd(centered, full_matrices=False)
        comp = min(2, vt.shape[0])
        x_2d = np.ascontiguousarray(centered @ vt[:comp].T, dtype=np.float32)
        if x_2d.shape[1] < 2:
            x_2d = np.hstack([x_2d, np.zeros((n_rows, 2 - x_2d.shape[1]), dtype=np.float32)])
        km_labels = KMeans(n_clusters=k, random_state=42, n_init=10).fit_predict(x_norm).tolist()
        db_labels = DBSCAN(eps=0.9, min_samples=2).fit_predict(x_norm).tolist()
        n_nb = min(5, max(1, (n_rows - 1) // 2))
        trust = float(trustworthiness(x_norm, x_2d, n_neighbors=n_nb)) if n_rows >= 4 else 1.0

    # Source-backed relation proposals (strictly separate from clusters)
    rel_batch = extract_and_verify_import_proposals_from_chunks_v1(
        chunks,
        source_readback_fn=source_readback_fn,
        require_source_readback=require_source_readback,
    )

    return {
        "schema": "atlas.bow-relation-clustering-receipt.v1",
        "chunkCount": n_rows,
        "bowCsr": {
            "shape": bow_csr["shape"],
            "nnz": bow_csr["nnz"],
            "csrChecksum": bow_csr["csrChecksum"],
        },
        "clustering": {
            "backend": backend,
            "kmeansClusters": len(set(km_labels)),
            "dbscanUniqueLabels": len(set(db_labels)),
            "projection2dChecksum": f"sha256:{hashlib.sha256(x_2d.tobytes()).hexdigest()}",
            "trustworthiness": round(trust, 6),
            "clustersCanMintRelations": False,
        },
        "relationProposals": {
            "verifiedProposedCount": rel_batch["verifiedCount"],
            "rejectedCount": rel_batch["rejectedCount"],
            "sampleProposals": rel_batch["proposals"][:5],
            "sampleRejections": rel_batch["rejected"][:10],
            "sourceReadbackRequired": rel_batch["sourceReadbackRequired"],
            "sourceReadbackConfigured": rel_batch["sourceReadbackConfigured"],
            "sourceContentHashVerifiedCount": rel_batch["sourceContentHashVerifiedCount"],
            "reviewStatus": "PROPOSED_PENDING_HUMAN_REVIEW",
        },
        "canonicalAuthority": False,
        "writesPerformed": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--allow-gpu", action="store_true")
    args = parser.parse_args()

    chunks = [
        json.loads(line)
        for line in CHUNKS_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ][: max(4, args.limit)]

    repo_root = REPO_ROOT.resolve()

    def read_current_source(source_ref: str) -> bytes | None:
        candidate = Path(source_ref)
        if candidate.is_absolute():
            return None
        resolved = (repo_root / candidate).resolve()
        try:
            resolved.relative_to(repo_root)
        except ValueError:
            return None
        if not resolved.is_file() or resolved.stat().st_size > 16 * 1024 * 1024:
            return None
        return resolved.read_bytes()

    receipt = run_bow_relation_clustering_v1(
        chunks,
        allow_gpu=args.allow_gpu,
        source_readback_fn=read_current_source,
        require_source_readback=True,
    )
    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({**receipt, "reportPath": str(RECEIPT_PATH)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
