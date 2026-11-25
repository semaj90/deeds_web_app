from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass
from typing import Any, Literal, Sequence

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

SCHEMA_PYTORCH_CHALLENGER_V1 = "atlas.pytorch-mlp-domain-ranker-challenger.v1"
SUPPORTED_INPUT_DIMS: tuple[int, ...] = (256, 512, 768)
ActivationName = Literal["relu", "gelu", "silu"]


def _make_activation(name: ActivationName) -> nn.Module:
    if name == "relu":
        return nn.ReLU()
    if name == "gelu":
        return nn.GELU()
    if name == "silu":
        return nn.SiLU()
    raise ValueError(f"Unsupported activation {name!r}; expected one of ('relu', 'gelu', 'silu')")


@dataclass(frozen=True)
class ChallengerExample:
    vector: list[float]
    domain_label: int
    relevance_score: float
    primary_source_ref: str
    source_revision: str


@dataclass(frozen=True)
class ChallengerReceipt:
    schema: str
    input_dim: int
    hidden_dim: int
    activation: ActivationName
    num_domains: int
    device: str
    train_count: int
    val_count: int
    train_groups: int
    val_groups: int
    group_leakage_count: int
    epochs: int
    final_train_loss: float
    val_domain_accuracy: float
    val_pairwise_auc: float
    val_mrr: float
    calibration_ece: float
    final_grad_norm_l2: float
    canonical_authority: bool
    writes_performed: bool
    hidden_state_persisted: bool
    promotion_authorized: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class DualHeadMlpChallenger(nn.Module):
    """Offline 2-layer MLP with domain classification + pairwise scalar ranker heads.

    Hidden activations remain strictly ephemeral in forward() and are never returned or persisted.
    """

    def __init__(
        self,
        *,
        input_dim: int,
        hidden_dim: int,
        num_domains: int,
        activation: ActivationName = "gelu",
        dropout: float = 0.1,
    ) -> None:
        super().__init__()
        if input_dim not in SUPPORTED_INPUT_DIMS:
            raise ValueError(f"input_dim={input_dim} must be one of {SUPPORTED_INPUT_DIMS}")
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_domains = num_domains
        self.activation_name = activation
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.norm1 = nn.LayerNorm(hidden_dim)
        self.act = _make_activation(activation)
        self.drop = nn.Dropout(dropout)
        self.domain_head = nn.Linear(hidden_dim, num_domains)
        self.rank_head = nn.Linear(hidden_dim, 1)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        h = self.drop(self.act(self.norm1(self.fc1(x))))
        domain_logits = self.domain_head(h)
        rank_score = self.rank_head(h).squeeze(-1)
        return domain_logits, rank_score


def grouped_source_split(
    examples: Sequence[ChallengerExample],
    *,
    val_fraction: float = 0.25,
    seed: int = 20261123,
) -> tuple[list[ChallengerExample], list[ChallengerExample]]:
    """Deterministic split grouped by primary_source_ref so no source leaks across train/val."""
    if not examples:
        raise ValueError("examples must be non-empty")
    groups: dict[str, list[ChallengerExample]] = {}
    for ex in examples:
        ref = ex.primary_source_ref.strip()
        if not ref:
            raise ValueError("primary_source_ref must be non-empty")
        groups.setdefault(ref, []).append(ex)

    if len(groups) < 2:
        raise ValueError("Need at least 2 distinct primary_source_ref groups for grouped split")

    ordered_refs = sorted(
        groups.keys(),
        key=lambda r: hashlib.sha256(f"{seed}:{r}".encode("utf-8")).hexdigest(),
    )
    n_val_groups = max(1, min(len(ordered_refs) - 1, int(round(len(ordered_refs) * val_fraction))))
    val_refs = set(ordered_refs[:n_val_groups])

    train: list[ChallengerExample] = []
    val: list[ChallengerExample] = []
    for ref, rows in groups.items():
        if ref in val_refs:
            val.extend(rows)
        else:
            train.extend(rows)
    return train, val


