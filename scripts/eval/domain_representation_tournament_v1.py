#!/usr/bin/env python3
"""P3/P4 Domain Representation Tournament, PyTorch MLP Challenger & ONNX Parity (v1).

Compares MRL slices (768/512/256/128), train-only PCA/SVD (128D), linear
softmax baseline, and a compact PyTorch MLP challenger on identical frozen
grouped splits. Exports winning linear/MLP models to ONNX and verifies
batch inference parity against NumPy/PyTorch across batch sizes [1, 8, 32].
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "eval"))
from train_domain_classifier_v1 import (  # noqa: E402
    _ece,
    _fit_temperature,
    _per_class,
    _softmax,
    collapse_identical_content,
    train_and_evaluate_linear_classifier,
)
from validate_domain_gold_labels_v1 import (  # noqa: E402
    CLASSES,
    build_grouped_splits,
    count_split_leakage,
    validate_gold_labels,
)


def fit_train_only_pca_projection(
    x_train: np.ndarray,
    n_components: int = 128,
) -> tuple[np.ndarray, np.ndarray]:
    """Fit mean + SVD right-singular projection strictly on the train split."""
    if x_train.ndim != 2:
        raise ValueError("EXPECTED_2D_TRAIN_MATRIX")
    k = min(n_components, x_train.shape[0], x_train.shape[1])
    mean = np.mean(x_train, axis=0, keepdims=True).astype(np.float32)
    centered = (x_train - mean).astype(np.float32)
    _, _, vt = np.linalg.svd(centered, full_matrices=False)
    components = vt[:k].T.astype(np.float32)
    return mean, components


def apply_pca_projection(x: np.ndarray, mean: np.ndarray, components: np.ndarray) -> np.ndarray:
    """Transform val/test vectors using frozen train-split PCA parameters."""
    proj = (x - mean) @ components
    norms = np.linalg.norm(proj, axis=1, keepdims=True)
    return proj / np.maximum(norms, 1e-12)


def run_mrl_and_pca_tournament(
    rows: Sequence[Mapping[str, Any]],
    vectors_by_chunk: Mapping[str, np.ndarray],
    *,
    mrl_dims: Sequence[int] = (768, 512, 256, 128),
    pca_dim: int = 128,
    min_total: int = 200,
    min_per_class: int = 30,
) -> dict[str, Any]:
    """Evaluate MRL slices and train-only PCA on identical frozen grouped splits."""
    labelled = collapse_identical_content(rows)
    gate = validate_gold_labels(labelled, min_total=min_total, min_per_class=min_per_class)
    if not gate["passed"]:
        raise ValueError(f"GOLD_LABEL_GATE_FAILED: {gate}")

    reviewed = [r for r in labelled if r.get("status") == "reviewed"]
    sample_dim = next(iter(vectors_by_chunk.values())).shape[0]
    splits = build_grouped_splits(reviewed)
    if count_split_leakage(splits) != 0:
        raise ValueError("SPLIT_LEAKAGE_DETECTED")

    challengers: list[dict[str, Any]] = []
    for dim in mrl_dims:
        if dim > sample_dim:
            continue
        sliced = {cid: vec[:dim].astype(np.float32) for cid, vec in vectors_by_chunk.items()}
        res = train_and_evaluate_linear_classifier(
            reviewed, sliced, min_total=min_total, min_per_class=min_per_class
        )
        challengers.append(
            {
                "name": f"linear_mrl_{dim}",
                "method": "mrl_slice",
                "dim": dim,
                "val_accuracy": res["validation"]["accuracy"],
                "test_accuracy": res["test"]["accuracy"],
                "test_ece_after": res["calibration"]["test_ece_after"],
            }
        )

    # Train-only PCA projection
    train_ids = [r["chunk_id"] for r in splits["train"]]
    x_train_raw = np.vstack([vectors_by_chunk[cid] for cid in train_ids]).astype(np.float32)
    x_train_norm = x_train_raw / np.maximum(np.linalg.norm(x_train_raw, axis=1, keepdims=True), 1e-12)
    mean, components = fit_train_only_pca_projection(x_train_norm, n_components=min(pca_dim, sample_dim))
    pca_vecs = {
        r["chunk_id"]: apply_pca_projection(
            vectors_by_chunk[r["chunk_id"]][None, :] / max(float(np.linalg.norm(vectors_by_chunk[r["chunk_id"]])), 1e-12),
            mean,
            components,
        )[0]
        for r in reviewed
    }
    pca_res = train_and_evaluate_linear_classifier(
        reviewed, pca_vecs, min_total=min_total, min_per_class=min_per_class
    )
    challengers.append(
        {
            "name": f"linear_pca_{components.shape[1]}",
            "method": "train_only_pca",
            "dim": int(components.shape[1]),
            "val_accuracy": pca_res["validation"]["accuracy"],
            "test_accuracy": pca_res["test"]["accuracy"],
            "test_ece_after": pca_res["calibration"]["test_ece_after"],
        }
    )

    return {
        "schema": "atlas.domain-representation-tournament.v1",
        "canonical_authority": False,
        "challenger_only": True,
        "group_leakage_count": 0,
        "challengers": challengers,
    }


def export_linear_model_to_onnx_v1(
    npz_path: Path,
    onnx_path: Path,
) -> dict[str, Any]:
    """Export saved model.npz (weights, bias, temperature) to an ONNX graph for batch parity."""
    import onnx
    from onnx import TensorProto, helper

    with np.load(npz_path, allow_pickle=False) as data:
        w = data["weights"].astype(np.float32)
        b = data["bias"].astype(np.float32)
        temperature = np.array([float(data["temperature"])], dtype=np.float32)
        classes = [str(c) for c in data["classes"]]

    in_dim, out_dim = w.shape
    x_info = helper.make_tensor_value_info("features", TensorProto.FLOAT, ["batch", in_dim])
    probs_info = helper.make_tensor_value_info("probabilities", TensorProto.FLOAT, ["batch", out_dim])

    w_init = helper.make_tensor("W", TensorProto.FLOAT, [in_dim, out_dim], w.flatten().tolist())
    b_init = helper.make_tensor("B", TensorProto.FLOAT, [out_dim], b.flatten().tolist())
    t_init = helper.make_tensor("T", TensorProto.FLOAT, [1], temperature.tolist())

    matmul_node = helper.make_node("MatMul", ["features", "W"], ["mm"])
    add_node = helper.make_node("Add", ["mm", "B"], ["logits"])
    div_node = helper.make_node("Div", ["logits", "T"], ["scaled_logits"])
    softmax_node = helper.make_node("Softmax", ["scaled_logits"], ["probabilities"], axis=1)

    graph = helper.make_graph(
        [matmul_node, add_node, div_node, softmax_node],
        "domain_linear_classifier_v1",
        [x_info],
        [probs_info],
        initializer=[w_init, b_init, t_init],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 9
    onnx.checker.check_model(model)

    onnx_path.parent.mkdir(parents=True, exist_ok=True)
    onnx_bytes = model.SerializeToString()
    onnx_path.write_bytes(onnx_bytes)
    return {
        "schema": "atlas.domain-onnx-export.v1",
        "onnx_path": str(onnx_path),
        "onnx_sha256": "sha256:" + hashlib.sha256(onnx_bytes).hexdigest(),
        "input_dim": int(in_dim),
        "num_classes": int(out_dim),
        "classes": classes,
        "canonical_authority": False,
    }


def verify_onnx_batch_parity_v1(
    npz_path: Path,
    onnx_path: Path,
    sample_vectors: np.ndarray,
    batch_sizes: Sequence[int] = (1, 8, 32),
) -> dict[str, Any]:
    """Verify NumPy reference vs ONNX Runtime CPUExecutionProvider across batch sizes."""
    import onnxruntime as ort

    with np.load(npz_path, allow_pickle=False) as data:
        w = data["weights"].astype(np.float32)
        b = data["bias"].astype(np.float32)
        temperature = float(data["temperature"])

    x = np.asarray(sample_vectors, dtype=np.float32)
    x_norm = x / np.maximum(np.linalg.norm(x, axis=1, keepdims=True), 1e-12)
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])

    max_diff = 0.0
    per_batch: list[dict[str, Any]] = []
    for bs in batch_sizes:
        xb = x_norm[:bs]
        ref_probs = _softmax((xb @ w + b) / temperature)
        ort_probs = sess.run(["probabilities"], {"features": xb})[0]
        diff = float(np.max(np.abs(ref_probs - ort_probs)))
        max_diff = max(max_diff, diff)
        per_batch.append({"batch_size": int(bs), "max_abs_diff": diff, "passed": diff < 1e-5})

    return {
        "schema": "atlas.domain-onnx-batch-parity.v1",
        "max_abs_diff": max_diff,
        "per_batch": per_batch,
        "passed": all(item["passed"] for item in per_batch),
        "canonical_authority": False,
    }


def train_pytorch_mlp_challenger_v1(
    rows: Sequence[Mapping[str, Any]],
    vectors_by_chunk: Mapping[str, np.ndarray],
    *,
    hidden_dim: int = 128,
    epochs: int = 120,
    lr: float = 1e-2,
    min_total: int = 200,
    min_per_class: int = 30,
) -> dict[str, Any]:
    """Offline PyTorch 2-layer ReLU MLP challenger over identical frozen grouped splits."""
    import torch
    import torch.nn as nn

    labelled = collapse_identical_content(rows)
    gate = validate_gold_labels(labelled, min_total=min_total, min_per_class=min_per_class)
    if not gate["passed"]:
        raise ValueError(f"GOLD_LABEL_GATE_FAILED: {gate}")

    reviewed = [r for r in labelled if r.get("status") == "reviewed"]
    splits = build_grouped_splits(reviewed)
    if count_split_leakage(splits) != 0:
        raise ValueError("SPLIT_LEAKAGE_DETECTED")

    label_to_idx = {c: i for i, c in enumerate(CLASSES)}

    def to_tensors(items: Sequence[Mapping[str, Any]]) -> tuple[torch.Tensor, torch.Tensor]:
        x = np.vstack([vectors_by_chunk[it["chunk_id"]] for it in items]).astype(np.float32)
        norms = np.linalg.norm(x, axis=1, keepdims=True)
        if not np.isfinite(x).all() or np.any(norms <= 1e-12):
            raise ValueError("INVALID_VECTOR_NONFINITE_OR_ZERO")
        x_norm = x / norms
        y = np.array([label_to_idx[it["gold_label"]] for it in items], dtype=np.int64)
        return torch.from_numpy(x_norm), torch.from_numpy(y)

    x_tr, y_tr = to_tensors(splits["train"])
    x_va, y_va = to_tensors(splits["val"])
    x_te, y_te = to_tensors(splits["test"])

    torch.manual_seed(42)
    model = nn.Sequential(
        nn.Linear(x_tr.shape[1], hidden_dim),
        nn.ReLU(),
        nn.Linear(hidden_dim, len(CLASSES)),
    )
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    loss_fn = nn.CrossEntropyLoss()

    model.train()
    for _ in range(epochs):
        opt.zero_grad(set_to_none=True)
        loss = loss_fn(model(x_tr), y_tr)
        loss.backward()
        opt.step()

    model.eval()
    with torch.no_grad():
        val_logits = model(x_va).numpy()
        test_logits = model(x_te).numpy()
    temperature = _fit_temperature(val_logits, y_va.numpy())
    test_acc = float(np.mean(test_logits.argmax(axis=1) == y_te.numpy()))

    return {
        "schema": "atlas.domain-mlp-challenger.v1",
        "canonical_authority": False,
        "challenger_only": True,
        "hidden_dim": hidden_dim,
        "test_accuracy": round(test_acc, 4),
        "temperature": round(temperature, 4),
        "test_ece_after": round(_ece(_softmax(test_logits / temperature), y_te.numpy()), 4),
        "test_per_class": _per_class(test_logits.argmax(axis=1), y_te.numpy()),
    }
