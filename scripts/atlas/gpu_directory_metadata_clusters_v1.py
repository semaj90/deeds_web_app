#!/usr/bin/env python3
"""Create advisory directory clusters from deterministic inventory metadata."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import threading
import time
from pathlib import Path

import numpy as np


STRUCTURAL_EVIDENCE_KINDS = {
    "PATH_INVENTORY_COUNT",
    "PATH_SOURCE_CLASS_INVENTORY_COUNT",
    "PROFILE_INVENTORY_COUNT",
}


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def select_structural_features(feature_rows: list[dict]) -> list[dict]:
    selected = [
        row for row in feature_rows
        if row.get("evidenceKind") in STRUCTURAL_EVIDENCE_KINDS
    ]
    selected.sort(key=lambda row: row["ordinal"])
    if not selected or [row["ordinal"] for row in selected] != sorted({row["ordinal"] for row in selected}):
        raise ValueError("STRUCTURAL_FEATURE_ORDINALS_INVALID")
    if any(not isinstance(row.get("featureKey"), str) or not row["featureKey"] for row in selected):
        raise ValueError("STRUCTURAL_FEATURE_KEY_INVALID")
    return selected


def build_structural_matrix(directory_count: int, feature_rows: list[dict], sparse_rows: list[dict]):
    selected = select_structural_features(feature_rows)
    feature_index = {row["ordinal"]: index for index, row in enumerate(selected)}
    matrix = np.zeros((directory_count, len(selected)), dtype=np.float32)
    seen = set()
    for row in sparse_rows:
        entity = row.get("entityOrdinal")
        ordinal = row.get("featureOrdinal")
        value = row.get("value")
        if not isinstance(entity, int) or entity < 0 or entity >= directory_count:
            raise ValueError("ENTITY_ORDINAL_INVALID")
        if ordinal not in feature_index:
            continue
        if not isinstance(value, int) or value <= 0:
            raise ValueError("STRUCTURAL_FEATURE_VALUE_INVALID")
        pair = (entity, ordinal)
        if pair in seen:
            raise ValueError("DUPLICATE_STRUCTURAL_SPARSE_VALUE")
        seen.add(pair)
        matrix[entity, feature_index[ordinal]] = math.log1p(value)

    norms = np.linalg.norm(matrix, axis=1)
    eligible = norms > 0
    matrix[eligible] /= norms[eligible, None]
    return matrix, eligible, selected


def canonicalize_cluster_ids(labels: np.ndarray, ordinals: np.ndarray) -> np.ndarray:
    labels = np.asarray(labels, dtype=np.int32)
    ordinals = np.asarray(ordinals, dtype=np.int64)
    if labels.shape != ordinals.shape:
        raise ValueError("CLUSTER_LABEL_ORDINAL_SHAPE_MISMATCH")
    first_members = {}
    for label, ordinal in zip(labels.tolist(), ordinals.tolist()):
        first_members[label] = min(first_members.get(label, ordinal), ordinal)
    remap = {label: new for new, (label, _) in enumerate(sorted(first_members.items(), key=lambda item: item[1]))}
    return np.fromiter((remap[label] for label in labels.tolist()), dtype=np.int16, count=len(labels))


def gpu_memory_used_mib() -> int | None:
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=memory.used", "--format=csv,noheader,nounits"],
            text=True,
            timeout=2,
        )
        return int(output.strip().splitlines()[0])
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


class GpuMemorySampler:
    def __init__(self, interval_seconds: float = 0.2):
        self.interval_seconds = interval_seconds
        self.peak_used_mib: int | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self):
        while not self._stop.is_set():
            current = gpu_memory_used_mib()
            if current is not None:
                self.peak_used_mib = max(self.peak_used_mib or 0, current)
            self._stop.wait(self.interval_seconds)

    def __enter__(self):
        self._thread.start()
        return self

    def __exit__(self, _type, _value, _traceback):
        self._stop.set()
        self._thread.join()


def run(args):
    import pyarrow as pa
    import pyarrow.ipc as ipc
    from sklearn.cluster import KMeans as CpuKMeans
    from sklearn.metrics import adjusted_rand_score

    root = Path(args.repo_root).resolve()
    input_manifest_path = (root / args.input_manifest).resolve()
    output_dir = (root / ".tmp" / "atlas" / "directory-intelligence" / "gpu-metadata-clusters" / args.run_id).resolve()
    if root not in input_manifest_path.parents:
        raise ValueError("INPUT_MANIFEST_OUTSIDE_REPOSITORY")
    if root not in output_dir.parents:
        raise ValueError("OUTPUT_PATH_OUTSIDE_REPOSITORY")
    output_dir.mkdir(parents=True, exist_ok=False)

    manifest_bytes = input_manifest_path.read_bytes()
    input_manifest = json.loads(manifest_bytes)
    manifest_body = dict(input_manifest)
    recorded_manifest_digest = manifest_body.pop("receiptSha256", None)
    if sha256_bytes(canonical_json(manifest_body)) != recorded_manifest_digest:
        raise ValueError("FEATURE_MATRIX_MANIFEST_CHECKSUM_INVALID")
    if input_manifest.get("status") != "DERIVED_ADVISORY_SPARSE_FEATURES" or input_manifest.get("canonicalAuthority") is not False:
        raise ValueError("FEATURE_MATRIX_AUTHORITY_FLAGS_INVALID")
    if input_manifest.get("writesPerformed") is not False or input_manifest.get("noDatabaseOrGpuWrites") is not True:
        raise ValueError("FEATURE_MATRIX_WRITE_FLAGS_INVALID")

    artifact_paths = {}
    artifact_bytes = {}
    for filename in ("directory-ordinals.arrow", "feature-ordinals.arrow", "directory-features-sparse.arrow"):
        record = input_manifest.get("artifacts", {}).get(filename)
        if not record:
            raise ValueError(f"FEATURE_MATRIX_ARTIFACT_MISSING:{filename}")
        artifact_path = (input_manifest_path.parent / filename).resolve()
        if root not in artifact_path.parents:
            raise ValueError("FEATURE_MATRIX_ARTIFACT_OUTSIDE_REPOSITORY")
        data = artifact_path.read_bytes()
        if len(data) != record.get("bytes") or sha256_bytes(data) != record.get("sha256"):
            raise ValueError(f"FEATURE_MATRIX_ARTIFACT_CHECKSUM_INVALID:{filename}")
        artifact_paths[filename] = artifact_path
        artifact_bytes[filename] = data

    with ipc.open_file(pa.BufferReader(artifact_bytes["directory-ordinals.arrow"])) as reader:
        directories = reader.read_all().to_pylist()
    with ipc.open_file(pa.BufferReader(artifact_bytes["feature-ordinals.arrow"])) as reader:
        feature_rows = reader.read_all().to_pylist()
    with ipc.open_file(pa.BufferReader(artifact_bytes["directory-features-sparse.arrow"])) as reader:
        sparse_rows = reader.read_all().to_pylist()
    if len(directories) != input_manifest.get("directoryRows") or len(feature_rows) != input_manifest.get("featureRows") or len(sparse_rows) != input_manifest.get("sparseValueRows"):
        raise ValueError("FEATURE_MATRIX_ROW_COUNT_INVALID")
    if [row.get("ordinal") for row in directories] != list(range(len(directories))):
        raise ValueError("DIRECTORY_ORDINAL_SEQUENCE_INVALID")

    matrix, eligible, selected_features = build_structural_matrix(len(directories), feature_rows, sparse_rows)
    eligible_ordinals = np.flatnonzero(eligible)
    if len(eligible_ordinals) <= args.clusters:
        raise ValueError("INSUFFICIENT_STRUCTURAL_DIRECTORY_ROWS")

    minimum_free_mib = args.minimum_free_mib
    memory = subprocess.check_output(
        ["nvidia-smi", "--query-gpu=name,memory.total,memory.used,memory.free", "--format=csv,noheader,nounits"],
        text=True,
        timeout=5,
    ).strip().splitlines()[0].split(",")
    gpu = {"name": memory[0].strip(), "totalMiB": int(memory[1]), "usedMiBBefore": int(memory[2]), "freeMiBBefore": int(memory[3])}
    if gpu["freeMiBBefore"] < minimum_free_mib:
        raise ValueError(f"GPU_FREE_MEMORY_BELOW_GATE:{gpu['freeMiBBefore']}<{minimum_free_mib}")

    cpu_start = time.perf_counter()
    cpu_model = CpuKMeans(n_clusters=args.clusters, random_state=args.seed, n_init=args.n_init, max_iter=args.max_iter, algorithm="lloyd")
    cpu_labels = cpu_model.fit_predict(matrix[eligible])
    cpu_elapsed = time.perf_counter() - cpu_start

    with GpuMemorySampler() as sampler:
        import cupy as cp
        from cuml.cluster import KMeans as GpuKMeans

        gpu_start = time.perf_counter()
        gpu_model = GpuKMeans(n_clusters=args.clusters, random_state=args.seed, n_init=args.n_init, max_iter=args.max_iter, output_type="numpy")
        gpu_model.fit(matrix[eligible])
        gpu_labels = np.asarray(gpu_model.labels_, dtype=np.int32)
        cp.cuda.runtime.deviceSynchronize()
        gpu_elapsed = time.perf_counter() - gpu_start
    gpu["peakObservedUsedMiB"] = sampler.peak_used_mib
    gpu["memorySamplingIntervalMs"] = int(sampler.interval_seconds * 1000)

    ari = float(adjusted_rand_score(cpu_labels, gpu_labels))
    cpu_canonical = canonicalize_cluster_ids(cpu_labels, eligible_ordinals)
    gpu_canonical = canonicalize_cluster_ids(gpu_labels, eligible_ordinals)
    full_assignments = np.full(len(directories), -1, dtype=np.int16)
    full_assignments[eligible_ordinals] = gpu_canonical
    assignment_table = pa.table({
        "directoryOrdinal": pa.array(np.arange(len(directories), dtype=np.int32)),
        "relativePath": pa.array([row["relativePath"] for row in directories], type=pa.string()),
        "clusterProposal": pa.array([None if value < 0 else int(value) for value in full_assignments], type=pa.int16()),
    })
    sink = pa.BufferOutputStream()
    with ipc.new_file(sink, assignment_table.schema) as writer:
        writer.write_table(assignment_table)
    assignment_bytes = sink.getvalue().to_pybytes()
    assignment_path = output_dir / "directory-cluster-proposals.arrow"
    with assignment_path.open("xb") as stream:
        stream.write(assignment_bytes)

    cluster_summaries = []
    transformed = matrix[eligible]
    for cluster_id in range(args.clusters):
        members = np.flatnonzero(gpu_canonical == cluster_id)
        feature_support = (transformed[members] > 0).mean(axis=0) if len(members) else np.zeros(len(selected_features))
        top_features = sorted(
            ((float(feature_support[index]), selected_features[index]["featureKey"], selected_features[index]["evidenceKind"])
             for index in range(len(selected_features))),
            key=lambda row: (-row[0], row[1]),
        )[:5]
        cluster_summaries.append({
            "clusterProposal": cluster_id,
            "memberDirectories": int(len(members)),
            "topFeatureSupport": [{"supportFraction": score, "featureKey": key, "evidenceKind": kind} for score, key, kind in top_features if score > 0],
        })

    receipt = {
        "schema": "atlas.gpu-directory-metadata-cluster-proposals.v1",
        "runId": args.run_id,
        "status": "METADATA_CLUSTER_PROPOSALS_ONLY",
        "canonicalAuthority": False,
        "productionAdmission": False,
        "writesPerformed": False,
        "input": {
            "manifestPath": str(input_manifest_path.relative_to(root)).replace(os.sep, "/"),
            "manifestFileSha256": sha256_bytes(manifest_bytes),
            "manifestReceiptSha256": recorded_manifest_digest,
            "directoryRows": len(directories),
            "sparseFeatureRows": len(sparse_rows),
            "selectedFeatureCount": len(selected_features),
            "selectedFeatureSchemaSha256": sha256_bytes(canonical_json(selected_features)),
            "directoryOrdinalSha256": input_manifest["artifacts"]["directory-ordinals.arrow"]["sha256"],
            "selectedFeatureOrdinals": [row["ordinal"] for row in selected_features],
            "eligibleDirectoryCount": int(eligible.sum()),
            "abstainedNoStructuralFeatures": int((~eligible).sum()),
            "transformation": "log1p(nonnegative inventory counts), then per-directory L2 normalization; zero-feature directories abstain",
        },
        "method": {"algorithm": "KMeans", "clusters": args.clusters, "seed": args.seed, "nInit": args.n_init, "maxIter": args.max_iter, "featureScope": "PATH_INVENTORY_COUNT, PATH_SOURCE_CLASS_INVENTORY_COUNT, PROFILE_INVENTORY_COUNT only"},
        "comparison": {
            "cpuBackend": "scikit-learn KMeans",
            "gpuBackend": "cuML KMeans",
            "adjustedRandIndex": ari,
            "cpuElapsedSeconds": cpu_elapsed,
            "gpuElapsedSeconds": gpu_elapsed,
            "cpuInertia": float(cpu_model.inertia_),
            "gpuInertia": float(gpu_model.inertia_),
            "canonicalizedLabelsMatch": bool(np.array_equal(cpu_canonical, gpu_canonical)),
        },
        "gpu": gpu,
        "clusters": cluster_summaries,
        "output": {"artifactPath": str(assignment_path.relative_to(root)).replace(os.sep, "/"), "bytes": len(assignment_bytes), "sha256": sha256_bytes(assignment_bytes)},
        "interpretation": "Run-local inventory taxonomy proposals only. Cluster IDs are not feature labels, source identity, semantic similarity, relevance truth, or authorization to modify stores.",
    }
    receipt["receiptSha256"] = sha256_bytes(canonical_json(receipt))
    receipt_path = output_dir / "receipt.json"
    with receipt_path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(receipt, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"receiptPath": str(receipt_path.relative_to(root)).replace(os.sep, "/"), "receiptSha256": receipt["receiptSha256"], "status": receipt["status"], "eligibleDirectories": int(eligible.sum()), "abstained": int((~eligible).sum()), "adjustedRandIndex": ari, "cpuSeconds": cpu_elapsed, "gpuSeconds": gpu_elapsed, "peakObservedGpuUsedMiB": gpu["peakObservedUsedMiB"]}, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--input-manifest", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--clusters", type=int, default=12)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-init", type=int, default=3)
    parser.add_argument("--max-iter", type=int, default=100)
    parser.add_argument("--minimum-free-mib", type=int, default=1536)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{3,63}", args.run_id):
        parser.error("run-id must be 4-64 lowercase letters, digits, or hyphens and start alphanumeric")
    if args.clusters < 2 or args.n_init < 1 or args.max_iter < 1 or args.minimum_free_mib < 1536:
        parser.error("clusters >= 2, n-init >= 1, max-iter >= 1, minimum-free-mib >= 1536 required")
    run(args)


if __name__ == "__main__":
    main()
