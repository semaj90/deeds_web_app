import unittest

from domain_filter_retrieval_replay_v1 import evaluate_document
from ga8_judge_v2_common import sha256_json


def fixture_document():
    queries = [{
        "queryId": "q1",
        "classificationSource": "HELD_OUT_MODEL",
        "classificationTaxonomyRevision": "taxonomy:r1",
        "classifierArtifactChecksum": "sha256:" + "a" * 64,
        "predictedDomainId": "frontend",
        "predictedDomainProbability": 0.8,
        "candidates": [
            {"packetKey": "p1", "sourceRef": "src/a.ts", "baselineRank": 1, "reviewedDomainId": "database", "relevanceGrade": 3, "judgmentSource": "HUMAN_REVIEWED", "reviewerId": "reviewer-a", "confidence": 1.0, "reviewReceiptChecksum": "sha256:" + "b" * 64},
            {"packetKey": "p2", "sourceRef": "src/b.ts", "baselineRank": 2, "reviewedDomainId": "frontend", "relevanceGrade": 2, "judgmentSource": "HUMAN_REVIEWED", "reviewerId": "reviewer-b", "confidence": 0.9, "reviewReceiptChecksum": "sha256:" + "c" * 64},
        ],
    }]
    pool_payload = [{
        "queryId": "q1",
        "predictedDomainId": "frontend",
        "candidates": [
            {"packetKey": "p1", "sourceRef": "src/a.ts", "baselineRank": 1, "reviewedDomainId": "database"},
            {"packetKey": "p2", "sourceRef": "src/b.ts", "baselineRank": 2, "reviewedDomainId": "frontend"},
        ],
    }]
    judgment_payload = [
        {"queryId": "q1", "packetKey": "p1", "relevanceGrade": 3, "judgmentSource": "HUMAN_REVIEWED", "reviewerId": "reviewer-a", "confidence": 1.0, "reviewReceiptChecksum": "sha256:" + "b" * 64},
        {"queryId": "q1", "packetKey": "p2", "relevanceGrade": 2, "judgmentSource": "HUMAN_REVIEWED", "reviewerId": "reviewer-b", "confidence": 0.9, "reviewReceiptChecksum": "sha256:" + "c" * 64},
    ]
    return {
        "schema": "atlas.domain-filter-retrieval-replay-input.v1",
        "evaluationClass": "HUMAN_REVIEWED",
        "canonicalAuthority": False,
        "taxonomyRevision": "taxonomy:r1",
        "taxonomyDomainIds": ["frontend", "database"],
        "classifierArtifactChecksum": "sha256:" + "a" * 64,
        "candidateSnapshotRevision": sha256_json(pool_payload),
        "judgmentSetChecksum": sha256_json(judgment_payload),
        "queries": queries,
    }


class DomainFilterReplayTests(unittest.TestCase):
    def test_reports_relevant_candidates_removed_by_filter(self):
        report = evaluate_document(fixture_document(), k=1)
        result = report["queries"][0]
        self.assertEqual(result["relevantCandidatesRemoved"], 1)
        self.assertEqual(result["baseline"]["ndcgAtK"], 1.0)
        self.assertAlmostEqual(result["domainPrefilter"]["ndcgAtK"], 3 / 7)
        self.assertEqual(report["productionPromotionEligible"], False)

    def test_rejects_unreviewed_judgments(self):
        document = fixture_document()
        document["queries"][0]["candidates"][0]["judgmentSource"] = "MODEL_PROPOSAL"
        with self.assertRaisesRegex(ValueError, "UNREVIEWED_JUDGMENT_PRESENT"):
            evaluate_document(document)

    def test_rejects_tampered_candidate_snapshot(self):
        document = fixture_document()
        document["queries"][0]["candidates"][0]["reviewedDomainId"] = "frontend"
        with self.assertRaisesRegex(ValueError, "CANDIDATE_SNAPSHOT_CHECKSUM_MISMATCH"):
            evaluate_document(document)


if __name__ == "__main__":
    unittest.main()
