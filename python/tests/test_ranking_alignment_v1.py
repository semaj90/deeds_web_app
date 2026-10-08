"""Offline stdlib contract tests; no services, CUDA or training required."""
import unittest
from atlas_compute.ranking_alignment_v1 import align_rows, manifest_digest, split_by_query

def row(q, key):
    return {
        "qid": q, "packet_key": key, "label": 1.0,
        "source_revision": "sr1", "workspace_revision": "wr1",
        "representation_revision": "rr1", "revision_status": "PROVEN",
        "semantic_similarity": 0.7,
    }

class RankingAlignmentTests(unittest.TestCase):
    def test_stable_order_and_digest(self):
        a = align_rows([row("q2","b"), row("q1","a")])
        b = align_rows([row("q1","a"), row("q2","b")])
        self.assertEqual(a, b)
        self.assertEqual(manifest_digest(a), manifest_digest(b))

    def test_stale_rejected(self):
        r = row("q","a")
        r["revision_status"] = "STALE"
        with self.assertRaisesRegex(ValueError, "NOT_PROVEN"):
            align_rows([r])

    def test_duplicate_rejected(self):
        with self.assertRaisesRegex(ValueError, "DUPLICATE"):
            align_rows([row("q","a"), row("q","a")])

    def test_query_groups_disjoint(self):
        rows = align_rows([row(f"q{i}",f"k{j}") for i in range(10) for j in range(2)])
        groups = split_by_query(rows)
        qsets = [set(r.qid for r in s) for s in groups]
        self.assertFalse(qsets[0] & qsets[1] | qsets[0] & qsets[2] | qsets[1] & qsets[2])
        self.assertEqual(sum(len(x) for x in groups), 20)

if __name__ == "__main__":
    unittest.main()
