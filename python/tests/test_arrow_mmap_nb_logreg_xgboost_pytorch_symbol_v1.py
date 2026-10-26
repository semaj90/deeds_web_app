import unittest
from scripts.atlas.prove_arrow_mmap_nb_logreg_xgboost_pytorch_symbol_v1 import (
    run_unified_arrow_xgb_pytorch_proof,
)


class TestArrowMmapNbLogregXgboostPyTorchSymbolV1(unittest.TestCase):
    def test_unified_pipeline_proof(self) -> None:
        report = run_unified_arrow_xgb_pytorch_proof()
        self.assertEqual(
            report["schema"],
            "atlas.arrow-mmap-nb-logreg-xgboost-pytorch-symbol-receipt.v1",
        )
        self.assertFalse(report["canonicalAuthority"])
        self.assertFalse(report["writesPerformed"])

        sym = report["symbolAndRecommendationSummary"]
        self.assertEqual(sym["totalBoundEvaluated"], 149)
        self.assertGreater(sym["missingSymbolDeclarationsDetected"], 0)
        self.assertIn(
            "REEXTRACT_AST_ENCLOSING_SYMBOL_SPAN",
            sym["derivedRecommendationDistribution"],
        )

        xgb_stat = report["naiveBayesToLogRegToXgboostStat"]
        self.assertTrue(xgb_stat["finitePredictions"])
        self.assertEqual(xgb_stat["treeMethod"], "hist")
        self.assertGreater(xgb_stat["initialGradientL2Norm"], 0.0)
        self.assertGreater(xgb_stat["initialHessianMean"], 0.0)

        arrow_pt = report["arrowMmapToPyTorchProof"]
        self.assertEqual(arrow_pt["rowCount"], 149)
        self.assertTrue(arrow_pt["zeroCopyOnlySucceeded"])
        self.assertTrue(arrow_pt["mmapToPyTorchDataPtrShared"])
        self.assertEqual(arrow_pt["pytorchTensorShape"], [149, 7])


if __name__ == "__main__":
    unittest.main()
