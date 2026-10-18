"""Advisory 8-neuron MLP Ranker and deterministic feature collation for Parent Atlas."""

from __future__ import annotations

from typing import Sequence, Tuple
try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = None

from .contracts import CandidateFeature


def to_feature_matrix(
    rows: Sequence[CandidateFeature],
) -> Tuple[list[Tuple[str, str]], Any]:
    """Deterministically transform grounded CandidateFeature rows into a float32 feature matrix.

    Returns:
        identities: List of (packet_key, evidence_ref) tuples preserving row identity.
        matrix: PyTorch FloatTensor if torch is installed, otherwise a 2D list of floats.
    """
    identities = [(r.packet_key, r.evidence_ref) for r in rows]
    values = [
        [
            float(r.semantic_score),
            float(r.lexical_score),
            float(r.graph_score),
            float(r.dependency_score),
            float(r.recency_score),
            float(r.breadth_score),
            float(r.risk_score),
            float(r.provenance_score),
        ]
        for r in rows
    ]
    if torch is not None:
        tensor = torch.tensor(values, dtype=torch.float32).contiguous()
        return identities, tensor
    return identities, values


class AdvisoryRanker:
    """8-neuron lightweight challenger network (8 -> 8 -> 1 with LeakyReLU and Sigmoid).

    Role: Advisory candidate scoring and reranking challenger.
    Invariant: Evaluated offline in shadow mode; never directly mutates canonical ranking weights.
    """

    def __init__(self, in_features: int = 8, hidden_dim: int = 8, negative_slope: float = 0.01) -> None:
        self.in_features = in_features
        self.hidden_dim = hidden_dim
        self.negative_slope = negative_slope
        self.has_torch = torch is not None

        if self.has_torch:
            self._torch_module = nn.Sequential(
                nn.Linear(in_features, hidden_dim),
                nn.LeakyReLU(negative_slope=negative_slope),
                nn.Linear(hidden_dim, 1),
                nn.Sigmoid(),
            )
        else:
            self._torch_module = None

    def forward(self, x: Any) -> Any:
        if self.has_torch and isinstance(x, torch.Tensor):
            return self._torch_module(x)

        # Pure-Python deterministic forward pass: LeakyReLU(X @ W1 + b1) -> Sigmoid(h @ W2 + b2)
        import math
        rows = x if isinstance(x, list) else x.tolist()
        scores = []
        scale = 1.0 / math.sqrt(self.in_features)

        for row in rows:
            # Hidden layer: 8 neurons
            hidden = []
            for h_idx in range(self.hidden_dim):
                acc = 0.01 * ((h_idx % 3) - 1)  # bias
                for in_idx, val in enumerate(row):
                    w = math.cos((in_idx + 1) * (h_idx + 1) * 0.17) * scale
                    acc += val * w
                # LeakyReLU activation
                act = acc if acc > 0 else acc * self.negative_slope
                hidden.append(act)

            # Output neuron: 1 score
            out_acc = 0.0
            for h_idx, h_val in enumerate(hidden):
                w2 = math.sin((h_idx + 1) * 0.31) / math.sqrt(self.hidden_dim)
                out_acc += h_val * w2
            # Sigmoid activation
            sigmoid_val = 1.0 / (1.0 + math.exp(-max(-20.0, min(20.0, out_acc))))
            scores.append([sigmoid_val])

        return scores

    def score_candidates(
        self,
        rows: Sequence[CandidateFeature],
        device: str = "cpu",
    ) -> list[dict[str, Any]]:
        """Score rows and return ranked candidate list sorted by score descending."""
        identities, x = to_feature_matrix(rows)
        if self.has_torch and isinstance(x, torch.Tensor):
            self._torch_module.eval()
            x_dev = x.to(device)
            with torch.no_grad():
                scores = self._torch_module(x_dev).cpu().squeeze(-1).tolist()
        else:
            raw_scores = self.forward(x)
            scores = [r[0] for r in raw_scores]

        if isinstance(scores, float):
            scores = [scores]

        scored = [
            {
                "packet_key": ident[0],
                "evidence_ref": ident[1],
                "advisory_score": round(score, 6),
            }
            for ident, score in zip(identities, scores)
        ]
        scored.sort(key=lambda s: s["advisory_score"], reverse=True)
        return scored


def train_advisory_step(
    model: AdvisoryRanker,
    x: torch.Tensor,
    y: torch.Tensor,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module | None = None,
) -> float:
    """Execute a single offline gradient update on training candidates."""
    model.train()
    if criterion is None:
        criterion = nn.BCELoss()
    optimizer.zero_grad()
    predictions = model(x)
    loss = criterion(predictions, y)
    loss.backward()
    optimizer.step()
    return float(loss.item())
