from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .som import train_deterministic_som


def _file_sha256(path: str | Path) -> str:
    digest = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def split_rows_by_source_ref_v1(source_refs: Sequence[str], *, seed: int = 20261019) -> np.ndarray:
    if not source_refs:
        raise ValueError("source_refs must not be empty")
    normalized_refs: list[str] = []
    strata: dict[str, set[str]] = defaultdict(set)
    for ordinal, value in enumerate(source_refs):
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"INVALID_SOURCE_REF_AT:{ordinal}")
        source_ref = value.strip().replace("\\", "/")
        normalized_refs.append(source_ref)
        path_parts = source_ref.split("/")
        stratum = "/".join(path_parts[:2]) if len(path_parts) >= 3 else (path_parts[0] if len(path_parts) > 1 else ".")
        strata[stratum].add(source_ref)

    assignments: dict[str, bool] = {}
    for stratum, paths in strata.items():
        ordered_paths = sorted(
            paths,
            key=lambda value: (
                hashlib.sha256(f"{seed}\0{value}".encode("utf-8")).digest(),
                value,
            ),
        )
        assignments.update({value: index % 2 == 1 for index, value in enumerate(ordered_paths)})

    result = np.fromiter((assignments[value] for value in normalized_refs), dtype=np.bool_, count=len(normalized_refs))
    if result.all() or not result.any():
        raise ValueError("FILE_SPLIT_MUST_HAVE_TRAIN_AND_TEST_ROWS")
    return result


