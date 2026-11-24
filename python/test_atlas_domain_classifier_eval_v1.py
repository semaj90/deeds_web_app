import unittest
import hashlib

from atlas_domain_classifier_eval_v1 import (
    evaluate,
    expected_calibration_error,
    floor_sweep,
    per_class_metrics,
    topk_recall,
)


class MetricTests(unittest.TestCase):
    def test_per_class_metrics_hand_computed(self):
        gold = ["a", "a", "b", "b"]
        pred = ["a", "b", "b", "b"]
        m = per_class_metrics(gold, pred)
        self.assertAlmostEqual(m["accuracy"], 0.75)
        self.assertAlmostEqual(m["per_class"]["a"]["precision"], 1.0)
        self.assertAlmostEqual(m["per_class"]["a"]["recall"], 0.5)
        self.assertAlmostEqual(m["per_class"]["b"]["precision"], 2 / 3)
        self.assertAlmostEqual(m["per_class"]["b"]["recall"], 1.0)

    def test_topk_recall_uses_ranked_scores_with_deterministic_ties(self):
        ranked = [{"a": 0.5, "b": 0.5, "c": 0.1}, {"c": 0.9, "a": 0.05, "b": 0.05}]
        self.assertAlmostEqual(topk_recall(["b", "a"], ranked, 1), 0.0)  # tie -> alphabetical picks 'a' for row 0
        self.assertAlmostEqual(topk_recall(["b", "a"], ranked, 2), 1.0)
        self.assertIsNone(topk_recall(["a"], [None], 1))

    def test_ece_zero_when_perfectly_calibrated_and_high_when_overconfident(self):
        self.assertAlmostEqual(expected_calibration_error([1.0, 1.0], [True, True]), 0.0)
        self.assertAlmostEqual(expected_calibration_error([0.9, 0.9], [False, False]), 0.9)

    def test_floor_sweep_coverage_and_accuracy(self):
        rows = floor_sweep([0.9, 0.6, 0.2], [True, True, False], [0.0, 0.5, 0.95])
        self.assertAlmostEqual(rows[0]["coverage"], 1.0)
        self.assertAlmostEqual(rows[1]["coverage"], 2 / 3)
        self.assertAlmostEqual(rows[1]["accuracy_on_covered"], 1.0)
        self.assertAlmostEqual(rows[2]["coverage"], 0.0)


