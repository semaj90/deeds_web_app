"""Unit tests for Phase 16 latent checkpoint hardening (PHASE16-LATENT-CHECKPOINT-HARDENING-V1).

Validates:
- Deterministic allowlisted architecture identification (canonical vs legacy v3).
- Rejection of unknown architectures, corrupted keys, and mismatched tensor shapes.
- Strict state-dictionary validation.
- Model checksum verification against receipt.
- Apply-mode fail-closed guard (exit 78).
"""

from __future__ import annotations

import os
import subprocess
import sys
import unittest

import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../atlas_compute"))

from backfill_latent_256 import (  # noqa: E402
    CheckpointArchitectureError,
    LegacyV3AE,
    identify_checkpoint_architecture,
    state_dict_checksum,
)
from latent_autoencoder import NestedAutoencoderConfig, NestedSemanticAutoencoder  # noqa: E402


class TestLatentCheckpointHardening(unittest.TestCase):
    def test_canonical_architecture_detection(self) -> None:
        canonical_model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
        arch = identify_checkpoint_architecture(canonical_model.state_dict())
        self.assertEqual(arch, "canonical_768_512_256_128")

    def test_legacy_v3_architecture_detection(self) -> None:
        legacy_model = LegacyV3AE()
        arch = identify_checkpoint_architecture(legacy_model.state_dict())
        self.assertEqual(arch, "legacy_v3_768_384_256")

    def test_reject_unknown_architecture(self) -> None:
        unknown_state_dict = {
            "unrelated_layer.weight": torch.randn(128, 128),
            "unrelated_layer.bias": torch.randn(128),
        }
        with self.assertRaises(CheckpointArchitectureError) as ctx:
            identify_checkpoint_architecture(unknown_state_dict)
        self.assertIn("UNRECOGNIZED_CHECKPOINT_ARCHITECTURE", str(ctx.exception))

    def test_reject_non_dict_checkpoint(self) -> None:
        with self.assertRaises(CheckpointArchitectureError):
            identify_checkpoint_architecture(["not", "a", "dict"])  # type: ignore

    def test_reject_canonical_shape_mismatch(self) -> None:
        canonical_model = NestedSemanticAutoencoder(NestedAutoencoderConfig())
        state = dict(canonical_model.state_dict())
        # Corrupt the shape of encoder_512
        state["encoder_512.0.weight"] = torch.randn(256, 768)  # expected 512, 768
        with self.assertRaises(CheckpointArchitectureError) as ctx:
            identify_checkpoint_architecture(state)
        self.assertIn("CANONICAL_SIGNATURE_TENSOR_SHAPE_MISMATCH", str(ctx.exception))

    def test_reject_legacy_v3_shape_mismatch(self) -> None:
        legacy_model = LegacyV3AE()
        state = dict(legacy_model.state_dict())
        # Corrupt the shape of encoder.0
        state["encoder.0.weight"] = torch.randn(128, 768)  # expected 384, 768
        with self.assertRaises(CheckpointArchitectureError) as ctx:
            identify_checkpoint_architecture(state)
        self.assertIn("LEGACY_V3_SIGNATURE_TENSOR_SHAPE_MISMATCH", str(ctx.exception))

    def test_strict_state_dict_validation(self) -> None:
        legacy_model = LegacyV3AE()
        state = dict(legacy_model.state_dict())
        state["extra_rogue_weight"] = torch.randn(10, 10)
        # identify_checkpoint_architecture passes because signature keys exist
        arch = identify_checkpoint_architecture(state)
        self.assertEqual(arch, "legacy_v3_768_384_256")
        # But load_state_dict with strict=True must reject extra unexpected keys
        with self.assertRaises(RuntimeError) as ctx:
            legacy_model.load_state_dict(state, strict=True)
        self.assertIn("Unexpected key(s) in state_dict", str(ctx.exception))

    def test_state_dict_checksum_deterministic(self) -> None:
        model1 = LegacyV3AE()
        model2 = LegacyV3AE()
        model2.load_state_dict(model1.state_dict(), strict=True)
        self.assertEqual(state_dict_checksum(model1), state_dict_checksum(model2))

    def test_apply_fails_closed_exit_78(self) -> None:
        repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
        py_script = os.path.join(repo_root, "python", "backfill_latent_256.py")
        proc = subprocess.run(
            [sys.executable, py_script, "--apply"],
            cwd=repo_root,
            capture_output=True,
            text=True,
        )
        self.assertEqual(proc.returncode, 78)
        self.assertIn("LATENT256_APPLY_BLOCKED", proc.stderr)


if __name__ == "__main__":
    unittest.main()
