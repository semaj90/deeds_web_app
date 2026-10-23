import numpy as np
import unittest

from gpu_directory_metadata_clusters_v1 import (
    build_structural_matrix,
    canonicalize_cluster_ids,
    select_structural_features,
)


class DirectoryMetadataClusterTests(unittest.TestCase):
    def test_selects_only_deterministic_inventory_feature_families(self):
        rows = [
            {"ordinal": 0, "featureKey": "domain-proposal:api", "evidenceKind": "ADVISORY_DOMAIN_PROPOSAL_SCORE"},
            {"ordinal": 1, "featureKey": "path-role:source", "evidenceKind": "PATH_INVENTORY_COUNT"},
            {"ordinal": 2, "featureKey": "source-class:FIRST_PARTY_SOURCE", "evidenceKind": "PATH_SOURCE_CLASS_INVENTORY_COUNT"},
            {"ordinal": 3, "featureKey": "profile:typescript", "evidenceKind": "PROFILE_INVENTORY_COUNT"},
            {"ordinal": 4, "featureKey": "package:zod", "evidenceKind": "ADVISORY_IMPORT_REFERENCE_COUNT"},
        ]
        self.assertEqual([row["ordinal"] for row in select_structural_features(rows)], [1, 2, 3])


    def test_builds_log_scaled_normalized_rows_and_abstains_on_empty_directories(self):
        features = [
            {"ordinal": 0, "featureKey": "domain-proposal:api", "evidenceKind": "ADVISORY_DOMAIN_PROPOSAL_SCORE"},
            {"ordinal": 1, "featureKey": "path-role:source", "evidenceKind": "PATH_INVENTORY_COUNT"},
            {"ordinal": 2, "featureKey": "profile:typescript", "evidenceKind": "PROFILE_INVENTORY_COUNT"},
        ]
        sparse = [
            {"entityOrdinal": 0, "featureOrdinal": 0, "value": 9},
            {"entityOrdinal": 0, "featureOrdinal": 1, "value": 3},
            {"entityOrdinal": 1, "featureOrdinal": 2, "value": 1},
        ]
        matrix, eligible, selected = build_structural_matrix(3, features, sparse)
        self.assertEqual([row["featureKey"] for row in selected], ["path-role:source", "profile:typescript"])
        self.assertEqual(eligible.tolist(), [True, True, False])
        self.assertTrue(np.isclose(np.linalg.norm(matrix[0]), 1.0))
        self.assertTrue(np.isclose(np.linalg.norm(matrix[1]), 1.0))
        self.assertTrue(np.array_equal(matrix[2], np.zeros(2, dtype=np.float32)))


    def test_rejects_duplicate_structural_values_and_invalid_ordinals(self):
        features = [{"ordinal": 1, "featureKey": "path-role:source", "evidenceKind": "PATH_INVENTORY_COUNT"}]
        duplicate = [
            {"entityOrdinal": 0, "featureOrdinal": 1, "value": 2},
            {"entityOrdinal": 0, "featureOrdinal": 1, "value": 3},
        ]
        with self.assertRaisesRegex(ValueError, "DUPLICATE_STRUCTURAL_SPARSE_VALUE"):
            build_structural_matrix(1, features, duplicate)
        with self.assertRaisesRegex(ValueError, "ENTITY_ORDINAL_INVALID"):
            build_structural_matrix(1, features, [{"entityOrdinal": 1, "featureOrdinal": 1, "value": 1}])


    def test_cluster_ids_are_stable_by_first_directory_ordinal(self):
        first = canonicalize_cluster_ids(np.array([8, 4, 8, 4]), np.array([4, 1, 2, 3]))
        permuted = canonicalize_cluster_ids(np.array([2, 7, 2, 7]), np.array([4, 1, 2, 3]))
        self.assertEqual(first.tolist(), [1, 0, 1, 0])
        self.assertEqual(permuted.tolist(), first.tolist())


if __name__ == "__main__":
    unittest.main()

