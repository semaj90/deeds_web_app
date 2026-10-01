import numpy as np
import json
import subprocess
import sys
from hashlib import sha256
from pathlib import Path
import torch

from atlas_compute.latent_autoencoder import (
    NestedAutoencoderConfig,
    NestedSemanticAutoencoder,
    exact_knn_indices,
    knn_recall,
    nested_autoencoder_loss,
)
from provision_qdrant_latent256 import build_candidate_point, build_candidate_upsert_request


def test_embeddinggemma_input_and_requested_encoder_ladder():
    torch.manual_seed(7)
    model = NestedSemanticAutoencoder()
    source = torch.randn(8, 768)
    latent256, latent128, latent64 = model.encode(source)
    expected64 = torch.nn.functional.normalize(latent128[:, :64], p=2, dim=-1)
    assert model.config.input_dim == 768
    assert model.config.hidden_dim == 512
    assert model.encoder_512[0].in_features == 768
    assert model.encoder_512[0].out_features == 512
    assert model.encoder_256[0].in_features == 512
    assert model.encoder_256[0].out_features == 256
    assert model.encoder_128[0].in_features == 256
    assert model.encoder_128[0].out_features == 128
    assert latent256.shape == (8, 256)
    assert latent128.shape == (8, 128)
    assert latent64.shape == (8, 64)
    assert torch.allclose(latent64, expected64, atol=1e-6)
    assert not torch.allclose(latent128, torch.nn.functional.normalize(latent256[:, :128], p=2, dim=-1))


def test_forward_reconstructs_to_semantic_768_shape():
    model = NestedSemanticAutoencoder()
    outputs = model(torch.randn(4, 768))
    assert outputs['decoded256'].shape == (4, 768)
    assert outputs['decoded128'].shape == (4, 768)
    assert outputs['decoded64'].shape == (4, 768)


def test_nested_loss_is_finite():
    config = NestedAutoencoderConfig(seed=11)
    model = NestedSemanticAutoencoder(config)
    outputs = model(torch.randn(6, 768))
    loss, metrics = nested_autoencoder_loss(outputs, config)
    assert torch.isfinite(loss)
    assert metrics['loss'] >= 0
    assert metrics['mse256'] >= 0
    assert metrics['mse128'] >= 0
    assert metrics['mse64'] >= 0


def test_exact_knn_rejects_invalid_k():
    matrix = np.eye(4, dtype=np.float32)
    try:
        exact_knn_indices(matrix, 4)
    except ValueError as exc:
        assert 'k must be positive' in str(exc)
    else:
        raise AssertionError('expected invalid k rejection')


def test_knn_recall_is_one_for_identical_representation():
    rng = np.random.default_rng(5)
    matrix = rng.normal(size=(16, 12)).astype(np.float32)
    assert knn_recall(matrix, matrix.copy(), 3) == 1.0


def test_training_entrypoint_fails_closed_before_database_or_artifact_io():
    script = Path(__file__).with_name("train_latent_autoencoder.py")
    result = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, check=False)
    report = json.loads(result.stdout)
    assert result.returncode == 78
    assert report["status"] == "TRAINING_BLOCKED"
    assert report["encoderDimensions"] == [768, 512, 256, 128]
    assert report["outputs"]["latent_64"] == "normalized_prefix_of_latent_128"
    assert report["databaseRead"] is False
    assert report["trainingPerformed"] is False
    assert report["checkpointWritten"] is False


def test_training_plan_only_reports_candidate_without_io():
    script = Path(__file__).with_name("train_latent_autoencoder.py")
    result = subprocess.run([sys.executable, str(script), "--plan-only"], capture_output=True, text=True, check=False)
    report = json.loads(result.stdout)
    assert result.returncode == 0
    assert report["status"] == "TRAINING_BLOCKED"
    assert report["mode"] == "PLAN_ONLY"
    assert report["encoderDimensions"] == [768, 512, 256, 128]
    assert report["outputs"]["latent_64"] == "normalized_prefix_of_latent_128"
    assert report["outputs"]["topology4d"].startswith("separate_revisioned_projection")
    assert report["databaseRead"] is False
    assert report["checkpointWritten"] is False


def test_npm_training_aliases_use_the_guarded_python_candidate():
    repository = Path(__file__).resolve().parents[1]
    package = json.loads((repository / "sveltekit-frontend" / "package.json").read_text(encoding="utf-8"))
    scripts = package["scripts"]
    assert scripts["ae:train"] == "py -3.13 ../python/train_latent_autoencoder.py"
    assert scripts["ae:train:dry"] == "py -3.13 ../python/train_latent_autoencoder.py --plan-only"


def test_retired_qdrant_projection_apply_is_blocked_before_network_or_database_io():
    script = Path(__file__).with_name("provision_qdrant_latent256.py")
    result = subprocess.run(
        [sys.executable, str(script), "--apply", "--database-url", "postgresql://invalid", "--qdrant-url", "http://127.0.0.1:1"],
        capture_output=True,
        text=True,
        check=False,
    )
    lines = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
    plan = lines[0]
    assert result.returncode == 78
    assert plan["status"] == "PROJECTION_BLOCKED"
    assert plan["candidateArchitectureRevision"] == "atlas.latent-ae.768-512-256-128.v2"
    assert plan["outputs"]["latent_128"]["origin"] == "LEARNED_BOTTLENECK"
    assert plan["outputs"]["latent_64"]["origin"] == "NORMALIZED_PREFIX_OF_LATENT_128"
    assert plan["writes"] == {"postgres": False, "qdrant": False, "redisValkey": False}
    assert lines[1]["event"] == "apply_rejected"


