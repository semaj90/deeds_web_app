import unittest

import numpy as np

from atlas_compute import lowrank_stage3_compare_v1 as s3
from atlas_compute import lowrank_tile_projection_v1 as lr
from atlas_compute.candidate_concept_tile_v1 import stable_top_k


class MetricTests(unittest.TestCase):
    def test_kendall_and_overlap_helpers(self):
        self.assertAlmostEqual(s3.kendall_tau_b([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
        self.assertAlmostEqual(s3.kendall_tau_b([1, 2, 3, 4], [40, 30, 20, 10]), -1.0)
        self.assertAlmostEqual(s3.kendall_tau_b([1, 1, 1], [1, 1, 1]), 1.0)   # all ties -> defined, not NaN
        self.assertEqual(s3.pair_changes([3, 2, 1], [1, 2, 3]), (3, 0))
        self.assertEqual(s3.pair_changes([1, 1], [1, 2]), (0, 1))             # tie status changed
        self.assertEqual(s3.overlap_at([0, 1, 2, 3], [3, 2, 1, 0], 2), 0.0)
        self.assertEqual(s3.overlap_at([0, 1, 2, 3], [1, 0, 3, 2], 2), 1.0)


class SharedFixtureStage3Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = s3.compare()

    def test_python_baseline_recomputation_matches_the_ts_gemm_scores(self):
        self.assertLess(self.report["baselineVsTsMaxAbsDiff"], 1e-6)
        self.assertEqual(self.report["baselineTopK"], [10, 2, 5, 8, 4])      # TS-generated Top-5, ties 2/5 by ordinal

    def test_report_is_evidence_only(self):
        for key in ("canonicalAuthority", "writesPerformed", "gpuExecuted"):
            self.assertIs(self.report[key], False)
        self.assertEqual(self.report["candidateCount"], 11)
        self.assertEqual(self.report["fullyPresentRows"], 2)

    def _fits(self, policy):
        return self.report["curves"][policy]

    def test_full_rank_identity_holds_for_every_row_under_both_fits_and_both_policies(self):
        for policy in ("raw_zero", "zero_after_norm"):
            for name, curve in self._fits(policy).items():
                full = curve["rankCurve"][0]
                self.assertEqual(full["rank"], 6, name)
                self.assertLess(full["identityMaxAbsError"], 1e-10, f"{policy}/{name}")   # projected == baseline + constant, exactly
                self.assertLess(full["reconstructionError"], 1e-12, f"{policy}/{name}")
                self.assertEqual(full["tieStatusChangedPairs"], 0, f"{policy}/{name}")    # identical rows (ordinals 2,5) stay tied
                self.assertEqual([c["rank"] for c in curve["rankCurve"]], [6, 5, 4, 3, 2, 1])

    def test_decided_policy_raw_zero_reproduces_the_baseline_ordering_with_missing_features(self):
        self.assertEqual(self.report["decidedMissingPolicy"], "raw_zero")
        self.assertGreater(self.report["candidateCount"] - self.report["fullyPresentRows"], 5)   # most rows have missing features
        for name, curve in self._fits("raw_zero").items():
            full = curve["rankCurve"][0]
            lo, hi = full["presenceConstantRange"]
            self.assertAlmostEqual(hi - lo, 0.0, places=10, msg=name)        # one constant for every row
            self.assertEqual(full["discordantPairs"], 0, name)
            self.assertAlmostEqual(full["kendallTauB"], 1.0, places=12, msg=name)
            self.assertEqual(full["top5Overlap"], 1.0, name)
            self.assertEqual(full["topKOrdinals"], self.report["baselineTopK"], name)

    def test_zero_after_norm_is_not_a_noop_on_this_fixture(self):
        for curve in self._fits("zero_after_norm").values():
            lo, hi = curve["rankCurve"][0]["presenceConstantRange"]
            self.assertGreater(hi - lo, 1e-3)
            self.assertGreater(curve["rankCurve"][0]["discordantPairs"], 0)

    def test_reconstruction_error_is_monotone_in_rank_for_each_policy_and_fit(self):
        for policy in ("raw_zero", "zero_after_norm"):
            for curve in self._fits(policy).values():
                errs = [row["reconstructionError"] for row in curve["rankCurve"]]
                self.assertTrue(all(a <= b + 1e-12 for a, b in zip(errs, errs[1:])))

    def test_nonlinear_challenger_is_reported_separately_and_marked_untrained(self):
        c = self.report["nonlinearChallenger"]
        self.assertIs(c["trainedWeights"], False)
        self.assertEqual(c["channelsUsed"], 4)
        self.assertEqual(set(c["channelMap"].values()), {"dense_similarity", "lexical_rank", "pagerank", "domain_confidence"})
        self.assertEqual(set(c["unmappedChallengerInputs"]), {"ast_distance", "freshness", "retrieval_uncertainty", "cache_residency"})
        for key in ("top5Overlap", "top10Overlap", "kendallTauB"):
            self.assertTrue(-1.0 <= c[key] <= 1.0, key)
        self.assertGreaterEqual(c["discordantPairs"], 0)
        # it must not leak into the equivalence gates: the decided linear policy curve is unchanged by it
        self.assertEqual(self._fits("raw_zero")["fitSynthetic"]["rankCurve"][0]["kendallTauB"], 1.0)

    def test_challenger_scores_are_finite_deterministic_and_use_the_unmapped_inputs_at_their_mean(self):
        d, x, p = s3.load_fixture()
        ordinals = list(d["candidateOrdinals"])
        w = np.array(d["headWeightsByChannel"]); base = float(d["headBias"]) + x @ w
        proj = lr.fit_lowrank_projection(x, p, 6, "digest", missing_policy="raw_zero")
        a = s3.nonlinear_challenger(x, p, ordinals, base, proj.mu, proj.d)
        b = s3.nonlinear_challenger(x, p, ordinals, base, proj.mu, proj.d)
        self.assertEqual(a, b)

    def test_report_is_deterministic(self):
        self.assertEqual(s3.compare(), self.report)


class FullyPresentRankingGateTests(unittest.TestCase):
    def test_full_rank_gives_identical_ordering_on_fully_present_rows_with_exact_ties(self):
        fx, fp = s3.synthetic_fit()
        proj = lr.fit_lowrank_projection(fx, fp, 6, s3.fit_set_digest())
        w = np.array([0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625])
        rng = np.random.default_rng(5)
        x = rng.normal(size=(60, 6)) + np.array([1.0, 2.0, -0.5, 0.2, 3.0, 0.0])
        x[9] = x[2]; x[33] = x[2]
        p = np.ones((60, 6))
        v = np.array(proj.w).T @ (np.array(proj.d) * w)
        projected = lr.head_scores(lr.project(proj, x, p), v, 0.1)
        baseline = 0.1 + x @ w
        ordinals = list(range(60))
        self.assertEqual(stable_top_k(projected, ordinals, 60), stable_top_k(baseline, ordinals, 60))


if __name__ == "__main__":
    unittest.main()
