#!/usr/bin/env python3
"""Export an immutable seed-42 K=256 candidate from the frozen raw-768 cache."""

import hashlib
import json
import time
from pathlib import Path

import numpy as np
from sklearn.cluster import MiniBatchKMeans

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / ".tmp" / "atlas" / "kmeans-raw768"
DRY_RUN_PATH = ROOT / "docs" / "reports" / "kmeans-raw768-dryrun-v1.json"
OUTPUT_PATH = DATA_DIR / "mbk-euclidean-content-embedding-768-k256-raw-v1.json"


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()


def main() -> None:
    dry_run = json.loads(DRY_RUN_PATH.read_text(encoding="utf-8"))
    if dry_run.get("schema") != "atlas.kmeans-raw768-dryrun.v1" or dry_run.get("writesPerformed") is not False:
        raise ValueError("DRY_RUN_RECEIPT_INVALID")
    if dry_run.get("k") != 256 or dry_run.get("rows") <= 0:
        raise ValueError("DRY_RUN_COHORT_UNEXPECTED")

    vectors_path = DATA_DIR / "V0.npy"
    ids_path = DATA_DIR / "ids0.json"
    ids_bytes = ids_path.read_bytes()
    vectors = np.load(vectors_path, mmap_mode="r")
    ids = json.loads(ids_bytes)
    if vectors.shape != (len(ids), 768) or len(ids) != dry_run["rows"]:
        raise ValueError("FROZEN_COHORT_SHAPE_MISMATCH")
    if len(set(ids)) != len(ids):
        raise ValueError("DUPLICATE_COHORT_ID")
    if vectors.dtype != np.float32 or not np.isfinite(vectors).all():
        raise ValueError("INVALID_FROZEN_VECTOR_MATRIX")

    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if np.any(norms == 0) or not np.isfinite(norms).all():
        raise ValueError("ZERO_OR_INVALID_VECTOR_NORM")
    normalized = np.asarray(vectors / norms, dtype=np.float32)
    buckets = np.fromiter((int(hashlib.md5(str(item).encode()).hexdigest(), 16) % 10 for item in ids), dtype=np.int8)
    train_mask = buckets != 0
    holdout_mask = ~train_mask
    if int(train_mask.sum()) != dry_run["train"] or int(holdout_mask.sum()) != dry_run["holdout"]:
        raise ValueError("SPLIT_REPLAY_MISMATCH")

    started = time.time()
    model = MiniBatchKMeans(n_clusters=256, batch_size=4096, n_init=3, max_iter=100, random_state=42)
    model.fit(normalized[train_mask])
    replay = model.predict(normalized[train_mask])
    if float(np.mean(replay == model.labels_)) < 0.99:
        raise ValueError("EUCLIDEAN_ASSIGNMENT_REPLAY_BELOW_GATE")
    if not np.isfinite(model.cluster_centers_).all() or model.cluster_centers_.shape != (256, 768):
        raise ValueError("INVALID_FITTED_CENTROIDS")

    centroid_rows = model.cluster_centers_.astype(np.float32).tolist()
    training_id_hash = sha256_bytes(canonical_json([str(item) for item in np.asarray(ids, dtype=object)[train_mask]]))
    payload = {
        "schema": "atlas.kmeans-raw768-model-artifact.v1",
        "modelVersion": "mbk-euclidean-content-embedding-768-k256-column-v1",
        "k": 256,
        "dim": 768,
        "nChunks": len(ids),
        "trainingCount": int(train_mask.sum()),
        "holdoutCount": int(holdout_mask.sum()),
        "sourceColumn": "codebase_chunk_index.content_embedding_768",
        "sourceEmbeddingModel": "UNVERIFIED_COLUMN_COHORT",
        "vectorContract": "content_embedding_768-column-cohort-v1",
        "inputNormalization": "l2",
        "centroidNormalization": "none; preserve fitted Euclidean coordinates",
        "algorithm": "MiniBatchKMeans",
        "batchSize": 4096,
        "nInit": 3,
        "maxIter": 100,
        "randomSeed": 42,
        "distanceMetric": "euclidean",
        "inertia": float(model.inertia_),
        "fitPredictReplay": float(np.mean(replay == model.labels_)),
        "fittedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fitSeconds": round(time.time() - started, 3),
        "cohort": {
            "matrixSha256": sha256_file(vectors_path),
            "orderedIdsSha256": sha256_bytes(ids_bytes),
            "trainingIdsSha256": training_id_hash,
            "workspaceRevision": None,
            "sourceRevisionCoverage": "NOT_PROVEN",
            "representationRevision": None,
            "recipeQualification": "COLUMN_ONLY; per-row embedding recipe and source revisions are not proven",
        },
        "centroids": centroid_rows,
        "canonicalAuthority": False,
        "modelRole": "EVALUATION_CANDIDATE",
        "isAssignmentActive": False,
    }
    payload["cohortChecksum"] = sha256_bytes(canonical_json(payload["cohort"]))
    payload["centroidChecksum"] = sha256_bytes(model.cluster_centers_.astype("<f4").tobytes(order="C"))
    artifact_bytes = json.dumps(payload, separators=(",", ":"), allow_nan=False).encode("utf-8")
    OUTPUT_PATH.write_bytes(artifact_bytes)
    print(json.dumps({
        "artifact": str(OUTPUT_PATH.relative_to(ROOT)),
        "modelVersion": payload["modelVersion"],
        "rows": len(ids),
        "train": int(train_mask.sum()),
        "holdout": int(holdout_mask.sum()),
        "replay": payload["fitPredictReplay"],
        "centroidChecksum": payload["centroidChecksum"],
        "artifactFileChecksum": sha256_bytes(artifact_bytes),
        "workspaceRevision": None,
        "sourceRevisionCoverage": "NOT_PROVEN",
        "writesPerformed": False,
    }, indent=2))


if __name__ == "__main__":
    main()
