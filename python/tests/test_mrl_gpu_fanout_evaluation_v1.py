import hashlib
import json

import numpy as np
import pytest

from atlas_compute.mrl_gpu_fanout_evaluation_v1 import (
    evaluate_mrl_snapshot_v1,
    load_frozen_training_snapshot,
)


def make_snapshot(tmp_path):
    row_count = 12
    matrix = np.arange(row_count * 768, dtype="<f4").reshape(row_count, 768) + 1
    matrix_path = tmp_path / "matrix.f32bin"
    matrix_bytes = matrix.tobytes(order="C")
    matrix_path.write_bytes(matrix_bytes)
    ordinal_rows = [
        {"ordinal": index, "id": f"row:{index}", "sourceRef": f"src/{index}.py"}
        for index in range(row_count)
    ]
    ordinal_bytes = json.dumps(ordinal_rows).encode("utf-8")
    ordinal_path = tmp_path / "ordinals.json"
    ordinal_path.write_bytes(ordinal_bytes)
    manifest = {
        "schema": "atlas.frozen-semantic768-training-snapshot.v1",
        "rowCount": row_count,
        "embeddingDim": 768,
        "matrixPath": "matrix.f32bin",
        "matrixChecksum": hashlib.sha256(matrix_bytes).hexdigest(),
        "matrixEncoding": "IEEE754_F32LE",
        "matrixLayout": "row-major, shape [N, 768], no header",
        "ordinalMapPath": "ordinals.json",
        "ordinalMapChecksum": hashlib.sha256(ordinal_bytes).hexdigest(),
        "sourceColumn": "codebase_chunk_index.content_embedding",
        "canonicalSourceColumn": None,
        "lineageQualification": "NOT_PROVEN",
        "modelIdentityQualification": "NOT_PROVEN",
        "sourceRefCoverage": row_count,
    }
    manifest_path = tmp_path / "snapshot.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    return manifest_path, matrix_path, manifest


def test_load_verifies_matrix_and_ordinal_artifacts(tmp_path):
    manifest_path, _, _ = make_snapshot(tmp_path)

    matrix, manifest, ordinals, ids = load_frozen_training_snapshot(
        manifest_path,
        repository_root=tmp_path,
    )

    assert matrix.shape == (12, 768)
    assert manifest["rowCount"] == 12
    assert len(ordinals) == len(ids) == 12


def test_loader_rejects_matrix_checksum_mismatch(tmp_path):
    manifest_path, matrix_path, manifest = make_snapshot(tmp_path)
    matrix_path.write_bytes(matrix_path.read_bytes() + b"x")

    with pytest.raises(ValueError, match="BYTE_LENGTH_MISMATCH"):
        load_frozen_training_snapshot(manifest_path, repository_root=tmp_path)

    manifest["matrixPath"] = "missing.f32bin"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(FileNotFoundError):
        load_frozen_training_snapshot(manifest_path, repository_root=tmp_path)


def test_cpu_mrl_evaluation_stays_non_promotional_without_lineage(tmp_path):
    manifest_path, _, _ = make_snapshot(tmp_path)

    receipt = evaluate_mrl_snapshot_v1(
        manifest_path,
        repository_root=tmp_path,
        device="cpu",
        query_count=3,
        top_k=2,
        batch_rows=4,
    )

    assert receipt["status"] == "EVALUATED_FANOUT_BLOCKED"
    assert receipt["fanoutEligible"] is False
    assert receipt["databaseWrites"] == 0
    assert set(receipt["projections"]) == {"512", "256", "128"}
    assert receipt["execution"]["cpuExactTopKParity"] is True
    assert all(receipt["execution"]["cpuProjectionParity"].values())
    assert "SOURCE_LINEAGE_NOT_PROVEN" in receipt["lineageBlockers"]
    assert "CANONICAL_PACKET_ID_NOT_PRESENT_IN_ORDINAL_MAP" in receipt["lineageBlockers"]
    assert receipt["indexPlan"]["status"] == "PROPOSAL_ONLY_NOT_APPLIED"