class EvaluateTests(unittest.TestCase):
    def evidence(self, text="verified source excerpt"):
        raw = text.encode("utf-8")
        digest = "a" * 64
        return {
            "sourceRevision": "sha256:" + digest,
            "workspaceRevision": "sha256:" + "b" * 64,
            "textEvidence": text,
            "domainReviewSourceEvidenceV1": {
                "evidenceStatus": "SOURCE_EXCERPT_BINDINGS_MATCHED",
                "revisionStatus": "SOURCE_BINDINGS_MATCH_WORKTREE",
                "currentSourceSha256": "sha256:" + digest,
                "expectedBindingContentDigest": digest,
                "workspaceRevision": "sha256:" + "b" * 64,
                "startByte": 0,
                "endByte": len(raw),
                "excerptText": text,
                "excerptSha256": hashlib.sha256(raw).hexdigest(),
            },
        }

    def rows(self, reviewed):
        return [
            {"sourceRef": "x.ts", "originalLabel": "ui", "reviewedGroup": "ui" if reviewed else None, "reviewStatus": "REVIEWED" if reviewed else None, "reviewMethod": "BLIND_HUMAN_REVIEW_V1" if reviewed else None, "reviewer": "human-reviewer-1" if reviewed else None, "reviewedAt": "2026-10-27T12:00:00Z" if reviewed else None, "sourceRevision": "sha256:" + "a" * 64, "workspaceRevision": "sha256:" + "b" * 64, **self.evidence()},
            {"sourceRef": "y.ts", "originalLabel": "db", "reviewedGroup": "db" if reviewed else None, "reviewStatus": "REVIEWED" if reviewed else None, "reviewMethod": "BLIND_HUMAN_REVIEW_V1" if reviewed else None, "reviewer": "human-reviewer-2" if reviewed else None, "reviewedAt": "2026-10-27T12:01:00Z" if reviewed else None, "sourceRevision": None},
        ]

    def test_no_gold_refuses_accuracy_and_labels_weak_agreement_as_non_accuracy(self):
        rep = evaluate(self.rows(False), lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertNotIn("metrics", rep)
        self.assertIn("NOT accuracy", rep["weakLabelAgreementDiagnostic"]["meaning"])
        self.assertFalse(rep["canonicalAuthority"])
        self.assertFalse(rep["writesPerformed"])

    def test_small_gold_sample_is_flagged_not_trusted(self):
        rep = evaluate(self.rows(True), lambda r: (r["reviewedGroup"], 0.9, None))
        self.assertEqual(rep["status"], "INSUFFICIENT_SAMPLE")
        self.assertAlmostEqual(rep["metrics"]["accuracy"], 1.0)

    def test_reviewer_escape_hatches_are_counted_but_never_gold(self):
        rows = [
            {"reviewedGroup": "AMBIGUOUS", "originalLabel": "ui"},
            {"reviewedGroup": "NOT_A_DOMAIN", "originalLabel": "ui"},
            {"reviewedGroup": "SKIP", "originalLabel": "ui"},
        ]
        rep = evaluate(rows, lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertEqual(rep["goldRows"], 0)
        self.assertEqual(rep["reviewedNonGoldRows"], {"AMBIGUOUS": 1, "NOT_A_DOMAIN": 1, "SKIP": 1})

    def test_synthetic_and_model_reviewers_never_count_as_gold(self):
        rows = [
            {"reviewedGroup": "ui", "reviewer": "PIPELINE_TEST_NOT_A_HUMAN"},
            {"reviewedGroup": "db", "reviewer": "model-classifier-v1"},
            {"reviewedGroup": "graph", "reviewer": "agent-7"},
            {"reviewedGroup": "cache"},
        ]
        rep = evaluate(rows, lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertEqual(rep["goldRows"], 0)
        self.assertEqual(rep["unverifiedReviewRows"], 4)

    def test_legacy_reviewed_timestamp_without_blind_decision_is_not_gold(self):
        rows = [{
            "reviewedGroup": "ui", "reviewStatus": "REVIEWED", "reviewer": "human-reviewer",
            "reviewedAt": "2026-10-27T12:00:00Z", "note": "human must confirm weak label",
        }]
        rep = evaluate(rows, lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertEqual(rep["goldRows"], 0)
        self.assertEqual(rep["unverifiedReviewRows"], 1)

    def test_blind_decision_without_verified_source_excerpt_is_not_gold(self):
        rows = [{
            "reviewedGroup": "ui", "reviewStatus": "REVIEWED", "reviewMethod": "BLIND_HUMAN_REVIEW_V1",
            "reviewer": "human-reviewer", "reviewedAt": "2026-10-27T12:00:00Z", "textEvidence": "Generated summary: likely UI",
            "sourceRevision": "sha256:" + "a" * 64, "workspaceRevision": "sha256:" + "b" * 64,
        }]
        rep = evaluate(rows, lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertEqual(rep["goldRows"], 0)
        self.assertEqual(rep["unverifiedReviewRows"], 1)

    def test_large_sample_without_independent_review_cannot_be_scored(self):
        rows = [{"reviewedGroup": "a" if i % 2 else "b", "reviewStatus": "REVIEWED", "reviewMethod": "BLIND_HUMAN_REVIEW_V1", "reviewer": f"human-{i}", "reviewedAt": "2026-10-27T12:00:00Z", **self.evidence()} for i in range(240)]
        rep = evaluate(rows, lambda r: (r["reviewedGroup"], 1.0, None))
        self.assertEqual(rep["status"], "INSUFFICIENT_REVIEWER_COVERAGE")
        self.assertEqual(rep["minimumDoubleReviewRows"], 24)

    def test_second_reviewer_must_be_distinct_and_cover_at_least_ten_percent(self):
        rows = [
            {
                "reviewedGroup": "a" if i % 2 else "b",
                "reviewStatus": "REVIEWED",
                "reviewMethod": "BLIND_HUMAN_REVIEW_V1",
                "reviewer": f"human-{i}",
                "reviewedAt": "2026-10-27T12:00:00Z",
                **self.evidence(),
                "secondReviewStatus": "REVIEWED" if i < 24 else None,
                "secondReviewMethod": "BLIND_HUMAN_REVIEW_V1" if i < 24 else None,
                "secondReviewer": f"second-{i}" if i < 24 else (f"human-{i}" if i == 24 else None),
                "secondReviewedAt": "2026-10-27T13:00:00Z" if i < 24 or i == 24 else None,
            }
            for i in range(240)
        ]
        rep = evaluate(rows, lambda r: (r["reviewedGroup"], 1.0, None))
        self.assertEqual(rep["status"], "SCORED")
        self.assertEqual(rep["doubleReviewedGoldRows"], 24)

    def test_second_reviewer_without_timestamp_does_not_count(self):
        rows = [{
            "reviewedGroup": "a" if i % 2 else "b",
            "reviewStatus": "REVIEWED",
            "reviewMethod": "BLIND_HUMAN_REVIEW_V1",
            "reviewer": f"human-{i}",
            "reviewedAt": "2026-10-27T12:00:00Z",
            **self.evidence(),
            "secondReviewer": f"second-{i}" if i < 24 else None,
        } for i in range(240)]
        rep = evaluate(rows, lambda r: (r["reviewedGroup"], 1.0, None))
        self.assertEqual(rep["status"], "INSUFFICIENT_REVIEWER_COVERAGE")
        self.assertEqual(rep["doubleReviewedGoldRows"], 0)

    def test_naive_review_timestamp_is_not_human_review_provenance(self):
        rows = [{
            "reviewedGroup": "ui",
            "reviewStatus": "REVIEWED",
            "reviewMethod": "BLIND_HUMAN_REVIEW_V1",
            "reviewer": "human-reviewer",
            "reviewedAt": "2026-10-27T12:00:00",
            **self.evidence(),
        }]
        rep = evaluate(rows, lambda r: ("ui", 0.9, None))
        self.assertEqual(rep["status"], "NO_GOLD_LABELS")
        self.assertEqual(rep["unverifiedReviewRows"], 1)

    def test_revision_qualified_only_filters_rows(self):
        rep = evaluate(self.rows(True), lambda r: (r["reviewedGroup"], None, None), revision_qualified_only=True)
        self.assertEqual(rep["rowsConsidered"], 1)
        self.assertIsNone(rep["ece"])

    def test_large_balanced_gold_can_reach_scored(self):
        rows = [{
            "reviewedGroup": "a" if i % 2 else "b",
            "reviewStatus": "REVIEWED",
            "reviewMethod": "BLIND_HUMAN_REVIEW_V1",
            "originalLabel": "a",
            "reviewer": f"human-{i}",
            "reviewedAt": "2026-10-27T12:00:00Z",
            **self.evidence(),
            "secondReviewStatus": "REVIEWED" if i < 24 else None,
            "secondReviewMethod": "BLIND_HUMAN_REVIEW_V1" if i < 24 else None,
            "secondReviewer": f"second-{i}" if i < 24 else None,
            "secondReviewedAt": "2026-10-27T13:00:00Z" if i < 24 else None,
        } for i in range(240)]
        rep = evaluate(rows, lambda r: (r["reviewedGroup"], 1.0, None))
        self.assertEqual(rep["status"], "SCORED")


if __name__ == "__main__":
    unittest.main()
