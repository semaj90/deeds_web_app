import unittest

import numpy as np

from atlas_compute.candidate_concept_tile_v1 import (FEATURES, PAD_ORDINAL, materialize_batch,
                                                    sealed_ordinal_map_checksum, stable_top_k)
from atlas_compute import lowrank_tile_projection_v1 as lr


def make_fit(n=240, seed=7, present_rate=0.85):
    rng = np.random.default_rng(seed)
    base = rng.normal(size=(n, 3))
    mix = rng.normal(size=(3, 6))
    x = base @ mix + 0.3 * rng.normal(size=(n, 6)) + np.array([1.0, 2.0, -0.5, 0.2, 3.0, 0.0])
    present = (rng.random((n, 6)) < present_rate).astype(float)
    x = np.where(present == 1, x, 0.0)
    return x, present


class FitAndContractTests(unittest.TestCase):
    def test_fit_is_deterministic_and_checksum_detects_tampering(self):
        x, p = make_fit()
        a = lr.fit_lowrank_projection(x, p, 3, "fit:digest:1")
        b = lr.fit_lowrank_projection(x, p, 3, "fit:digest:1")
        self.assertEqual(a, b)
        self.assertNotEqual(a.projection_checksum, lr.fit_lowrank_projection(x, p, 3, "fit:digest:2").projection_checksum)
        lr.verify_projection(a)
        tampered = lr.LowRankProjectionV1(**{**a.__dict__, "mu": (a.mu[0] + 1e-9,) + a.mu[1:]})
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            lr.verify_projection(tampered)

    def test_rejections(self):
        x, p = make_fit()
        for bad in (0, 7, True, 2.5):
            with self.assertRaisesRegex(ValueError, "RANK_OUT_OF_RANGE"):
                lr.fit_lowrank_projection(x, p, bad, "d")
        with self.assertRaisesRegex(ValueError, "FIT_SET_DIGEST_REQUIRED"):
            lr.fit_lowrank_projection(x, p, 2, " ")
        with self.assertRaisesRegex(ValueError, "FIT_SET_TOO_SMALL"):
            lr.fit_lowrank_projection(x[:1], p[:1], 2, "d")
        with self.assertRaisesRegex(ValueError, "SHAPE_MISMATCH"):
            lr.fit_lowrank_projection(x[:, :5], p[:, :5], 2, "d")
        nan = x.copy(); nan[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "NONFINITE"):
            lr.fit_lowrank_projection(nan, p, 2, "d")
        with self.assertRaisesRegex(ValueError, "PRESENCE_NOT_BINARY"):
            lr.fit_lowrank_projection(x, p * 2, 2, "d")
        absent = x.copy(); absent[p == 0] = 0.5
        with self.assertRaisesRegex(ValueError, "ABSENT_FEATURE_MUST_BE_ZERO"):
            lr.fit_lowrank_projection(absent, p, 2, "d")

    def test_degenerate_channel_is_flagged_not_imputed(self):
        x, p = make_fit()
        p[:, 3] = 0; x[:, 3] = 0   # personalizedPageRank never present in the fit set
        proj = lr.fit_lowrank_projection(x, p, 3, "d")
        self.assertIn(3, proj.degenerate_channels)
        self.assertEqual((proj.mu[3], proj.d[3]), (0.0, 1.0))

    def test_orthonormal_basis_and_reconstruction_error_is_monotone(self):
        x, p = make_fit()
        errs = []
        for r in range(1, 7):
            proj = lr.fit_lowrank_projection(x, p, r, "d")
            w = np.array(proj.w)
            self.assertTrue(np.allclose(w.T @ w, np.eye(r), atol=1e-12))
            errs.append(lr.reconstruction_error(proj, x, p))
        self.assertTrue(all(a >= b - 1e-12 for a, b in zip(errs, errs[1:])))
        self.assertLess(errs[-1], 1e-12)  # full rank reconstructs the normalized fit data


