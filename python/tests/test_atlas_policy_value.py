import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import torch
    from atlas_compute.atlas_policy_value import AtlasPolicyValue, create_policy_value_model
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


class TestAtlasPolicyValue(unittest.TestCase):
    def setUp(self):
        if not HAS_TORCH:
            self.skipTest("PyTorch is not available in current test runner")

    def test_forward_shape_3d(self):
        model = create_policy_value_model(n_actions=6, hidden=64, device="cpu")
        features = torch.randn(4, 4, 6, dtype=torch.float32)
        action_mask = torch.ones(4, 6, dtype=torch.bool)
        action_mask[0, 3:] = False  # Mask out actions 3, 4, 5 for first batch item

        logits, value = model(features, action_mask)

        self.assertEqual(logits.shape, (4, 6))
        self.assertEqual(value.shape, (4, 1))
        # Masked actions should be <= -1e8
        self.assertTrue((logits[0, 3:] <= -1e8).all())
        # Unmasked actions should be finite
        self.assertTrue(torch.isfinite(logits[0, :3]).all())
        # Value output is bounded by Tanh in [-1, 1]
        self.assertTrue((value >= -1.0).all() and (value <= 1.0).all())

    def test_forward_flat_shape(self):
        model = create_policy_value_model(n_actions=6, hidden=32, device="cpu")
        features = torch.randn(2, 24, dtype=torch.float32)
        logits, value = model(features)

        self.assertEqual(logits.shape, (2, 6))
        self.assertEqual(value.shape, (2, 1))

    def test_gradient_flow(self):
        model = AtlasPolicyValue(n_actions=6, hidden=32)
        model.train()
        features = torch.randn(2, 4, 6, dtype=torch.float32, requires_grad=True)
        logits, value = model(features)

        loss = logits.sum() + value.sum()
        loss.backward()

        self.assertIsNotNone(features.grad)
        self.assertTrue(torch.isfinite(features.grad).all())
        self.assertIsNotNone(model.policy.weight.grad)
        self.assertIsNotNone(model.value[0].weight.grad)


if __name__ == "__main__":
    unittest.main()
