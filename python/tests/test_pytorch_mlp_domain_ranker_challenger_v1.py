from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

PYTHON_ROOT = Path(__file__).resolve().parents[1]
if str(PYTHON_ROOT) not in sys.path:
    sys.path.insert(0, str(PYTHON_ROOT))

from atlas_graph_runtime.pytorch_mlp_domain_ranker_challenger_v1 import (
    ChallengerExample,
    export_challenger_to_onnx,
    grouped_source_split,
    train_and_evaluate_challenger,
    verify_onnx_parity,
)


def _make_synthetic_examples(dim: int, n_groups: int = 8) -> list[ChallengerExample]:
    rng = np.random.default_rng(42 + dim)
    examples: list[ChallengerExample] = []
    for g in range(n_groups):
        domain = g % 3
        ref = f"src/module_{g}.ts"
        for k in range(4):
            vec = rng.normal(0.0, 0.15, size=(dim,)).astype(np.float32)
            vec[domain * 16 : (domain + 1) * 16] += 1.5
            rel = 1.0 if k == 0 else 0.2
            vec[48:64] += rel * 1.2
            norm = float(np.linalg.norm(vec))
            vec = vec / max(norm, 1e-6)
            examples.append(
                ChallengerExample(
                    vector=vec.tolist(),
                    domain_label=domain,
                    relevance_score=rel,
                    primary_source_ref=ref,
                    source_revision=f"sha256:{g:064x}",
                )
            )
    return examples


@pytest.mark.parametrize("dim", [256, 512, 768])
@pytest.mark.parametrize("activation", ["relu", "gelu", "silu"])
def test_pytorch_mlp_challenger_dims_activations_and_grouped_split(dim: int, activation: str) -> None:
    examples = _make_synthetic_examples(dim=dim, n_groups=8)
    train_rows, val_rows = grouped_source_split(examples)
    assert {r.primary_source_ref for r in train_rows}.isdisjoint({r.primary_source_ref for r in val_rows})

    _, receipt = train_and_evaluate_challenger(
        examples,
        input_dim=dim,
        num_domains=3,
        hidden_dim=32,
        activation=activation,  # type: ignore[arg-type]
        epochs=15,
    )
    assert receipt.group_leakage_count == 0
    assert receipt.canonical_authority is False
    assert receipt.writes_performed is False
    assert receipt.hidden_state_persisted is False
    assert receipt.promotion_authorized is False
    assert receipt.val_domain_accuracy >= 0.75
    assert receipt.val_pairwise_auc >= 0.75
    assert receipt.val_mrr > 0.0


def test_pytorch_mlp_onnx_export_and_parity(tmp_path: Path) -> None:
    examples = _make_synthetic_examples(dim=512, n_groups=6)
    model, receipt = train_and_evaluate_challenger(
        examples,
        input_dim=512,
        num_domains=3,
        hidden_dim=32,
        activation="gelu",
        epochs=8,
    )
    assert receipt.group_leakage_count == 0
    onnx_file = export_challenger_to_onnx(model, tmp_path / "mlp_challenger_512.onnx")
    assert onnx_file.is_file()
    sample = np.asarray([ex.vector for ex in examples[:4]], dtype=np.float32)
    parity = verify_onnx_parity(model, onnx_file, sample)
    assert parity["passed"] is True
    assert parity["maxLogitsAbsDiff"] < 1e-4
    assert parity["maxRankAbsDiff"] < 1e-4
