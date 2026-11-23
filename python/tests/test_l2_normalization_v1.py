import sys
from pathlib import Path

import pytest
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from atlas_compute.l2_normalization_v1 import stabilized_l2_normalize  # noqa: E402


def test_stabilized_l2_normalize_passes_autograd_gradcheck():
    values = torch.randn(4, 22, dtype=torch.float64, requires_grad=True)
    assert torch.autograd.gradcheck(
        lambda x: stabilized_l2_normalize(x, epsilon=1e-12, dim=-1),
        (values,),
    )


def test_stabilized_l2_normalize_retains_epsilon_radial_gradient():
    values = torch.tensor([[1e-7, 0.0]], dtype=torch.float64, requires_grad=True)
    output = stabilized_l2_normalize(values, epsilon=1e-12)
    output.sum().backward()
    assert torch.isfinite(output).all()
    assert torch.isfinite(values.grad).all()
    assert values.grad[0, 0].item() != pytest.approx(0.0, abs=1e-8)


def test_stabilized_l2_normalize_handles_zero_vector_with_finite_gradient():
    values = torch.zeros((1, 22), dtype=torch.float64, requires_grad=True)
    output = stabilized_l2_normalize(values, epsilon=1e-12)
    output.sum().backward()
    assert torch.equal(output, torch.zeros_like(output))
    assert torch.isfinite(values.grad).all()
    assert torch.allclose(values.grad, torch.full_like(values, 1e6))


@pytest.mark.parametrize("epsilon", [0.0, -1e-4])
def test_stabilized_l2_normalize_rejects_nonpositive_epsilon(epsilon):
    with pytest.raises(ValueError, match="epsilon must be positive"):
        stabilized_l2_normalize(torch.ones((1, 3)), epsilon=epsilon)