def _top_two_bmus(matrix: np.ndarray, codebook: np.ndarray, batch_rows: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    row_count = matrix.shape[0]
    first = np.empty(row_count, dtype=np.int32)
    second = np.empty(row_count, dtype=np.int32)
    minimum = np.empty(row_count, dtype=np.float32)
    code_norms = np.sum(codebook * codebook, axis=1, dtype=np.float32)
    for start in range(0, row_count, batch_rows):
        end = min(start + batch_rows, row_count)
        batch = matrix[start:end]
        distances = (
            np.sum(batch * batch, axis=1, keepdims=True, dtype=np.float32)
            + code_norms.reshape(1, -1)
            - 2.0 * np.matmul(batch, codebook.T)
        )
        np.maximum(distances, 0.0, out=distances)
        order = np.argsort(distances, axis=1, kind="stable")[:, :2]
        rows = np.arange(end - start)
        first[start:end] = order[:, 0]
        second[start:end] = order[:, 1]
        minimum[start:end] = distances[rows, order[:, 0]]
    return first, second, minimum


def evaluate_som_projection_v1(
    matrix: np.ndarray,
    codebook: np.ndarray,
    knn_indices: np.ndarray,
    evaluation_mask: np.ndarray,
    *,
    grid_rows: int = 20,
    grid_columns: int = 20,
    batch_rows: int = 4096,
) -> dict[str, Any]:
    values = np.asarray(matrix, dtype=np.float32)
    weights = np.asarray(codebook, dtype=np.float32)
    neighbors = np.asarray(knn_indices, dtype=np.int64)
    selected = np.asarray(evaluation_mask, dtype=np.bool_)
    if values.ndim != 2 or values.shape[0] == 0 or values.shape[1] == 0:
        raise ValueError("matrix must be non-empty rank-2")
    if weights.ndim != 2 or weights.shape[1] != values.shape[1] or weights.shape[0] != grid_rows * grid_columns:
        raise ValueError("codebook shape does not match matrix and grid")
    if neighbors.ndim != 2 or neighbors.shape[0] != values.shape[0] or neighbors.shape[1] == 0:
        raise ValueError("knn_indices must have one non-empty row per vector")
    if selected.shape != (values.shape[0],) or not selected.any():
        raise ValueError("evaluation_mask must select at least one row")
    if np.any(neighbors < 0) or np.any(neighbors >= values.shape[0]):
        raise ValueError("knn_indices contain an out-of-range row")
    if batch_rows <= 0:
        raise ValueError("batch_rows must be positive")
    if not np.isfinite(values).all() or not np.isfinite(weights).all():
        raise ValueError("matrix and codebook must be finite")

    first, second, minimum = _top_two_bmus(values, weights, batch_rows)
    first_coords = np.column_stack((first // grid_columns, first % grid_columns))
    second_coords = np.column_stack((second // grid_columns, second % grid_columns))
    topology_distance_squared = np.sum((first_coords - second_coords) ** 2, axis=1)
    selected_rows = np.flatnonzero(selected)
    neighbor_coords = first_coords[neighbors[selected_rows]]
    deltas = np.abs(first_coords[selected_rows, None, :] - neighbor_coords)
    preserved = np.max(deltas, axis=2) <= 2
    occupancy = np.bincount(first[selected_rows], minlength=grid_rows * grid_columns)

    return {
        "rows": int(selected_rows.size),
        "quantizationError": float(np.sqrt(minimum[selected_rows]).mean(dtype=np.float64)),
        "topographicErrorEuclidean1": float(np.mean(topology_distance_squared[selected_rows] > 1)),
        "neighborPreservationChebyshev2": float(preserved.mean()),
        "occupiedCells": int(np.count_nonzero(occupancy)),
        "cellCount": int(occupancy.size),
        "occupancyMin": int(occupancy.min()),
        "occupancyMax": int(occupancy.max()),
    }


def assess_som_holdout_gate_v1(
    runs: Sequence[dict[str, Any]],
    *,
    max_topographic_error: float = 0.085,
    min_neighbor_preservation: float = 0.65,
) -> dict[str, Any]:
    if not runs:
        raise ValueError("HOLDOUT_RUNS_REQUIRED")
    worst_topographic_error = max(float(run["testMetrics"]["topographicErrorEuclidean1"]) for run in runs)
    worst_neighbor_preservation = min(float(run["testMetrics"]["neighborPreservationChebyshev2"]) for run in runs)
    metrics_pass = (
        worst_topographic_error <= max_topographic_error
        and worst_neighbor_preservation >= min_neighbor_preservation
    )
    return {
        "metricStatus": "PASS" if metrics_pass else "FAIL",
        "worstTestTopographicErrorEuclidean1": worst_topographic_error,
        "worstTestNeighborPreservationChebyshev2": worst_neighbor_preservation,
        "thresholds": {
            "maxTopographicErrorEuclidean1": max_topographic_error,
            "minNeighborPreservationChebyshev2": min_neighbor_preservation,
        },
        "productionAdmission": False,
        "blockedBy": ["FREEZE_LOCAL_ORDINALS_ARE_NOT_CANONICAL", "VECTOR_AND_KNN_ROW_IDENTITY_NOT_INDEPENDENTLY_VERIFIED"],
    }


def run_frozen_som_holdout_v1(
    *,
    source_refs: Sequence[str],
    manifest_sha256: str,
    freeze_local_ordinal_map_checksum: str,
    vectors_path: str | Path,
    knn_path: str | Path,
    seeds: Sequence[int] = (20261019, 1, 2),
    epochs: int = 150,
    initialization_perturbation: float = 0.05,
    assignment_batch_rows: int = 4096,
) -> dict[str, Any]:
    if len(source_refs) != 98_335:
        raise ValueError("FROZEN_CORPUS_ROW_COUNT_MISMATCH")
    if len(seeds) < 2 or len(set(seeds)) != len(seeds):
        raise ValueError("MULTI_SEED_RUN_REQUIRES_UNIQUE_SEEDS")
    if len(freeze_local_ordinal_map_checksum) != 64 or any(
        character not in "0123456789abcdef" for character in freeze_local_ordinal_map_checksum.lower()
    ):
        raise ValueError("INVALID_FREEZE_LOCAL_ORDINAL_MAP_CHECKSUM")
    vector_checksum = _file_sha256(vectors_path)
    knn_checksum = _file_sha256(knn_path)
    raw_vectors = np.load(vectors_path, mmap_mode="r")
    knn_indices = np.load(knn_path, mmap_mode="r")
    if raw_vectors.shape != (len(source_refs), 768) or raw_vectors.dtype != np.float32:
        raise ValueError("FROZEN_VECTOR_SHAPE_OR_DTYPE_MISMATCH")
    if knn_indices.shape[0] != len(source_refs):
        raise ValueError("FROZEN_KNN_ROW_COUNT_MISMATCH")

    split_mask = split_rows_by_source_ref_v1(source_refs)
    feature_matrix = np.array(raw_vectors[:, :256], dtype=np.float32, order="C", copy=True)
    norms = np.linalg.norm(feature_matrix, axis=1, keepdims=True)
    if np.any(norms <= 1e-12):
        raise ValueError("ZERO_NORM_PREFIX_IN_FROZEN_CORPUS")
    feature_matrix /= norms
    if not np.isfinite(feature_matrix).all():
        raise ValueError("NONFINITE_NORMALIZED_PREFIX")

    manifest_hash = hashlib.sha256(Path(".tmp/atlas/frozen-corpus-03-manifest.tsv").read_bytes()).hexdigest()
    if manifest_hash != manifest_sha256:
        raise ValueError("FROZEN_MANIFEST_CHECKSUM_MISMATCH")
    input_checksum = hashlib.sha256(np.ascontiguousarray(feature_matrix).tobytes()).hexdigest()
    train_mask = ~split_mask
    train_features = feature_matrix[train_mask]
    runs = []
    for seed in seeds:
        _, codebook_tensor, receipt = train_deterministic_som(
            train_features,
            grid_rows=20,
            grid_columns=20,
            epochs=epochs,
            device="cpu",
            seed=int(seed),
            initialization="pca_lattice_v1",
            initialization_perturbation=initialization_perturbation,
            update_rule="batch_neighborhood_v1",
            assignment_batch_rows=assignment_batch_rows,
        )
        codebook = codebook_tensor.detach().cpu().numpy().astype(np.float32, copy=False)
        runs.append({
            "seed": int(seed),
            "initializationPerturbation": float(initialization_perturbation),
            "trainingReceipt": receipt.to_dict(),
            "trainMetrics": evaluate_som_projection_v1(
                feature_matrix, codebook, knn_indices, train_mask, batch_rows=assignment_batch_rows
            ),
            "testMetrics": evaluate_som_projection_v1(
                feature_matrix, codebook, knn_indices, split_mask, batch_rows=assignment_batch_rows
            ),
        })

    return {
        "schema": "atlas.frozen-corpus-som-holdout.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestSha256": manifest_sha256,
        "workspaceRevision": "sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc",
        "rows": len(source_refs),
        "files": len(set(source_refs)),
        "input": {
            "representation": "frozen-corpus-03 semantic_768 leading 256 dimensions",
            "normalization": "row L2 after prefix selection",
            "checksum": input_checksum,
            "artifacts": {
                "vectorsSha256": vector_checksum,
                "knnIndicesSha256": knn_checksum,
                "freezeLocalOrdinalMapChecksum": freeze_local_ordinal_map_checksum,
                "canonicalCandidateOrdinalBinding": False,
                "artifactRowIdentityIndependentlyVerified": False,
            },
            "split": {
                "algorithm": "within each top-level/module stratum, sort unique slash-normalized source refs by SHA-256(seed || NUL || path); alternating files select test",
                "seed": 20261019,
                "unit": "file; every chunk in a file is assigned to one partition, balanced within each stratum",
                "trainFiles": len({source_refs[i] for i in np.flatnonzero(train_mask)}),
                "testFiles": len({source_refs[i] for i in np.flatnonzero(split_mask)}),
                "trainRows": int(train_mask.sum()),
                "testRows": int(split_mask.sum()),
                "assignmentChecksum": hashlib.sha256(split_mask.tobytes()).hexdigest(),
            },
            "knn": {"shape": list(knn_indices.shape), "k": int(knn_indices.shape[1])},
        },
        "training": {
            "executor": "PyTorch CPU float32",
            "updateRule": "batch_neighborhood_v1",
            "initialization": "pca_lattice_v1",
            "grid": [20, 20],
            "epochs": int(epochs),
            "seeds": [int(seed) for seed in seeds],
            "initializationPerturbation": float(initialization_perturbation),
            "assignmentBatchRows": int(assignment_batch_rows),
        },
        "metricDefinitions": {
            "topographicErrorEuclidean1": "fraction whose first and second BMUs are farther than one Euclidean grid unit apart; diagonal cells are not adjacent",
            "neighborPreservationChebyshev2": "fraction of frozen full-corpus exact 768-D kNN edges whose mapped BMUs are at Chebyshev distance at most two",
        },
        "runs": runs,
        "holdoutGate": assess_som_holdout_gate_v1(runs),
        "canonicalAuthority": False,
        "writesPerformed": False,
        "gpuExecuted": False,
        "promotionStatus": "CANDIDATE_ONLY_NOT_ADMITTED",
    }


def main() -> None:
    import argparse
    import sys

    parser = argparse.ArgumentParser()
    parser.add_argument("--vectors", default=".tmp/atlas/frozen-corpus-03-768.npy")
    parser.add_argument("--knn", default=".tmp/atlas/frozen-corpus-03-knn10-idx.npy")
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--freeze-local-ordinal-map-checksum", required=True)
    parser.add_argument("--output", default=".tmp/atlas/frozen-corpus-som-holdout-v2.json")
    parser.add_argument("--epochs", type=int, default=150)
    parser.add_argument("--seeds", type=int, nargs="+", default=[20261019, 1, 2])
    parser.add_argument("--jitter", type=float, default=0.05)
    args = parser.parse_args()
    payload = json.load(sys.stdin)
    report = run_frozen_som_holdout_v1(
        source_refs=payload["sourceRefs"],
        manifest_sha256=args.manifest_sha256,
        freeze_local_ordinal_map_checksum=args.freeze_local_ordinal_map_checksum,
        vectors_path=args.vectors,
        knn_path=args.knn,
        seeds=args.seeds,
        epochs=args.epochs,
        initialization_perturbation=args.jitter,
    )
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"reportPath": str(output_path), "runs": len(report["runs"]), "canonicalAuthority": False, "writesPerformed": False}))


if __name__ == "__main__":
    main()