class RankingEquivalenceTests(unittest.TestCase):
    def setUp(self):
        self.fit_x, self.fit_p = make_fit()
        self.rng = np.random.default_rng(11)
        self.w = np.array([0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625])
        self.bias = 0.1

    def full_present_candidates(self, n=40):
        x = self.rng.normal(size=(n, 6)) + np.array([1.0, 2.0, -0.5, 0.2, 3.0, 0.0])
        x[7] = x[3]      # exact duplicates -> exact ties
        x[21] = x[3]
        return x, np.ones((n, 6))

    def test_full_rank_reproduces_baseline_topk_exactly_for_fully_present_rows(self):
        proj = lr.fit_lowrank_projection(self.fit_x, self.fit_p, 6, "d")
        d, w_mat = np.array(proj.d), np.array(proj.w)
        v = w_mat.T @ (d * self.w)                     # makes w' = (W v)/d == w because W is orthogonal 6x6
        self.assertTrue(np.allclose(lr.equivalent_linear_weights(proj, v), self.w, atol=1e-12))
        x, p = self.full_present_candidates()
        baseline = self.bias + x @ self.w
        projected = lr.head_scores(lr.project(proj, x, p), v, self.bias)
        const = -(np.array(proj.mu) * self.w).sum()
        self.assertTrue(np.allclose(projected - baseline, const, atol=1e-10))   # one constant for every row
        ordinals = list(range(len(x)))
        self.assertEqual(stable_top_k(baseline, ordinals, 10), stable_top_k(projected, ordinals, 10))
        self.assertEqual(stable_top_k(baseline, ordinals, len(x)), stable_top_k(projected, ordinals, len(x)))

    def test_low_rank_projected_linear_head_is_inside_the_linear_family(self):
        x, p = self.full_present_candidates()
        for r in (1, 2, 3, 5):
            proj = lr.fit_lowrank_projection(self.fit_x, self.fit_p, r, "d")
            v = self.rng.normal(size=r)
            projected = lr.head_scores(lr.project(proj, x, p), v, self.bias)
            wp = lr.equivalent_linear_weights(proj, v)
            expected = self.bias + x @ wp - (np.array(proj.mu) * wp).sum()
            self.assertTrue(np.allclose(projected, expected, atol=1e-10), f"r={r}")

    def test_zero_after_norm_policy_makes_the_shift_presence_dependent_so_ranking_can_change(self):
        proj = lr.fit_lowrank_projection(self.fit_x, self.fit_p, 6, "d", missing_policy="zero_after_norm")
        gap, p, baseline, projected, x = self._equal_baseline_pair(proj)
        self.assertAlmostEqual(gap, proj.mu[0] * self.w[0], places=10)
        self.assertAlmostEqual(
            gap, lr.presence_dependent_constant(proj, self._v(proj), p[1]) - lr.presence_dependent_constant(proj, self._v(proj), p[0]), places=10)
        self.assertNotAlmostEqual(gap, 0.0, places=6)

    def test_raw_zero_policy_keeps_equal_baseline_candidates_equal_regardless_of_presence(self):
        proj = lr.fit_lowrank_projection(self.fit_x, self.fit_p, 6, "d", missing_policy="raw_zero")
        self.assertEqual(proj.missing_policy, "raw_zero")
        gap, p, baseline, projected, x = self._equal_baseline_pair(proj)
        self.assertAlmostEqual(gap, 0.0, places=10)                               # one constant for every row
        const = -(np.array(proj.mu) * self.w).sum()
        self.assertTrue(np.allclose(projected - baseline, const, atol=1e-10))
        self.assertEqual(lr.presence_dependent_constant(proj, self._v(proj), p[0]),
                         lr.presence_dependent_constant(proj, self._v(proj), p[1]))
        # the pair is an exact tie in the baseline, so order is decided by float noise; the gap above is the claim

    def test_policy_is_part_of_the_checksum_and_unknown_policies_are_rejected(self):
        a = lr.fit_lowrank_projection(self.fit_x, self.fit_p, 4, "d", missing_policy="raw_zero")
        b = lr.fit_lowrank_projection(self.fit_x, self.fit_p, 4, "d", missing_policy="zero_after_norm")
        self.assertNotEqual(a.projection_checksum, b.projection_checksum)
        self.assertEqual(lr.DEFAULT_MISSING_POLICY, "raw_zero")
        with self.assertRaisesRegex(ValueError, "MISSING_POLICY_UNKNOWN"):
            lr.fit_lowrank_projection(self.fit_x, self.fit_p, 4, "d", missing_policy="impute_median")
        swapped = lr.LowRankProjectionV1(**{**a.__dict__, "missing_policy": "zero_after_norm"})
        with self.assertRaisesRegex(ValueError, "CHECKSUM_MISMATCH"):
            lr.verify_projection(swapped)

    def _v(self, proj):
        return np.array(proj.w).T @ (np.array(proj.d) * self.w)

    def _equal_baseline_pair(self, proj):
        a = np.array([1.0, 2.0, -0.5, 0.2, 3.0, 0.5])
        b = a.copy(); b[0] = 0.0
        b[1] += (a[0] * self.w[0]) / self.w[1]          # same raw baseline score, channel 0 missing
        x = np.vstack([a, b]); p = np.vstack([np.ones(6), np.array([0, 1, 1, 1, 1, 1.0])])
        baseline = self.bias + x @ self.w
        self.assertAlmostEqual(baseline[0], baseline[1], places=12)
        projected = lr.head_scores(lr.project(proj, x, p), self._v(proj), self.bias)
        return projected[1] - projected[0], p, baseline, projected, x


