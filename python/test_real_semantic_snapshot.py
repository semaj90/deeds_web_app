from __future__ import annotations

import unittest

from atlas_compute.real_semantic_snapshot import derive_real_semantic_snapshot_revision


class RealSemanticSnapshotRevisionTests(unittest.TestCase):
    def test_revision_is_deterministic_and_revision_qualified(self) -> None:
        args = dict(
            workspace_revision="sha256:" + "1" * 64,
            representation_revision="embeddinggemma-full768-v1",
            source_ndjson_sha256="2" * 64,
            source_revision_checksum="3" * 64,
        )
        first = derive_real_semantic_snapshot_revision(**args)
        second = derive_real_semantic_snapshot_revision(**args)
        self.assertEqual(first, second)
        self.assertRegex(first, r"^sha256:[a-f0-9]{64}$")

    def test_source_world_or_representation_change_changes_snapshot_revision(self) -> None:
        base = dict(
            workspace_revision="sha256:" + "1" * 64,
            representation_revision="embeddinggemma-full768-v1",
            source_ndjson_sha256="2" * 64,
            source_revision_checksum="3" * 64,
        )
        expected = derive_real_semantic_snapshot_revision(**base)
        self.assertNotEqual(expected, derive_real_semantic_snapshot_revision(**{**base, "workspace_revision": "sha256:" + "4" * 64}))
        self.assertNotEqual(expected, derive_real_semantic_snapshot_revision(**{**base, "representation_revision": "embeddinggemma-full768-v2"}))
        self.assertNotEqual(expected, derive_real_semantic_snapshot_revision(**{**base, "source_revision_checksum": "5" * 64}))

    def test_revision_rejects_weak_or_malformed_coordinates(self) -> None:
        with self.assertRaises(ValueError):
            derive_real_semantic_snapshot_revision(
                workspace_revision="123",
                representation_revision="embeddinggemma-full768-v1",
                source_ndjson_sha256="2" * 64,
                source_revision_checksum="3" * 64,
            )
        with self.assertRaises(ValueError):
            derive_real_semantic_snapshot_revision(
                workspace_revision="sha256:" + "1" * 64,
                representation_revision="",
                source_ndjson_sha256="2" * 64,
                source_revision_checksum="3" * 64,
            )


if __name__ == "__main__":
    unittest.main()
