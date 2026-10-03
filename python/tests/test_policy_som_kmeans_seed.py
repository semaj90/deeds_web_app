import hashlib
from dataclasses import replace

import numpy as np
import pytest

torch = pytest.importorskip("torch")

from atlas_compute.rapids_matrix import RapidsKMeansArtifact, RapidsKMeansReceipt
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