def test_candidate_qdrant_point_has_all_named_vectors_and_revision_payload():
    revisions = {name: f"rep:{name}:v2" for name in ("latent_256", "latent_128", "latent_64")}
    row = {
        "projection_id": "12345678-1234-5678-1234-567812345678",
        "chunk_row_id": "22345678-1234-5678-1234-567812345678",
        "packet_key": "pkt:example:abc123",
        "source_ref": "src/example.ts",
        "source_revision": "sha256:" + "a" * 64,
        "workspace_revision": "sha256:" + "b" * 64,
        "source_digest": "sha256:" + "c" * 64,
        "semantic_input_digest": "sha256:" + "d" * 64,
        "semantic_model_revision": "embeddinggemma:artifact-sha256:" + "e" * 64,
        "tokenizer_revision": "tokenizer:artifact-sha256:" + "f" * 64,
        "checkpoint_digest": "sha256:" + "1" * 64,
        "training_receipt_digest": "sha256:" + "2" * 64,
        "training_input_snapshot_checksum": "sha256:" + "3" * 64,
        "tokenizer_revision_status": "CONFIGURED_NOT_RUNTIME_ATTESTED",
        "architecture_revision": "atlas.latent-ae.768-512-256-128.v2",
        "producer_revision": "atlas.train-latent-autoencoder:test-v2",
        "projection_revision": "latent-qdrant-projection:v2",
        "representation_revisions": revisions,
        "vectors": {
            "latent_256": [1.0] + [0.0] * 255,
            "latent_128": [1.0] + [0.0] * 127,
            "latent_64": [1.0] + [0.0] * 63,
        },
    }
    point = build_candidate_point(row)
    assert point["id"] == row["projection_id"]
    assert set(point["vector"]) == {"latent_256", "latent_128", "latent_64"}
    assert point["payload"]["canonical_id"] == row["packet_key"]
    assert point["payload"]["source_revision"] == row["source_revision"]
    assert point["payload"]["workspace_revision"] == row["workspace_revision"]
    assert point["payload"]["input_representation"] == "semantic_768"
    assert point["payload"]["input_dimensions"] == 768
    assert point["payload"]["canonical_input_column"] == "codebase_chunk_index.content_embedding_768"
    assert point["payload"]["representation_revisions"] == revisions
    assert point["payload"]["chunk_row_id"] == row["chunk_row_id"]
    assert set(point["payload"]["vector_digests"]) == {"latent_256", "latent_128", "latent_64"}
    assert point["payload"]["payload_checksum"].startswith("sha256:")
    assert point["payload"]["tokenizer_revision_status"] == "CONFIGURED_NOT_RUNTIME_ATTESTED"
    assert point["payload"]["canonical_authority"] is False
    payload_without_checksum = {key: value for key, value in point["payload"].items() if key != "payload_checksum"}
    expected_payload_checksum = "sha256:" + sha256(
        json.dumps(payload_without_checksum, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
    ).hexdigest()
    assert point["payload"]["payload_checksum"] == expected_payload_checksum
    request = build_candidate_upsert_request([row])
    assert request["method"] == "PUT"
    assert request["path"] == "/collections/codebase_chunks_latent_family_v2/points?wait=true"
    assert request["body"]["points"] == [point]
    try:
        build_candidate_upsert_request([row, row])
    except ValueError as exc:
        assert "duplicate projection IDs" in str(exc)
    else:
        raise AssertionError("expected duplicate projection IDs to be rejected")


def test_candidate_projection_plan_aligns_qdrant_119_and_drizzle_pgvector_contracts():
    script = Path(__file__).with_name("provision_qdrant_latent256.py")
    result = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, check=True)
    plan = json.loads(result.stdout)
    repository = Path(__file__).resolve().parents[1]
    drizzle_schema = (repository / "sveltekit-frontend/src/lib/server/db/schema/search-analytics.ts").read_text(encoding="utf-8")
    postgres_schema = (repository / "sveltekit-frontend/src/lib/server/db/schema-postgres.ts").read_text(encoding="utf-8")

    assert plan["candidateCollection"]["serverVersion"] == "1.19.0"
    assert plan["candidateCollection"]["status"] == "PLAN_ONLY_NOT_CREATED"
    assert plan["candidateCollection"]["vectors"] == {
        "latent_256": {"size": 256, "distance": "Cosine"},
        "latent_128": {"size": 128, "distance": "Cosine"},
        "latent_64": {"size": 64, "distance": "Cosine"},
    }
    pg = plan["postgresVectorContract"]
    assert pg["canonicalInput"] == {
        "table": "codebase_chunk_index",
        "column": "content_embedding_768",
        "pgType": "vector(768)",
        "drizzleBuilder": "vector",
        "dimensions": 768,
        "role": "CANONICAL_SEMANTIC_INPUT",
    }
    assert pg["derivedStorageDeclarations"] == {
        "latent_256": {"pgType": "halfvec(256)", "drizzleBuilder": "halfvec", "dimensions": 256},
        "latent_128": {"pgType": "halfvec(128)", "drizzleBuilder": "halfvec", "dimensions": 128},
        "latent_64": {"pgType": "vector(64)", "drizzleBuilder": "vector", "dimensions": 64},
    }
    for schema in (drizzle_schema, postgres_schema):
        assert "vector('content_embedding_768', { dimensions: 768 })" in schema
        assert "halfvec('latent_256', { dimensions: 256 })" in schema
        assert "halfvec('latent_128', { dimensions: 128 })" in schema
        assert "vector('latent_64', { dimensions: 64 })" in schema
    assert pg["migrationRequired"] is False
    assert plan["upsertContract"]["operation"] == "QDRANT_POINTS_UPSERT"
    assert plan["upsertContract"]["wait"] is True
    assert plan["upsertContract"]["executable"] is False
    assert "all named vectors and the complete payload" in plan["upsertContract"]["updateSemantics"]
    assert "topology4d" in plan["candidateCollection"]["excludedOutputs"]


