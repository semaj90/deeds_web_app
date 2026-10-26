#!/usr/bin/env python3
"""Read-only nprobe replay using centroids independently loaded from PostgreSQL."""

import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

import numpy as np
import psycopg

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / ".tmp" / "atlas" / "kmeans-raw768"
REPORT_PATH = ROOT / "docs" / "reports" / "kmeans-raw768-stored-model-nprobe-v1.json"
MODEL_VERSION = "mbk-euclidean-content-embedding-768-k256-column-v1"
PROBES = (1, 2, 3, 5, 8, 16, 32)
TOP_K = 10
QUERY_COUNT = 1000


def digest_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def database_url() -> str:
    value = os.environ.get("DATABASE_URL")
    if value:
        return value
    env_path = ROOT / ".env"
    for line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
        match = re.match(r"\s*DATABASE_URL\s*=\s*(.+)", line)
        if match:
            return match.group(1).strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL_NOT_FOUND")


def main() -> None:
    vectors_path = DATA_DIR / "V0.npy"
    ids_path = DATA_DIR / "ids0.json"
    vectors = np.load(vectors_path, mmap_mode="r")
    ids = json.loads(ids_path.read_text(encoding="utf-8"))
    if vectors.shape != (len(ids), 768) or len(set(ids)) != len(ids):
        raise RuntimeError("FROZEN_COHORT_INVALID")
    vectors_hash = hashlib.sha256()
    with vectors_path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            vectors_hash.update(block)

    with psycopg.connect(database_url(), options="-c default_transaction_read_only=on") as conn:
        with conn.cursor() as cur:
            cur.execute("SHOW transaction_read_only")
            if cur.fetchone()[0] != "on":
                raise RuntimeError("READ_ONLY_TRANSACTION_NOT_CONFIRMED")
            cur.execute("""
                SELECT model_version, k, dim, n_chunks, centroids::text, metadata::text,
                       manifest_hash, vector_contract, model_role, is_assignment_active
                FROM atlas_cluster_models WHERE model_version = %s
            """, (MODEL_VERSION,))
            row = cur.fetchone()
            if not row:
                raise RuntimeError("STORED_MODEL_NOT_FOUND")
            version, k, dim, n_chunks, centroid_text, metadata_text, manifest_hash, contract, role, active = row
            metadata = json.loads(metadata_text)
            centroids = np.asarray(json.loads(centroid_text), dtype=np.float32)
            cur.execute("SELECT id::text, coalesce(source_ref, id::text) FROM codebase_chunk_index WHERE content_embedding_768 IS NOT NULL ORDER BY id")
            source_rows = cur.fetchall()

    expected_cohort = metadata.get("cohort", {})
    if (version != MODEL_VERSION or k != 256 or dim != 768 or role != "EVALUATION_CANDIDATE" or active is not False or
            contract != "content_embedding_768-column-cohort-v1" or centroids.shape != (256, 768) or
            n_chunks != int(metadata.get("trainingCount", -1)) or manifest_hash != metadata.get("cohortChecksum")):
        raise RuntimeError("STORED_MODEL_CONTRACT_MISMATCH")
    if digest_bytes(centroids.astype("<f4").tobytes(order="C")) != metadata.get("centroidChecksum"):
        raise RuntimeError("STORED_CENTROID_CHECKSUM_MISMATCH")
    if digest_bytes(canonical(expected_cohort)) != metadata.get("cohortChecksum"):
        raise RuntimeError("STORED_COHORT_CHECKSUM_MISMATCH")
    if "sha256:" + vectors_hash.hexdigest() != expected_cohort.get("matrixSha256"):
        raise RuntimeError("FROZEN_MATRIX_CHECKSUM_MISMATCH")
    if digest_bytes(ids_path.read_bytes()) != expected_cohort.get("orderedIdsSha256"):
        raise RuntimeError("FROZEN_ID_LIST_CHECKSUM_MISMATCH")
    if [item[0] for item in source_rows] != ids:
        raise RuntimeError("CURRENT_DATABASE_ID_ORDER_DIFFERS_FROM_FROZEN_COHORT")

    refs = np.asarray([item[1] for item in source_rows], dtype=object)
    ref_codes = {ref: index for index, ref in enumerate(dict.fromkeys(refs.tolist()))}
    ref_ordinals = np.fromiter((ref_codes[ref] for ref in refs.tolist()), dtype=np.int32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms == 0) or not np.isfinite(norms).all():
        raise RuntimeError("INVALID_VECTOR_NORM")
    X = np.asarray(vectors / norms, dtype=np.float32)
    bucket = np.fromiter((int(hashlib.md5(str(item).encode()).hexdigest(), 16) % 10 for item in ids), dtype=np.int8)
    train, holdout = np.where(bucket != 0)[0], np.where(bucket == 0)[0]
    if len(train) != int(metadata.get("trainingCount", -1)) or len(holdout) != int(metadata.get("holdoutCount", -1)):
        raise RuntimeError("FROZEN_SPLIT_COUNTS_MISMATCH")

    started = time.time()
    X_train = X[train]
    train_refs = ref_ordinals[train]
    centroid_norms = np.sum(centroids * centroids, axis=1)
    nearest_train = np.argmin(1.0 + centroid_norms[None, :] - 2.0 * (X_train @ centroids.T), axis=1)
    members = [np.flatnonzero(nearest_train == cluster) for cluster in range(256)]
    queries = np.random.default_rng(17).choice(holdout, size=min(QUERY_COUNT, len(holdout)), replace=False)
    truth = []
    query_batch = 32
    for begin in range(0, len(queries), query_batch):
        q_indices = queries[begin:begin + query_batch]
        scores = X[q_indices] @ X_train.T
        for offset, q_index in enumerate(q_indices):
            query_scores = scores[offset]
            query_scores[train_refs == ref_ordinals[q_index]] = -2.0
            best = np.argpartition(-query_scores, TOP_K - 1)[:TOP_K]
            truth.append(set(best.tolist()))

    results = {}
    for probe_count in PROBES:
        recalls, candidate_fractions = [], []
        for q_index, truth_set in zip(queries, truth):
            distances = 1.0 + centroid_norms - 2.0 * (centroids @ X[q_index])
            selected = np.argpartition(distances, probe_count - 1)[:probe_count]
            candidates = np.concatenate([members[cluster] for cluster in selected])
            candidates = candidates[train_refs[candidates] != ref_ordinals[q_index]]
            recalls.append(len(truth_set.intersection(candidates.tolist())) / TOP_K)
            candidate_fractions.append(len(candidates) / len(train))
        results[str(probe_count)] = {
            "recallAt10": round(float(np.mean(recalls)), 4),
            "p10Recall": round(float(np.percentile(recalls, 10)), 3),
            "candidateFraction": round(float(np.mean(candidate_fractions)), 4),
        }

    report = {
        "schema": "atlas.kmeans-raw768-stored-model-nprobe.v1",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "modelVersion": version,
        "modelRole": role,
        "isAssignmentActive": active,
        "databaseTransactionReadOnly": True,
        "writesPerformed": False,
        "modelReadFromPostgres": True,
        "independentReadbackCentroidChecksum": metadata["centroidChecksum"],
        "cohortChecksum": metadata["cohortChecksum"],
        "matrixChecksumMatches": True,
        "orderedIdChecksumMatches": True,
        "currentDatabaseIdOrderMatchesFrozenCohort": True,
        "sourceRevisionCoverage": metadata.get("cohort", {}).get("sourceRevisionCoverage"),
        "workspaceRevision": metadata.get("cohort", {}).get("workspaceRevision"),
        "trainingCount": len(train),
        "holdoutCount": len(holdout),
        "queries": len(queries),
        "topK": TOP_K,
        "probeResults": results,
        "elapsedSeconds": round(time.time() - started, 3),
        "caveats": [
            "Self-query proxy, not human-judged golden retrieval evaluation.",
            "Vectors are frozen by local matrix checksum; source/workspace/representation revisions are not proven.",
            "This is a read-only candidate evaluation and does not enable routing or update assignments.",
        ],
        "canonicalAuthority": False,
    }
    report["checksum"] = digest_bytes(canonical(report))
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
