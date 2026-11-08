import unittest
from pathlib import Path
import sys

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import importlib.util

spec = importlib.util.spec_from_file_location(
    "prove_ornith_hybrid_ssm_isoquant_kv_v1",
    SCRIPT_DIR / "prove-ornith-hybrid-ssm-isoquant-kv-v1.py",
)
mod = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(mod)


class TestOrnithHybridSsmIsoQuantKvV1(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = mod.run_isoquant_vs_deltanet_ssm_proof()

    def test_01_hybrid_layer_partition_and_memory_budget(self) -> None:
        budget = self.report["hybridMemoryBudget"]
        self.assertEqual(budget["totalLayers"], 32)
        self.assertEqual(budget["fullAttentionLayerCount"], 8)
        self.assertEqual(budget["gatedDeltaNetSsmLayerCount"], 24)
        self.assertEqual(budget["fullAttentionFp16BytesPerToken"], 32768)
        ctx_64k = next(
            p for p in budget["contextScalingProfiles"] if p["contextTokens"] == 65536
        )
        self.assertEqual(ctx_64k["hybrid8LayerFullAttnFp16MiB"], 2048.0)
        self.assertEqual(ctx_64k["hybrid8LayerIsoQuantInt8MiB"], 1024.0)
        self.assertEqual(ctx_64k["hybrid8LayerIsoQuantInt4MiB"], 512.0)

    def test_02_isoquant_rotation_reduces_outlier_crest_and_quantization_mse(self) -> None:
        bench = self.report["isoquantAttentionKvBenchmark"]
        self.assertLess(bench["bijectiveRotationMaxError"], 1e-5)
        self.assertLess(
            bench["outlierCrestFactorAfterRotation"],
            bench["outlierCrestFactorBeforeRotation"],
        )
        cmp_metrics = bench["clippedQuantizationComparison"]
        self.assertGreater(cmp_metrics["int8MseReductionRatio"], 1.5)
        self.assertGreater(cmp_metrics["int4MseReductionRatio"], 1.5)
        self.assertLess(
            cmp_metrics["attentionLogitMseIsoQuantInt4"],
            cmp_metrics["attentionLogitMseNaiveInt4"],
        )

    def test_03_all_four_adversarial_probes_pass(self) -> None:
        probes = self.report["adversarialProbes"]
        self.assertTrue(probes["adv_01_ssm_deltanet_tensor_rejected"]["passed"])
        self.assertTrue(probes["adv_02_non_divisible_by_4_head_dim_rejected"]["passed"])
        self.assertTrue(probes["adv_03_non_unit_rotor_rejected"]["passed"])
        self.assertTrue(probes["adv_04_deltanet_recurrent_state_checksum_immutability"]["passed"])

    def test_04_vram_budget_and_safety_flags(self) -> None:
        self.assertEqual(self.report["status"], "PASS")
        self.assertFalse(self.report["canonicalAuthority"])
        self.assertFalse(self.report["writesPerformed"])
        self.assertFalse(self.report["kvCachePersisted"])
        self.assertFalse(self.report["ornith8090Disturbed"])
        self.assertTrue(self.report["device"]["withinVramBudget"])
        self.assertLessEqual(self.report["device"]["peakCudaAllocatedMiB"], 32.0)


if __name__ == "__main__":
    unittest.main()
