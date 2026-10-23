import unittest
import importlib.util
from pathlib import Path

module_path = Path(__file__).with_name("evaluate-directory-metadata-cluster-stability-v1.py")
spec = importlib.util.spec_from_file_location("directory_metadata_cluster_stability", module_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
pairwise_ari_summary = module.pairwise_ari_summary


class DirectoryMetadataClusterStabilityTests(unittest.TestCase):
    def test_identical_partitions_have_perfect_stability(self):
        result = pairwise_ari_summary([[0, 0, 1, 1], [7, 7, 3, 3], [4, 4, 2, 2]])
        self.assertEqual(result["pairCount"], 3)
        self.assertEqual(result["meanAdjustedRandIndex"], 1.0)
        self.assertEqual(result["minimumAdjustedRandIndex"], 1.0)

    def test_partition_changes_are_measured_without_treating_labels_as_identity(self):
        result = pairwise_ari_summary([[0, 0, 1, 1], [0, 1, 0, 1]])
        self.assertEqual(result["pairCount"], 1)
        self.assertEqual(result["meanAdjustedRandIndex"], -0.5)

    def test_requires_multiple_seed_runs(self):
        with self.assertRaisesRegex(ValueError, "AT_LEAST_TWO_CLUSTER_RUNS_REQUIRED"):
            pairwise_ari_summary([[0, 1]])


if __name__ == "__main__":
    unittest.main()
