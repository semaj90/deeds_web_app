import torch
import torch.nn as nn
from typing import Tuple, Optional


class AtlasPolicyValue(nn.Module):
    """
    Policy/Value Network for Parent Atlas Bounded Search & Candidate Routing:
    - Input: Query-adaptive feature matrix X in R^[batch, 4, 6] (24 signals)
    - Shared Encoder: LayerNorm(24) -> Linear(24, hidden) -> GELU -> Linear(hidden, hidden) -> GELU
    - Policy Head: Linear(hidden, n_actions) with dynamic action masking (~action_mask -> -inf)
    - Value Head: Linear(hidden, 1) -> Tanh() -> utility in [-1.0, 1.0]
    """

    def __init__(self, n_actions: int = 6, hidden: int = 64):
        super().__init__()
        self.n_actions = n_actions
        self.hidden = hidden

        self.encoder = nn.Sequential(
            nn.LayerNorm(24),
            nn.Linear(24, hidden),
            nn.GELU(),
            nn.Linear(hidden, hidden),
            nn.GELU(),
        )
        self.policy = nn.Linear(hidden, n_actions)
        self.value = nn.Sequential(
            nn.Linear(hidden, 1),
            nn.Tanh(),
        )

    def forward(
        self,
        features: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass:
        :param features: Tensor of shape [batch, 4, 6] or [batch, 24] (dtype float32)
        :param action_mask: Boolean tensor of shape [batch, n_actions] (True = allowed action)
        :return: (policy_logits [batch, n_actions], value [batch, 1])
        """
        if features.ndim == 3:
            assert features.shape[1:] == (4, 6), f"Expected shape [B, 4, 6], got {features.shape}"
            x = features.reshape(features.shape[0], 24)
        elif features.ndim == 2:
            assert features.shape[1] == 24, f"Expected shape [B, 24], got {features.shape}"
            x = features
        else:
            raise ValueError(f"Features must have 2 or 3 dimensions, got {features.ndim}")

        h = self.encoder(x)
        logits = self.policy(h)

        if action_mask is not None:
            assert action_mask.shape == (x.shape[0], self.n_actions), (
                f"Action mask shape {action_mask.shape} != {(x.shape[0], self.n_actions)}"
            )
            assert action_mask.dtype == torch.bool, "action_mask must be boolean"
            assert action_mask.any(dim=-1).all(), "Every batch element must have at least one valid action"
            logits = logits.masked_fill(~action_mask, -1e9)

        val = self.value(h)
        return logits, val


def create_policy_value_model(n_actions: int = 6, hidden: int = 64, device: str = "cpu") -> AtlasPolicyValue:
    model = AtlasPolicyValue(n_actions=n_actions, hidden=hidden)
    model.to(device)
    model.eval()
    return model