def _pairwise_auc(scores: np.ndarray, labels: np.ndarray) -> float:
    pos = 0
    total = 0
    for i in range(len(scores)):
        for j in range(len(scores)):
            if labels[i] > labels[j]:
                total += 1
                if scores[i] > scores[j]:
                    pos += 1
                elif scores[i] == scores[j]:
                    pos += 0.5
    return float(pos / total) if total > 0 else 0.5


def _calibration_ece(probs: np.ndarray, targets: np.ndarray, n_bins: int = 5) -> float:
    if len(probs) == 0:
        return 0.0
    confidences = probs.max(axis=1)
    preds = probs.argmax(axis=1)
    accs = (preds == targets).astype(np.float64)
    ece = 0.0
    for b in range(n_bins):
        lo, hi = b / n_bins, (b + 1) / n_bins
        mask = (confidences > lo) & (confidences <= hi) if b > 0 else (confidences >= lo) & (confidences <= hi)
        if np.any(mask):
            ece += (np.sum(mask) / len(probs)) * abs(float(np.mean(accs[mask])) - float(np.mean(confidences[mask])))
    return float(ece)


def train_and_evaluate_challenger(
    examples: Sequence[ChallengerExample],
    *,
    input_dim: int,
    num_domains: int,
    hidden_dim: int = 64,
    activation: ActivationName = "gelu",
    epochs: int = 12,
    lr: float = 2e-3,
    seed: int = 20261123,
    device: str = "cpu",
) -> tuple[DualHeadMlpChallenger, ChallengerReceipt]:
    if input_dim not in SUPPORTED_INPUT_DIMS:
        raise ValueError(f"Unsupported input_dim={input_dim}; expected {SUPPORTED_INPUT_DIMS}")

    torch.manual_seed(seed)
    np.random.seed(seed)

    train_rows, val_rows = grouped_source_split(examples, seed=seed)
    train_refs = {r.primary_source_ref for r in train_rows}
    val_refs = {r.primary_source_ref for r in val_rows}
    leakage = len(train_refs & val_refs)

    def _to_tensors(rows: Sequence[ChallengerExample]) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mat = np.asarray([r.vector for r in rows], dtype=np.float32)
        if mat.ndim != 2 or mat.shape[1] != input_dim:
            raise ValueError(f"Expected vector shape (N, {input_dim}), got {mat.shape}")
        if not np.isfinite(mat).all():
            raise ValueError("Input vectors contain NaN or Inf")
        y_dom = np.asarray([r.domain_label for r in rows], dtype=np.int64)
        y_rel = np.asarray([r.relevance_score for r in rows], dtype=np.float32)
        return (
            torch.from_numpy(mat).to(device),
            torch.from_numpy(y_dom).to(device),
            torch.from_numpy(y_rel).to(device),
        )

    x_train, y_dom_train, y_rel_train = _to_tensors(train_rows)
    x_val, y_dom_val, y_rel_val = _to_tensors(val_rows)

    model = DualHeadMlpChallenger(
        input_dim=input_dim,
        hidden_dim=hidden_dim,
        num_domains=num_domains,
        activation=activation,
    ).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)

    final_loss = 0.0
    final_grad_norm = 0.0
    model.train()
    for _ in range(epochs):
        optimizer.zero_grad()
        logits, rank_scores = model(x_train)
        ce_loss = F.cross_entropy(logits, y_dom_train)

        # All valid ordered pairs (i, j) where relevance[i] > relevance[j]
        rel_diff = y_rel_train.unsqueeze(1) - y_rel_train.unsqueeze(0)
        pair_mask = rel_diff > 0.0
        if torch.any(pair_mask):
            score_diff = rank_scores.unsqueeze(1) - rank_scores.unsqueeze(0)
            pair_loss = F.softplus(-score_diff[pair_mask]).mean()
        else:
            pair_loss = torch.zeros((), device=device)

        loss = ce_loss + pair_loss
        loss.backward()
        total_sq = 0.0
        for p in model.parameters():
            if p.grad is not None:
                total_sq += float(p.grad.detach().pow(2).sum().item())
        final_grad_norm = math.sqrt(total_sq)
        optimizer.step()
        final_loss = float(loss.detach().item())

    model.eval()
    with torch.no_grad():
        val_logits, val_rank = model(x_val)
        val_probs = F.softmax(val_logits, dim=-1).cpu().numpy()
        val_preds = val_probs.argmax(axis=1)
        val_dom_np = y_dom_val.cpu().numpy()
        val_rel_np = y_rel_val.cpu().numpy()
        val_rank_np = val_rank.cpu().numpy()

    val_acc = float(np.mean(val_preds == val_dom_np))
    val_auc = _pairwise_auc(val_rank_np, val_rel_np)
    order = np.argsort(-val_rank_np)
    top_rel_pos = next((idx + 1 for idx, r_idx in enumerate(order) if val_rel_np[r_idx] >= np.max(val_rel_np)), len(order))
    val_mrr = float(1.0 / top_rel_pos) if order.size > 0 else 0.0
    ece = _calibration_ece(val_probs, val_dom_np)

    receipt = ChallengerReceipt(
        schema=SCHEMA_PYTORCH_CHALLENGER_V1,
        input_dim=input_dim,
        hidden_dim=hidden_dim,
        activation=activation,
        num_domains=num_domains,
        device=device,
        train_count=len(train_rows),
        val_count=len(val_rows),
        train_groups=len(train_refs),
        val_groups=len(val_refs),
        group_leakage_count=leakage,
        epochs=epochs,
        final_train_loss=final_loss,
        val_domain_accuracy=val_acc,
        val_pairwise_auc=val_auc,
        val_mrr=val_mrr,
        calibration_ece=ece,
        final_grad_norm_l2=final_grad_norm,
        canonical_authority=False,
        writes_performed=False,
        hidden_state_persisted=False,
        promotion_authorized=False,
    )
    return model, receipt


