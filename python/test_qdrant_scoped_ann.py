from __future__ import annotations

import unittest

from atlas_compute.qdrant_scoped_ann import build_same_corpus_filter


class QdrantScopedAnnTests(unittest.TestCase):
    def test_snapshot_subset_uses_match_any_and_self_exclusion(self) -> None:
        value = build_same_corpus_filter(
            self_canonical_id="feature:b",
            canonical_payload_key="canonical_id",
            comparison_scope="snapshot_subset",
            scoped_canonical_ids=["feature:a", "feature:b", "feature:c"],
        )
        self.assertEqual(value["must_not"], [
            {"key": "canonical_id", "match": {"value": "feature:b"}},
        ])
        self.assertEqual(value["must"], [
            {"key": "canonical_id", "match": {"any": ["feature:a", "feature:b", "feature:c"]}},
        ])

    def test_full_collection_does_not_add_subset_filter(self) -> None:
        value = build_same_corpus_filter(
            self_canonical_id="feature:b",
            canonical_payload_key="canonical_id",
            comparison_scope="full_collection",
            scoped_canonical_ids=["feature:a", "feature:b", "feature:c"],
        )
        self.assertNotIn("must", value)
        self.assertEqual(value["must_not"][0]["match"]["value"], "feature:b")

    def test_snapshot_subset_requires_id_scope(self) -> None:
        with self.assertRaises(ValueError):
            build_same_corpus_filter(
                self_canonical_id="feature:b",
                canonical_payload_key="canonical_id",
                comparison_scope="snapshot_subset",
                scoped_canonical_ids=[],
            )


if __name__ == "__main__":
    unittest.main()
