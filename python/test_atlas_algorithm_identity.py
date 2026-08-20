from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from atlas_compute.model_topology import audit_model_manifest, detect_model_topology
from atlas_compute.torch_kernel_experiment import run_torch_kernel_experiment


class ModelTopologyTests(unittest.TestCase):
    def test_name_does_not_create_moe_topology(self) -> None:
        result = detect_model_topology(
            "marketing-name-moe",
            {"displayName": "Huge MoE Model", "tags": ["moe", "experts"]},
        )
        self.assertEqual(result.architecture, "unknown")
        self.assertEqual(result.status, "TOPOLOGY_UNPROVEN")
        self.assertFalse(result.grouped_mm_eligible_by_topology)

    def test_explicit_expert_topology_proves_moe(self) -> None:
        result = detect_model_topology(
            "real-moe",
            {"num_local_experts": 8, "num_experts_per_tok": 2, "hidden_size": 256},
        )
        self.assertEqual(result.architecture, "moe")
        self.assertEqual(result.num_experts, 8)
        self.assertEqual(result.top_k, 2)
        self.assertTrue(result.grouped_mm_eligible_by_topology)

    def test_manifest_audit_preserves_declared_dimensions(self) -> None:
        payload = {
            "schemaVersion": "test",
            "canonicalDimensions": {"semantic": 384, "latent": 64},
            "models": [{"id": "dense-unknown", "runtime": "llama-server"}],
        }
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "manifest.json"
            target.write_text(json.dumps(payload), encoding="utf-8")
            report = audit_model_manifest(target)
        self.assertEqual(report["declared_semantic_dimension"], 384)
        self.assertEqual(report["declared_latent_dimension"], 64)
        self.assertEqual(report["unproven_count"], 1)


class TorchKernelExperimentTests(unittest.TestCase):
    def test_cpu_eager_reference_and_compile_receipt(self) -> None:
        try:
            receipt = run_torch_kernel_experiment(rows=8, cols=16, device="cpu", dynamic_shapes=True)
        except ImportError:
            self.skipTest("PyTorch unavailable")
        self.assertEqual(receipt.operation, "add_scale")
        self.assertFalse(receipt.canonical_authority)
        eager = receipt.measurements[0]
        self.assertEqual(eager.backend, "pytorch_eager")
        self.assertTrue(eager.passed_parity)
        self.assertEqual(len(receipt.reference_checksum), 64)


if __name__ == "__main__":
    unittest.main()