def export_challenger_to_onnx(
    model: DualHeadMlpChallenger,
    output_path: str | Path,
    *,
    opset_version: int = 17,
) -> Path:
    """Export DualHeadMlpChallenger to ONNX with dynamic batch axis."""
    from pathlib import Path as _Path

    out = _Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    model_cpu = model.to("cpu").eval()
    dummy = torch.randn(2, model_cpu.input_dim, dtype=torch.float32)
    torch.onnx.export(
        model_cpu,
        dummy,
        str(out),
        input_names=["features"],
        output_names=["domain_logits", "rank_score"],
        dynamic_axes={
            "features": {0: "batch"},
            "domain_logits": {0: "batch"},
            "rank_score": {0: "batch"},
        },
        opset_version=opset_version,
        dynamo=False,
    )
    return out


def verify_onnx_parity(
    model: DualHeadMlpChallenger,
    onnx_path: str | Path,
    sample_inputs: np.ndarray,
    *,
    atol: float = 1e-4,
) -> dict[str, Any]:
    """Verify PyTorch CPU vs ONNX Runtime CPU parity on sample_inputs."""
    import onnxruntime as ort

    x = np.asarray(sample_inputs, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] != model.input_dim:
        raise ValueError(f"Expected shape (N, {model.input_dim}), got {x.shape}")

    model_cpu = model.to("cpu").eval()
    with torch.no_grad():
        pt_logits, pt_rank = model_cpu(torch.from_numpy(x))
        pt_logits_np = pt_logits.numpy()
        pt_rank_np = pt_rank.numpy()

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    ort_logits_np, ort_rank_np = sess.run(["domain_logits", "rank_score"], {"features": x})

    max_logits_diff = float(np.max(np.abs(pt_logits_np - ort_logits_np)))
    max_rank_diff = float(np.max(np.abs(pt_rank_np - ort_rank_np)))
    passed = max_logits_diff <= atol and max_rank_diff <= atol
    return {
        "schema": "atlas.pytorch-onnx-parity.v1",
        "onnxPath": str(onnx_path),
        "providers": sess.get_providers(),
        "batchSize": int(x.shape[0]),
        "inputDim": model.input_dim,
        "maxLogitsAbsDiff": max_logits_diff,
        "maxRankAbsDiff": max_rank_diff,
        "atol": atol,
        "passed": passed,
    }
