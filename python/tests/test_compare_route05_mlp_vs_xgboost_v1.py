from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "cmp_route05", REPO_ROOT / "scripts" / "atlas" / "compare-route05-mlp-vs-xgboost-v1.py"
)
MOD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MOD)


class Route05MlpVsXgboostTests(unittest.TestCase):
    def test_compares_mlp_and_xgboost_on_identical_frozen_split(self) -> None:
        rng = np.random.default_rng(7)
        x = rng.uniform(0.0, 1.0, size=(20, 5)).astype(np.float32)
        y = (0.55 * x[:, 0] + 0.25 * x[:, 1] + 0.20 * x[:, 2]).astype(np.float32)

        res1 = MOD.run_frozen_mlp_vs_xgboost_v1(x, y, seed=42, epochs=40)
        res2 = MOD.run_frozen_mlp_vs_xgboost_v1(x, y, seed=42, epochs=40)
        self.assertEqual(res1["frozenTensorChecksum"], res2["frozenTensorChecksum"])
        self.assertTrue(res1["identicalFrozenSplit"])
        self.assertFalse(res1["canonicalAuthority"])
        self.assertFalse(res1["writesPerformed"])
        self.assertEqual(res1["pytorchMlp"]["evalMse"], res2["pytorchMlp"]["evalMse"])
        self.assertEqual(res1["xgboost"]["evalMse"], res2["xgboost"]["evalMse"])


if __name__ == "__main__":
    unittest.main()
