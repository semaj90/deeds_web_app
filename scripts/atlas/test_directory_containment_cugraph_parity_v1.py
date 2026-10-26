import importlib.util
import math
import unittest
from pathlib import Path

module_path = Path(__file__).with_name("prove-directory-containment-cugraph-parity-v1.py")
spec = importlib.util.spec_from_file_location("directory_containment_cugraph_parity", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DirectoryContainmentParityTests(unittest.TestCase):
    def test_accepts_score_ties_with_same_top_k_membership(self):
        result = module.compare_outputs(
            {0: 0.4, 1: 0.3, 2: 0.3},
            {0: 0.4, 1: 0.299999999, 2: 0.300000001},
            {0: 0, 1: 1, 2: 1}, {0: -1, 1: 0, 2: 0},
            {0: 0, 1: 1, 2: 1}, {0: -1, 1: 0, 2: 0},
            2e-9, top_k=3, minimum_top_k_overlap=1.0,
        )
        self.assertTrue(result["parity"])
        self.assertFalse(result["sameTotalOrder"])
        self.assertEqual(result["topKOverlap"], 1.0)

    def test_rejects_non_finite_scores(self):
        with self.assertRaisesRegex(ValueError, "PAGERANK_SCORE_INVALID"):
            module.compare_outputs(
                {0: 1.0}, {0: math.nan}, {0: 0}, {0: -1}, {0: 0}, {0: -1}, 1e-5,
            )

    def test_rejects_bfs_parent_mismatch_even_when_depth_matches(self):
        result = module.compare_outputs(
            {0: 0.5, 1: 0.5}, {0: 0.5, 1: 0.5},
            {0: 0, 1: 1}, {0: -1, 1: 0},
            {0: 0, 1: 1}, {0: -1, 1: 2},
            1e-9, top_k=2,
        )
        self.assertFalse(result["parity"])
        self.assertFalse(result["bfsParentsMatch"])

    def test_rejects_page_rank_ordinal_loss(self):
        with self.assertRaisesRegex(ValueError, "PAGERANK_ORDINAL_COVERAGE_MISMATCH"):
            module.compare_outputs(
                {0: 0.5, 1: 0.5}, {0: 1.0},
                {0: 0}, {0: -1}, {0: 0}, {0: -1}, 1e-5,
            )


if __name__ == "__main__":
    unittest.main()