class TileBatchIntegrationTests(unittest.TestCase):
    def test_padding_rows_project_to_zero_and_never_reach_topk(self):
        fit_x, fit_p = make_fit()
        proj = lr.fit_lowrank_projection(fit_x, fit_p, 3, "d")
        rng = np.random.default_rng(3)
        rows = []
        for i in range(5):
            r = dict(packet_key=f"p{i}", source_revision="sr", workspace_revision="wr", graph_revision="gr",
                     representation_revision="rr", domain_taxonomy_revision="dr", feature_schema_revision="fr", revision_status="PROVEN")
            for c, name in enumerate(FEATURES):
                r[name] = None if (i + c) % 5 == 0 else float(rng.normal() + 1.0)
            rows.append(r)
        groups = [rows[:4], rows[4:]]
        cands = [dict(candidateOrdinal=i, canonicalId=f"c{i}", packetKey=f"p{i}", sourceRevision="sr", workspaceRevision="w",
                      candidateSnapshotRevision="s") for i in range(5)]
        sealed = dict(candidateSnapshotRevision="s", workspaceRevision="w", rowCount=5, candidates=cands)
        sealed["ordinalMapChecksum"] = sealed_ordinal_map_checksum(sealed)
        batch = materialize_batch(groups, ordinals=[[0, 1, 2, 3], [4]], sealed_ordinal_map=sealed)
        x = np.array(batch.values).reshape(-1, 6)
        pres = np.array(batch.present).reshape(-1, 6).astype(float)
        z = lr.project(proj, x, pres)
        real = [s for s, o in enumerate(batch.slot_ordinals) if o != PAD_ORDINAL]
        pad = [s for s, o in enumerate(batch.slot_ordinals) if o == PAD_ORDINAL]
        self.assertEqual(len(real), 5)
        self.assertEqual(len(pad), 3)
        # raw_zero (default) maps an all-missing row to a NONZERO vector, so padding is excluded by the slot mask,
        # never by "looks like zero"; the zero_after_norm policy additionally maps it to the zero vector.
        self.assertEqual(proj.missing_policy, "raw_zero")
        self.assertFalse(np.all(z[pad] == 0.0))
        zero_proj = lr.fit_lowrank_projection(fit_x, fit_p, 3, "d", missing_policy="zero_after_norm")
        self.assertTrue(np.all(lr.project(zero_proj, x, pres)[pad] == 0.0))
        scores = lr.head_scores(z[real], [0.4, -0.2, 0.1], 0.0)
        ordinals = [batch.slot_ordinals[s] for s in real]
        top = stable_top_k(scores, ordinals, 10)
        self.assertEqual(len(top), 5)
        self.assertTrue(all(ordinals[i] != PAD_ORDINAL for i in top))


if __name__ == "__main__":
    unittest.main()
