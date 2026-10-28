import unittest

from atlas_symbol_nb_lane_v1 import (
    InsufficientTrustedLabels,
    fit,
    group_split,
    predict,
    rank_candidates,
    subwords,
    symbol_tokens,
    trusted_gold,
)


def row(name, domain, *, path="src/x", kind="function", reviewer="reviewer_a", at="2026-10-28T10:00:00+00:00", **extra):
    return {"name": name, "kind": kind, "directoryPath": path, "reviewedGroup": domain, "reviewer": reviewer, "reviewedAt": at, **extra}


# SYNTHETIC mechanics fixtures only: they prove the lane's behaviour, not any accuracy.
AUTH = ["validateSession", "createSessionToken", "loginUser", "logoutUser", "refreshSessionToken", "verifyPassword"]
GPU = ["computeCosineBatch", "launchKernelTiles", "gpuMatmulPlan", "allocateTensorBuffer", "cuvsSearchIndex", "tensorTopK"]


def fixtures():
    rows = [row(n, "auth", path="src/lib/server/auth") for n in AUTH] + [row(n, "gpu", path="src/lib/gpu") for n in GPU]
    return rows


class TokenTests(unittest.TestCase):
    def test_subwords_split_camel_snake_and_drop_purely_numeric_chunks(self):
        self.assertEqual(subwords("computePacketKeyV2"), ["compute", "packet", "key", "v2"])
        self.assertEqual(subwords("route_404_handler"), ["route", "handler"])
        self.assertEqual(subwords("HTTPServer_start"), ["http", "server", "start"])

    def test_identity_and_revision_fields_never_become_tokens(self):
        a = symbol_tokens({"name": "loginUser", "kind": "function", "stableSymbolId": "symbol:aaa", "sourceRevision": "sha256:" + "a" * 64})
        b = symbol_tokens({"name": "loginUser", "kind": "function", "stableSymbolId": "symbol:bbb", "sourceRevision": "sha256:" + "b" * 64})
        self.assertEqual(a, b)
        self.assertFalse(any("symbol" in t and "aaa" in t for t in a))


class TrustTests(unittest.TestCase):
    def test_only_human_reviewed_rows_are_gold_and_nothing_is_silently_dropped(self):
        rows = fixtures() + [row("x", "auth", reviewer="llm_agent"), row("y", "AMBIGUOUS"), {"name": "z"}, row("w", "gpu", at="not-a-time")]
        gold, report = trusted_gold(rows)
        self.assertEqual(len(gold), 12)
        self.assertEqual(report["nonGold"], 1)
        self.assertEqual(report["unreviewedOrUnverified"], 3)
        self.assertEqual(report["gold"] + report["nonGold"] + report["unreviewedOrUnverified"], len(rows))

    def test_fit_refuses_below_the_evaluator_floors(self):
        with self.assertRaises(InsufficientTrustedLabels):
            fit(fixtures())

    def test_fit_refuses_when_all_labels_are_model_or_test_reviewers(self):
        rows = [row(n, "auth", reviewer="model_v1") for n in AUTH] + [row(n, "gpu", reviewer="test_user") for n in GPU]
        with self.assertRaises(InsufficientTrustedLabels):
            fit(rows, mechanics_only=True)


class ModelTests(unittest.TestCase):
    def setUp(self):
        self.model = fit(fixtures(), mechanics_only=True)

    def test_mechanics_model_is_never_trusted_for_scoring(self):
        self.assertFalse(self.model["trustedForScoring"])
        self.assertEqual(self.model["trainedRows"], 12)

    def test_training_is_deterministic(self):
        self.assertEqual(self.model["modelDigest"], fit(fixtures(), mechanics_only=True)["modelDigest"])

    def test_known_tokens_propose_the_right_domain_and_output_is_never_a_label_or_authority(self):
        p = predict(self.model, {"name": "verifySessionToken", "kind": "function", "directoryPath": "src/lib/server/auth"})
        self.assertEqual(p["proposedDomain"], "auth")
        self.assertIs(p["humanLabel"], False)
        self.assertIs(p["canonicalAuthority"], False)
        self.assertIs(p["writesPerformed"], False)
        self.assertIs(p["trustedForScoring"], False)

    def test_unknown_vocabulary_abstains_instead_of_returning_the_prior(self):
        p = predict(self.model, {"name": "zzqx", "kind": "enum"})
        self.assertEqual(p["decision"], "ABSTAIN_NO_KNOWN_TOKENS")
        self.assertIsNone(p["proposedDomain"])

    def test_gate_is_three_way(self):
        rec = {"name": "tensorTopK", "kind": "function", "directoryPath": "src/lib/gpu"}
        self.assertEqual(predict(self.model, rec, accept=0.0001, reject=0.00005)["decision"], "PROPOSE")
        self.assertEqual(predict(self.model, rec, accept=1.1, reject=0.1)["decision"], "REVIEW")
        self.assertEqual(predict(self.model, rec, accept=1.1, reject=1.05)["decision"], "ABSTAIN_LOW_CONFIDENCE")

    def test_identity_fields_do_not_change_the_prediction(self):
        a = predict(self.model, {"name": "loginUser", "kind": "function", "stableSymbolId": "symbol:1", "sourceRevision": "sha256:" + "1" * 64})
        b = predict(self.model, {"name": "loginUser", "kind": "function", "stableSymbolId": "symbol:2", "sourceRevision": "sha256:" + "2" * 64})
        self.assertEqual(a["ranked"], b["ranked"])

    def test_candidate_ranking_orders_by_domain_agreement_but_never_admits_or_resolves(self):
        importer = {"name": "validateSession", "kind": "function", "directoryPath": "src/lib/server/auth"}
        cands = [{"name": "tensorTopK", "kind": "function", "directoryPath": "src/lib/gpu"}, {"name": "refreshSessionToken", "kind": "function", "directoryPath": "src/lib/server/auth"}]
        r = rank_candidates(self.model, importer, cands)
        self.assertEqual(r["ranked"][0]["candidateIndex"], 1)
        self.assertIs(r["admitsCandidate"], False)
        self.assertIs(r["resolvesAmbiguity"], False)


class SplitTests(unittest.TestCase):
    def test_group_split_keeps_a_file_on_one_side_and_is_deterministic(self):
        rows = [{"name": f"s{i}", "file": f"f{i % 7}.ts"} for i in range(60)]
        train, valid = group_split(rows, lambda r: r["file"])
        self.assertFalse({r["file"] for r in train} & {r["file"] for r in valid})
        self.assertEqual((train, valid), group_split(rows, lambda r: r["file"]))
        self.assertEqual(len(train) + len(valid), 60)


if __name__ == "__main__":
    unittest.main()
