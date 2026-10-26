#!/usr/bin/env python3
"""Measure CPU KMeans seed stability on a frozen directory metadata matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from itertools import combinations
from pathlib import Path

import pyarrow as pa
import pyarrow.ipc as ipc
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score

from gpu_directory_metadata_clusters_v1 import build_structural_matrix


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def pairwise_ari_summary(label_runs: list[list[int]]) -> dict:
    if len(label_runs) < 2:
        raise ValueError("AT_LEAST_TWO_CLUSTER_RUNS_REQUIRED")
    scores = [
        float(adjusted_rand_score(left, right))
        for left, right in combinations(label_runs, 2)
    ]
    ordered = sorted(scores)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return {
        "pairCount": len(scores),
        "meanAdjustedRandIndex": sum(scores) / len(scores),
        "medianAdjustedRandIndex": median,
        "minimumAdjustedRandIndex": min(scores),
        "maximumAdjustedRandIndex": max(scores),
    }


def load_feature_matrix(manifest_path: Path, repository_root: Path):
    manifest_bytes = manifest_path.read_bytes()
    manifest = json.loads(manifest_bytes)
    body = dict(manifest)
    digest = body.pop("receiptSha256", None)
    if sha256_bytes(canonical_json(body)) != digest:
        raise ValueError("FEATURE_MATRIX_MANIFEST_CHECKSUM_INVALID")
    if manifest.get("status") != "DERIVED_ADVISORY_SPARSE_FEATURES" or manifest.get("canonicalAuthority") is not False:
        raise ValueError("FEATURE_MATRIX_AUTHORITY_FLAGS_INVALID")
    if manifest.get("writesPerformed") is not False or manifest.get("noDatabaseOrGpuWrites") is not True:
        raise ValueError("FEATURE_MATRIX_WRITE_FLAGS_INVALID")

    artifacts = {}
    tables = {}
    for name in ("directory-ordinals.arrow", "feature-ordinals.arrow", "directory-features-sparse.arrow"):
        record = manifest.get("artifacts", {}).get(name)
        if not record:
            raise ValueError(f"FEATURE_MATRIX_ARTIFACT_MISSING:{name}")
        path = (manifest_path.parent / name).resolve()
        if repository_root not in path.parents:
            raise ValueError("FEATURE_MATRIX_ARTIFACT_OUTSIDE_REPOSITORY")
        raw = path.read_bytes()
        if len(raw) != record.get("bytes") or sha256_bytes(raw) != record.get("sha256"):
            raise ValueError(f"FEATURE_MATRIX_ARTIFACT_CHECKSUM_INVALID:{name}")
        with ipc.open_file(pa.BufferReader(raw)) as reader:
            tables[name] = reader.read_all().to_pylist()
        artifacts[name] = {"sha256": record["sha256"], "bytes": len(raw)}

    directories = tables["directory-ordinals.arrow"]
    features = tables["feature-ordinals.arrow"]
    sparse = tables["directory-features-sparse.arrow"]
    if len(directories) != manifest.get("directoryRows") or len(features) != manifest.get("featureRows") or len(sparse) != manifest.get("sparseValueRows"):
        raise ValueError("FEATURE_MATRIX_ROW_COUNT_INVALID")
    matrix, eligible, selected_features = build_structural_matrix(len(directories), features, sparse)
    return manifest, manifest_bytes, artifacts, directories, matrix[eligible], eligible


def run(args):
    root = Path(args.repo_root).resolve()
    manifest_path = (root / args.input_manifest).resolve()
    output_dir = (root / ".tmp" / "atlas" / "directory-intelligence" / "gpu-metadata-clusters" / "stability" / args.run_id).resolve()
    if root not in manifest_path.parents or root not in output_dir.parents:
        raise ValueError("INPUT_OR_OUTPUT_PATH_OUTSIDE_REPOSITORY")
    if len(set(args.cluster_counts)) != len(args.cluster_counts) or any(value < 2 for value in args.cluster_counts):
        raise ValueError("CLUSTER_COUNTS_INVALID")
    if len(set(args.seeds)) != len(args.seeds) or len(args.seeds) < 2:
        raise ValueError("AT_LEAST_TWO_UNIQUE_SEEDS_REQUIRED")

    started = time.perf_counter()
    manifest, manifest_bytes, artifacts, directories, matrix, eligible = load_feature_matrix(manifest_path, root)
    rows = len(matrix)
    if any(clusters >= rows for clusters in args.cluster_counts):
        raise ValueError("CLUSTER_COUNT_MUST_BE_LESS_THAN_ELIGIBLE_ROWS")

    from sklearn import __version__ as sklearn_version

    results = []
    for clusters in args.cluster_counts:
        labels_by_seed = []
        run_timings = []
        for seed in args.seeds:
            fit_start = time.perf_counter()
            labels = KMeans(
                n_clusters=clusters,
                random_state=seed,
                n_init=args.n_init,
                max_iter=args.max_iter,
                algorithm="lloyd",
            ).fit_predict(matrix)
            run_timings.append(time.perf_counter() - fit_start)
            labels_by_seed.append(labels.tolist())
        results.append({
            "clusterCount": clusters,
            "seeds": args.seeds,
            "nInit": args.n_init,
            "maxIter": args.max_iter,
            "pairwiseStability": pairwise_ari_summary(labels_by_seed),
            "elapsedSecondsBySeed": run_timings,
        })

    receipt = {
        "schema": "atlas.directory-metadata-cluster-stability.v1",
        "runId": args.run_id,
        "status": "CPU_METADATA_CLUSTER_STABILITY_DIAGNOSTIC",
        "canonicalAuthority": False,
        "productionAdmission": False,
        "writesPerformed": False,
        "input": {
            "manifestPath": str(manifest_path.relative_to(root)).replace("\\", "/"),
            "manifestFileSha256": sha256_bytes(manifest_bytes),
            "manifestReceiptSha256": manifest["receiptSha256"],
            "directoryOrdinalSha256": manifest["artifacts"]["directory-ordinals.arrow"]["sha256"],
            "artifactChecksums": artifacts,
            "directoryCount": len(directories),
            "eligibleDirectoryCount": rows,
            "abstainedDirectoryCount": len(directories) - rows,
            "featureCount": int(matrix.shape[1]),
            "featureScope": "PATH_INVENTORY_COUNT, PATH_SOURCE_CLASS_INVENTORY_COUNT, PROFILE_INVENTORY_COUNT",
        },
        "method": {"algorithm": "scikit-learn KMeans", "version": sklearn_version, "clusterCounts": args.cluster_counts},
        "results": results,
        "elapsedSeconds": time.perf_counter() - started,
        "interpretation": "Seed stability measures repeatability of inventory-metadata partitions only; it does not measure semantic quality, relevance, or CPU/GPU parity.",
    }
    output_dir.mkdir(parents=True, exist_ok=False)
    receipt["receiptSha256"] = sha256_bytes(canonical_json(receipt))
    receipt_path = output_dir / "receipt.json"
    with receipt_path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({
        "receiptPath": str(receipt_path.relative_to(root)).replace("\\", "/"),
        "receiptSha256": receipt["receiptSha256"],
        "status": receipt["status"],
        "eligibleDirectoryCount": rows,
        "results": results,
        "elapsedSeconds": receipt["elapsedSeconds"],
    }, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--input-manifest", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--cluster-counts", nargs="+", type=int, default=[8, 12, 16])
    parser.add_argument("--seeds", nargs="+", type=int, default=[17, 23, 42, 101, 2026])
    parser.add_argument("--n-init", type=int, default=3)
    parser.add_argument("--max-iter", type=int, default=100)
    args = parser.parse_args()
    if not args.run_id or len(args.run_id) > 64 or any(char not in "abcdefghijklmnopqrstuvwxyz0123456789-" for char in args.run_id):
        parser.error("run-id must contain lowercase letters, digits, or hyphens")
    if args.n_init < 1 or args.max_iter < 1:
        parser.error("n-init and max-iter must be positive")
    run(args)


if __name__ == "__main__":
    main()
