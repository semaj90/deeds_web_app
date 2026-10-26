import hashlib
from dataclasses import replace

import numpy as np
import pytest

torch = pytest.importorskip("torch")

from atlas_compute.rapids_matrix import (
    RapidsKMeansArtifact,
    RapidsKMeansReceipt,
    build_kmeans_ordinal_assignments_v1,
)
from atlas_compute.som import train_deterministic_som


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def _kmeans_artifact(matrix: np.ndarray, centroids: np.ndarray) -> RapidsKMeansArtifact:
    receipt = RapidsKMeansReceipt(
        schema="atlas.rapids-kmeans-receipt.v2",
        rows=int(matrix.shape[0]),
        dimensions=int(matrix.shape[1]),
        n_clusters=int(centroids.shape[0]),
        metric="sqeuclidean",
        init_method="deterministic_farthest_first_array",
        initialization_ordinals=[0, 3],
        iterations=2,
        inertia=0.5,
        labels_checksum="0" * 64,
        input_checksum=_checksum(matrix),
        centroids_checksum=_checksum(centroids),
        canonical_authority=False,
    )
    return RapidsKMeansArtifact(receipt=receipt, centroids=centroids.copy())


def test_som_seeds_from_checksum_bound_kmeans_centroids_deterministically() -> None:
    matrix = np.asarray([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=np.float32)
    centroids = np.asarray([[0.1, 0.1], [0.9, 0.9]], dtype=np.float32)
    artifact = _kmeans_artifact(matrix, centroids)

    coords_a, codebook_a, som_receipt_a = train_deterministic_som(
        matrix,
        grid_rows=1,
        grid_columns=2,
        epochs=2,
        device="cpu",
        kmeans_artifact=artifact,
    )
    coords_b, codebook_b, som_receipt_b = train_deterministic_som(
        matrix,
        grid_rows=1,
        grid_columns=2,
        epochs=2,
        device="cpu",
        kmeans_artifact=artifact,
    )

    assert torch.equal(coords_a, coords_b)
    assert torch.equal(codebook_a, codebook_b)
    assert som_receipt_a.to_dict() == som_receipt_b.to_dict()
    assert som_receipt_a.schema == "atlas.som-receipt.v2"
    assert som_receipt_a.initialization_method == "checksum_verified_cuvs_kmeans_centroids"
    assert som_receipt_a.initial_centroids_checksum == _checksum(centroids)
    assert som_receipt_a.initialization_receipt_checksum
    assert som_receipt_a.canonical_authority is False


def test_som_pca_lattice_initialization_is_deterministic_and_explicit() -> None:
    matrix = np.asarray(
        [[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, -1.0]],
        dtype=np.float32,
    )

    coords_a, codebook_a, receipt_a = train_deterministic_som(
        matrix, grid_rows=2, grid_columns=2, epochs=2, device="cpu", initialization="pca_lattice_v1"
    )
    coords_b, codebook_b, receipt_b = train_deterministic_som(
        matrix, grid_rows=2, grid_columns=2, epochs=2, device="cpu", initialization="pca_lattice_v1"
    )

    assert torch.equal(coords_a, coords_b)
    assert torch.equal(codebook_a, codebook_b)
    assert receipt_a.to_dict() == receipt_b.to_dict()
    assert receipt_a.initialization_method == "pca_lattice_v1"
    assert receipt_a.canonical_authority is False


def test_som_pca_perturbation_is_seeded_and_receipt_bound() -> None:
    matrix = np.asarray(
        [[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, -1.0]],
        dtype=np.float32,
    )
    options = {
        "grid_rows": 2,
        "grid_columns": 2,
        "epochs": 2,
        "device": "cpu",
        "initialization": "pca_lattice_v1",
        "initialization_perturbation": 0.05,
    }

    _, codebook_a, receipt_a = train_deterministic_som(matrix, seed=11, **options)
    _, codebook_replay, receipt_replay = train_deterministic_som(matrix, seed=11, **options)
    _, codebook_b, receipt_b = train_deterministic_som(matrix, seed=12, **options)

    assert torch.equal(codebook_a, codebook_replay)
    assert receipt_a.to_dict() == receipt_replay.to_dict()
    assert not torch.equal(codebook_a, codebook_b)
    assert receipt_a.seed == 11
    assert receipt_a.initialization_perturbation == 0.05
    assert receipt_a.initial_centroids_checksum != receipt_b.initial_centroids_checksum


def test_som_batch_neighborhood_update_is_deterministic_and_receipted() -> None:
    matrix = np.asarray(
        [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0], [0.5, 0.5]],
        dtype=np.float32,
    )
    options = {
        "grid_rows": 2,
        "grid_columns": 2,
        "epochs": 3,
        "device": "cpu",
        "initialization": "pca_lattice_v1",
        "update_rule": "batch_neighborhood_v1",
        "assignment_batch_rows": 2,
    }

    coords_a, codebook_a, receipt_a = train_deterministic_som(matrix, **options)
    coords_b, codebook_b, receipt_b = train_deterministic_som(matrix, **options)

    assert torch.equal(coords_a, coords_b)
    assert torch.equal(codebook_a, codebook_b)
    assert receipt_a.to_dict() == receipt_b.to_dict()
    assert receipt_a.update_rule == "batch_neighborhood_v1"
    assert receipt_a.quantization_error >= 0


