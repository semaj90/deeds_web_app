"""Tests for P3/P4 domain representation tournament, train-only PCA, and ONNX batch parity."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]


def _load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_mrl_pca_tournament_and_onnx_batch_parity(tmp_path: Path) -> None:
    val = _load("validate_domain_gold_labels_v1", "scripts/eval/validate_domain_gold_labels_v1.py")
    trn = _load("train_domain_classifier_v1", "scripts/eval/train_domain_classifier_v1.py")
    trn_tour = _load("domain_representation_tournament_v1", "scripts/eval/domain_representation_tournament_v1.py")

    rng = np.random.default_rng(7)
    rows = []
    vecs = {}
    for c_idx, cls_name in enumerate(val.CLASSES):
        proto = np.zeros(32, dtype=np.float32)
        proto[c_idx] = 5.0
        for i in range(60):
            cid = f"t_{c_idx}_{i}"
            rows.append(
                {
                    "chunk_id": cid,
                    "source_ref": f"src/{cls_name}/f_{i // 2}.ts",
                    "sha256": f"sha_{c_idx}_{i}",
                    "proposed_label": cls_name,
                    "gold_label": cls_name,
                    "status": "reviewed",
                }
            )
            vecs[cid] = proto + rng.normal(0.0, 0.15, size=32).astype(np.float32)

    tour = trn_tour.run_mrl_and_pca_tournament(rows, vecs, mrl_dims=(32, 16), pca_dim=16)
    assert tour["canonical_authority"] is False
    assert tour["group_leakage_count"] == 0
    assert len(tour["challengers"]) == 3  # mrl 32, mrl 16, pca 16
    assert all(c["test_accuracy"] >= 0.9 for c in tour["challengers"])

    npz_path = tmp_path / "model.npz"
    onnx_path = tmp_path / "model.onnx"
    trn.train_and_evaluate_linear_classifier(rows, vecs, model_path=npz_path)
    export_meta = trn_tour.export_linear_model_to_onnx_v1(npz_path, onnx_path)
    assert onnx_path.exists()
    assert export_meta["input_dim"] == 32

    sample_x = np.vstack([vecs[r["chunk_id"]] for r in rows[:32]])
    parity = trn_tour.verify_onnx_batch_parity_v1(npz_path, onnx_path, sample_x, batch_sizes=(1, 8, 32))
    assert parity["passed"] is True
    assert parity["max_abs_diff"] < 1e-5


def test_pytorch_mlp_challenger_and_eg2_source_validation() -> None:
    val = _load("validate_domain_gold_labels_v1", "scripts/eval/validate_domain_gold_labels_v1.py")
    trn = _load("train_domain_classifier_v1", "scripts/eval/train_domain_classifier_v1.py")
    trn_tour = _load("domain_representation_tournament_v1", "scripts/eval/domain_representation_tournament_v1.py")

    with pytest.raises(ValueError, match="EG2_SOURCE_REQUIRES_REPRESENTATION_ID_AND_MODEL_REVISION"):
        trn.load_training_inputs([], source="eg2")

    rng = np.random.default_rng(11)
    rows = []
    vecs = {}
    for c_idx, cls_name in enumerate(val.CLASSES):
        proto = np.zeros(24, dtype=np.float32)
        proto[c_idx] = 5.0
        for i in range(60):
            cid = f"m_{c_idx}_{i}"
            rows.append(
                {
                    "chunk_id": cid,
                    "source_ref": f"src/{cls_name}/m_{i // 2}.ts",
                    "sha256": f"sha_{c_idx}_{i}",
                    "proposed_label": cls_name,
                    "gold_label": cls_name,
                    "status": "reviewed",
                }
            )
            vecs[cid] = proto + rng.normal(0.0, 0.15, size=24).astype(np.float32)

    mlp = trn_tour.train_pytorch_mlp_challenger_v1(rows, vecs, hidden_dim=32, epochs=80)
    assert mlp["canonical_authority"] is False
    assert mlp["challenger_only"] is True
    assert mlp["test_accuracy"] >= 0.90
