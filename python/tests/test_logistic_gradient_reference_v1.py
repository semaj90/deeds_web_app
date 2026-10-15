from __future__ import annotations

import math

import pytest

torch = pytest.importorskip("torch")


def _logistic_loss(logit: float, label: float) -> float:
    return math.log1p(math.exp(-abs(logit))) + max(logit, 0.0) - label * logit


def test_logistic_regression_analytical_gradient_matches_torch_autograd() -> None:
    features = torch.tensor([0.25, -1.5, 2.0], dtype=torch.float64)
    weights = torch.tensor([0.4, -0.2, 0.1], dtype=torch.float64, requires_grad=True)
    bias = torch.tensor(-0.3, dtype=torch.float64, requires_grad=True)
    label = torch.tensor(1.0, dtype=torch.float64)
    loss = torch.nn.functional.binary_cross_entropy_with_logits(features @ weights + bias, label)
    loss.backward()

    probability = torch.sigmoid(features @ weights.detach() + bias.detach())
    expected_weight_gradient = (probability - label) * features
    expected_bias_gradient = probability - label

    torch.testing.assert_close(weights.grad, expected_weight_gradient)
    torch.testing.assert_close(bias.grad, expected_bias_gradient)


@pytest.mark.parametrize("logit,label", [(-1.2, 0.0), (0.0, 1.0), (0.7, 0.0), (2.0, 1.0)])
def test_binary_logistic_gradient_and_hessian_match_finite_differences(logit: float, label: float) -> None:
    probability = 1.0 / (1.0 + math.exp(-logit))
    analytical_gradient = probability - label
    analytical_hessian = probability * (1.0 - probability)
    step = 1e-4

    loss_plus = _logistic_loss(logit + step, label)
    loss_center = _logistic_loss(logit, label)
    loss_minus = _logistic_loss(logit - step, label)
    numeric_gradient = (loss_plus - loss_minus) / (2.0 * step)
    numeric_hessian = (loss_plus - 2.0 * loss_center + loss_minus) / (step * step)

    assert numeric_gradient == pytest.approx(analytical_gradient, abs=1e-7)
    assert numeric_hessian == pytest.approx(analytical_hessian, abs=1e-7)