def test_som_rejects_invalid_batch_training_options() -> None:
    matrix = np.asarray([[0.0, 0.0], [1.0, 1.0]], dtype=np.float32)

    with pytest.raises(ValueError, match="UNSUPPORTED_SOM_UPDATE_RULE"):
        train_deterministic_som(matrix, grid_rows=1, grid_columns=2, epochs=1, device="cpu", update_rule="unknown")
    with pytest.raises(ValueError, match="assignment_batch_rows must be positive"):
        train_deterministic_som(matrix, grid_rows=1, grid_columns=2, epochs=1, device="cpu", assignment_batch_rows=0)


def test_som_pca_lattice_rejects_conflicting_kmeans_artifact() -> None:
    matrix = np.asarray([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=np.float32)
    artifact = _kmeans_artifact(matrix, np.asarray([[0.1, 0.1], [0.9, 0.9]], dtype=np.float32))

    with pytest.raises(ValueError, match="SOM_INITIALIZATION_CONFLICT"):
        train_deterministic_som(
            matrix,
            grid_rows=1,
            grid_columns=2,
            epochs=1,
            device="cpu",
            kmeans_artifact=artifact,
            initialization="pca_lattice_v1",
        )


def test_som_rejects_centroid_checksum_or_input_revision_mismatch() -> None:
    matrix = np.asarray([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=np.float32)
    centroids = np.asarray([[0.1, 0.1], [0.9, 0.9]], dtype=np.float32)
    artifact = _kmeans_artifact(matrix, centroids)
    artifact = RapidsKMeansArtifact(
        receipt=replace(artifact.receipt, input_checksum="wrong"),
        centroids=artifact.centroids,
    )

    with pytest.raises(ValueError, match="KMEANS_RECEIPT_MISMATCH:input_checksum"):
        train_deterministic_som(
            matrix,
            grid_rows=1,
            grid_columns=2,
            epochs=1,
            device="cpu",
            kmeans_artifact=artifact,
        )


def test_kmeans_labels_bind_to_stable_candidate_ordinals_and_revision() -> None:
    labels = np.asarray([1, 0, 1], dtype=np.int64)
    centroids = np.asarray([[0.0, 0.0], [1.0, 1.0]], dtype=np.float32)
    receipt = RapidsKMeansReceipt(
        schema="atlas.rapids-kmeans-receipt.v2",
        rows=3,
        dimensions=2,
        n_clusters=2,
        metric="sqeuclidean",
        init_method="deterministic_farthest_first_array",
        initialization_ordinals=[0, 1],
        iterations=3,
        inertia=0.25,
        labels_checksum=_checksum(labels),
        input_checksum="a" * 64,
        centroids_checksum=_checksum(centroids),
        canonical_authority=False,
    )
    artifact = RapidsKMeansArtifact(receipt=receipt, centroids=centroids, labels=labels)
    kwargs = {
        "candidate_identity_bindings": [
            {
                "candidateOrdinal": ordinal,
                "packetKey": f"packet:{ordinal}",
                "sourceRef": f"src/{ordinal}.ts",
                "sourceRevision": "sha256:" + "a" * 64,
                "domainId": "domain:test",
                "featureId": "feature:test",
                "featureLabel": "Test Feature",
                "taxonomyRevision": "sha256:" + "d" * 64,
            }
            for ordinal in (10, 5, 7)
        ],
        "workspace_revision": "sha256:" + "b" * 64,
        "representation_revision": "sha256:" + "c" * 64,
    }
    assignments = build_kmeans_ordinal_assignments_v1(artifact, [10, 5, 7], **kwargs)
    assert assignments["assignments"] == [
        {"candidateOrdinal": 5, "kmeansClusterId": 0},
        {"candidateOrdinal": 7, "kmeansClusterId": 1},
        {"candidateOrdinal": 10, "kmeansClusterId": 1},
    ]
    assert assignments["assignmentRevision"].startswith("sha256:")
    assert assignments["authority"] == "PROPOSAL_ONLY"
    assert assignments["promotionEligible"] is False
    assert artifact.labels is not None and not artifact.labels.flags.writeable
    with pytest.raises(ValueError, match="ORDINALS_MUST_BE_UNIQUE"):
        build_kmeans_ordinal_assignments_v1(artifact, [5, 5, 7], **kwargs)


def test_som_rejects_bad_centroid_shape_and_unpaired_metadata() -> None:
    matrix = np.asarray([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=np.float32)
    centroids = np.asarray([[0.1, 0.1]], dtype=np.float32)
    artifact = _kmeans_artifact(matrix, centroids)

    with pytest.raises(ValueError, match="KMEANS_CENTROID_SHAPE_MISMATCH"):
        train_deterministic_som(
            matrix,
            grid_rows=1,
            grid_columns=2,
            epochs=1,
            device="cpu",
            kmeans_artifact=artifact,
        )


def test_som_rejects_nonfinite_inputs_and_centroids() -> None:
    matrix = np.asarray([[0, 0], [1, 0], [0, 1], [1, 1]], dtype=np.float32)
    centroids = np.asarray([[0.1, 0.1], [np.nan, 0.9]], dtype=np.float32)
    artifact = _kmeans_artifact(matrix, centroids)
    with pytest.raises(ValueError, match="KMEANS_CENTROIDS_NONFINITE"):
        train_deterministic_som(
            matrix,
            grid_rows=1,
            grid_columns=2,
            epochs=1,
            device="cpu",
            kmeans_artifact=artifact,
        )

    invalid_matrix = matrix.copy()
    invalid_matrix[0, 0] = np.inf
    with pytest.raises(ValueError, match="matrix must contain only finite"):
        train_deterministic_som(invalid_matrix, grid_rows=1, grid_columns=2, epochs=1, device="cpu")
