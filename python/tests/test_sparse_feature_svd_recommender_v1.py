#!/usr/bin/env python3
"""Bounded tests for the offline sparse-feature SVD challenger."""

import hashlib
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from atlas_compute.sparse_feature_svd_recommender_v1 import (
    recommend_sparse_features_v1,
    validate_sparse_feature_snapshot,
)


def make_snapshot():
    evidence_hash = "d" * 64
    observations = [
        ("context-a", "feature-a", "OBSERVED_ASSOCIATION", "claim-a"),
        ("context-a", "feature-b", "OBSERVED_ASSOCIATION", "claim-b"),
        ("context-a", "feature-c", "EXPLICIT_NEGATIVE", "claim-c"),
        ("context-b", "feature-a", "OBSERVED_ASSOCIATION", "claim-d"),
        ("context-b", "feature-b", "OBSERVED_ASSOCIATION", "claim-e"),
        ("context-b", "feature-c", "OBSERVED_ASSOCIATION", "claim-f"),
        ("context-c", "feature-a", "OBSERVED_ASSOCIATION", "claim-g"),
        ("context-c", "feature-c", "EXPLICIT_NEGATIVE", "claim-h"),
    ]
    rows = []
    for context_ref, feature_key, polarity, claim_suffix in observations:
        rows.append({
            "contextRef": context_ref,
            "contextRevision": "sha256:" + "a" * 64,
            "candidateFeatureKey": feature_key,
            "candidateSourceRef": "src/" + feature_key + ".ts",
            "candidateSourceRevision": "sha256:" + (feature_key[-1] * 64),
            "polarity": polarity,
            "evidenceClaimIds": ["00000000-0000-4000-8000-00000000000" + str(ord(claim_suffix[-1]) % 10)],
            "evidenceSourceRef": "audit://fixture/" + claim_suffix,
            "evidenceSourceRevision": "sha256:" + evidence_hash,
            "evidenceSha256": evidence_hash,
        })
    rows.sort(key=lambda row: (row["contextRef"], row["candidateFeatureKey"]))
    for row in rows:
        row["evidenceClaimIds"].sort()
    body = {
        "schema": "atlas.sparse-feature-snapshot.v1",
        "sourceSnapshotRef": "fixture://sparse-feature-observations",
        "sourceSnapshotRevision": "sha256:" + "a" * 64,
        "candidateCatalogSnapshotSha256": "b" * 64,
        "observations": rows,
        "missingPairSemantics": "UNKNOWN_NOT_NEGATIVE",
        "admission": "PROPOSAL_ONLY",
        "canonicalAuthority": False,
    }
    serialized = json.dumps(body, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    body["snapshotSha256"] = hashlib.sha256(serialized).hexdigest()
    return body


class TestSparseFeatureSvdRecommenderV1(unittest.TestCase):
    def test_masked_svd_proposes_only_unknown_pairs_with_revision_lineage(self):
        snapshot = make_snapshot()
        receipt = recommend_sparse_features_v1(snapshot, "context-c", rank=2, top_k=3)

        self.assertEqual(receipt.status, "PROPOSED")
        self.assertEqual(receipt.method, "masked_soft_impute_truncated_svd_cpu_v1")
        self.assertEqual(receipt.unknown_pair_semantics, "UNKNOWN_NOT_NEGATIVE")
        self.assertFalse(receipt.canonical_authority)
        self.assertFalse(receipt.writes_performed)
        self.assertEqual(receipt.device, "cpu")
        self.assertTrue(receipt.configuration_sha256)
        self.assertTrue(receipt.output_sha256)
        self.assertTrue(all(item.candidate_feature_key == "feature-b" for item in receipt.recommendations))
        self.assertTrue(all(item.candidate_source_revision.startswith("sha256:") for item in receipt.recommendations))

    def test_snapshot_digest_and_explicit_revision_bindings_are_required(self):
        snapshot = make_snapshot()
        observations, actual_digest = validate_sparse_feature_snapshot(snapshot)
        self.assertEqual(len(observations), len(snapshot["observations"]))
        self.assertEqual(actual_digest, snapshot["snapshotSha256"])

        tampered = make_snapshot()
        tampered["snapshotSha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "SPARSE_FEATURE_SNAPSHOT_DIGEST_MISMATCH"):
            validate_sparse_feature_snapshot(tampered)

    def test_sparse_svd_snapshot_rejects_dense_embedding_representation_fields(self):
        snapshot = make_snapshot()
        snapshot["embeddingGemmaMrl128"] = [0.0] * 128

        with self.assertRaisesRegex(ValueError, "SPARSE_FEATURE_SNAPSHOT_SHAPE_INVALID"):
            validate_sparse_feature_snapshot(snapshot)

    def test_bounds_and_missing_target_fail_closed(self):
        snapshot = make_snapshot()
        with self.assertRaisesRegex(ValueError, "RANK_OUT_OF_BOUNDS"):
            recommend_sparse_features_v1(snapshot, "context-c", rank=33)
        with self.assertRaisesRegex(ValueError, "TARGET_CONTEXT_NOT_IN_SNAPSHOT"):
            recommend_sparse_features_v1(snapshot, "context-missing")

    def test_unknown_pairs_are_not_materialized_as_negative_examples(self):
        snapshot = make_snapshot()
        receipt = recommend_sparse_features_v1(snapshot, "context-c", rank=2, top_k=3)
        known_for_context = {
            row["candidateFeatureKey"]
            for row in snapshot["observations"]
            if row["contextRef"] == "context-c"
        }
        self.assertNotIn("feature-b", known_for_context)
        self.assertEqual(receipt.observed_pair_count, len(snapshot["observations"]))
        self.assertEqual(receipt.status, "PROPOSED")


if __name__ == "__main__":
    unittest.main()
