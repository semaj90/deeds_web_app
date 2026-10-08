import math
import unittest
from cpu_candidate_matrix import (
    FEATURE_NAMES, Candidate, build_cpu_candidate_matrix, matrix_receipt,
)

class CandidateMatrixTests(unittest.TestCase):
    def sample(self, values=None, packet="p1", source_revision="s1", workspace="w1"):
        return Candidate(packet, "src/a.py", source_revision, workspace, values or {})

    def test_exact_columns_and_presence(self):
        m = build_cpu_candidate_matrix([self.sample({
            "semantic_similarity_768": .75, "execution_utility": 0.0,
        })])
        self.assertEqual(len(FEATURE_NAMES), 25)
        self.assertEqual(len(m.features[0]), 25)
        self.assertEqual(m.mask[0][0], 1)
        self.assertEqual(m.mask[0][18], 1)
        self.assertEqual(m.mask[0][1], 0)
        self.assertEqual(m.features[0][1], 0.0)

    def test_unknown_feature_rejected(self):
        with self.assertRaisesRegex(ValueError, "UNKNOWN_FEATURE"):
            build_cpu_candidate_matrix([self.sample({"not_a_column": 1})])

    def test_duplicate_packet_rejected(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE_PACKET_KEY"):
            build_cpu_candidate_matrix([self.sample(), self.sample()])

    def test_revision_mismatch_rejected(self):
        with self.assertRaisesRegex(ValueError, "WORKSPACE_REVISION_MISMATCH"):
            build_cpu_candidate_matrix([self.sample(), self.sample(packet="p2", workspace="w2")])

    def test_bad_numbers_rejected(self):
        for bad in (float("nan"), float("inf"), 1e100, True):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                build_cpu_candidate_matrix([self.sample({"lexical_score": bad})])

    def test_receipt_stable_and_non_authoritative(self):
        m = build_cpu_candidate_matrix([self.sample({"lexical_score": .5})])
        self.assertEqual(matrix_receipt(m), matrix_receipt(m))
        self.assertFalse(matrix_receipt(m)["canonical_authority"])
        self.assertFalse(matrix_receipt(m)["writes_performed"])

if __name__ == "__main__":
    unittest.main()
