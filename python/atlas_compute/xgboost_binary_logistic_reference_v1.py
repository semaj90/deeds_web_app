"""Reference derivatives for an XGBoost binary-logistic custom objective."""

from __future__ import annotations

import math


def binary_logistic_loss_v1(margin: float, label: float) -> float:
    _validate(margin, label)
    return max(margin, 0.0) - margin * label + math.log1p(math.exp(-abs(margin)))


def binary_logistic_gradient_hessian_v1(margin: float, label: float) -> tuple[float, float]:
    _validate(margin, label)
    if margin >= 0.0:
        probability = 1.0 / (1.0 + math.exp(-margin))
    else:
        exponential = math.exp(margin)
        probability = exponential / (1.0 + exponential)
    return probability - label, probability * (1.0 - probability)


def _validate(margin: float, label: float) -> None:
    if not math.isfinite(margin):
        raise ValueError("margin must be finite")
    if label not in (0.0, 1.0):
        raise ValueError("binary-logistic label must be 0 or 1")