def test_candidate_qdrant_point_rejects_incomplete_lineage_and_wrong_width():
    row = {
        "projection_id": "12345678-1234-5678-1234-567812345678",
        "chunk_row_id": "22345678-1234-5678-1234-567812345678",
        "packet_key": "pkt:example:abc123",
        "source_ref": "src/example.ts",
        "source_revision": "sha256:" + "a" * 64,
        "workspace_revision": "sha256:" + "b" * 64,
        "source_digest": "sha256:" + "c" * 64,
        "semantic_input_digest": "sha256:" + "d" * 64,
        "semantic_model_revision": "model:v2",
        "tokenizer_revision": "tokenizer:v2",
        "checkpoint_digest": "sha256:" + "1" * 64,
        "training_receipt_digest": "sha256:" + "2" * 64,
        "training_input_snapshot_checksum": "sha256:" + "3" * 64,
        "tokenizer_revision_status": "CONFIGURED_NOT_RUNTIME_ATTESTED",
        "architecture_revision": "atlas.latent-ae.768-512-256-128.v2",
        "producer_revision": "atlas.train-latent-autoencoder:test-v2",
        "projection_revision": "latent-qdrant-projection:v2",
        "representation_revisions": {name: f"rep:{name}:v2" for name in ("latent_256", "latent_128", "latent_64")},
        "vectors": {"latent_256": [1.0] + [0.0] * 255, "latent_128": [1.0] + [0.0] * 127, "latent_64": [1.0] + [0.0] * 62},
    }
    try:
        build_candidate_point({key: value for key, value in row.items() if key != "workspace_revision"})
    except ValueError as exc:
        assert "workspace_revision" in str(exc)
    else:
        raise AssertionError("expected missing workspace lineage to be rejected")
    try:
        build_candidate_point(row)
    except ValueError as exc:
        assert "latent_64" in str(exc)
    else:
        raise AssertionError("expected malformed latent_64 width to be rejected")


def test_candidate_qdrant_point_rejects_latent64_that_is_not_normalized_latent128_prefix():
    revisions = {name: f"rep:{name}:v2" for name in ("latent_256", "latent_128", "latent_64")}
    latent128 = [0.0] * 128
    latent128[0] = 0.6
    latent128[1] = 0.8
    row = {
        "projection_id": "12345678-1234-5678-1234-567812345678",
        "chunk_row_id": "22345678-1234-5678-1234-567812345678",
        "packet_key": "pkt:example:abc123",
        "source_ref": "src/example.ts",
        "source_revision": "sha256:" + "a" * 64,
        "workspace_revision": "sha256:" + "b" * 64,
        "source_digest": "sha256:" + "c" * 64,
        "semantic_input_digest": "sha256:" + "d" * 64,
        "semantic_model_revision": "model:v2",
        "tokenizer_revision": "tokenizer:v2",
        "checkpoint_digest": "sha256:" + "1" * 64,
        "training_receipt_digest": "sha256:" + "2" * 64,
        "training_input_snapshot_checksum": "sha256:" + "3" * 64,
        "tokenizer_revision_status": "CONFIGURED_NOT_RUNTIME_ATTESTED",
        "architecture_revision": "atlas.latent-ae.768-512-256-128.v2",
        "producer_revision": "atlas.train-latent-autoencoder:test-v2",
        "projection_revision": "latent-qdrant-projection:v2",
        "representation_revisions": revisions,
        "vectors": {
            "latent_256": [1.0] + [0.0] * 255,
            "latent_128": latent128,
            "latent_64": [1.0] + [0.0] * 63,
        },
    }
    try:
        build_candidate_point(row)
    except ValueError as exc:
        assert "normalized 64-coordinate prefix" in str(exc)
    else:
        raise AssertionError("expected latent_64 derivation mismatch to be rejected")
