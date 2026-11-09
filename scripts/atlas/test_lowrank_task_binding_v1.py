import unittest

from lowrank_task_binding_v1 import validate_bound_task_rows


def row(ordinal=0, **overrides):
    digest = "sha256:" + "a" * 64
    value = {
        "task_id": "openspec:task-1",
        "canonical_task_key": "openspec:task-1",
        "candidate_packet_key": "ace:packet:task-1",
        "source_ref": "openspec/changes/example/tasks.md#L1",
        "source_revision": digest,
        "workspace_revision": digest,
        "candidate_snapshot_revision": digest,
        "ordinal_map_checksum": digest,
        "binding_receipt_sha256": digest,
        "semantic_representation_revision": digest,
        "feature_revision": digest,
        "graph_revision": digest,
        "candidate_ordinal": ordinal,
        "evidence_refs": ["source:sha256:" + "b" * 64],
        "semantic_embedding_768": [0.0] * 768,
        "latent_vector_64": [0.0] * 64,
        "latent_representation_id": "latent_autoencoder_64_v1",
        "latent_representation_revision": digest,
        "feature_row": [0.0] * 10,
    }
    value.update(overrides)
    return value


class LowrankTaskBindingTests(unittest.TestCase):
    def test_accepts_complete_revision_bound_record(self):
        self.assertEqual(validate_bound_task_rows([row()])[0]["candidate_ordinal"], 0)

    def test_rejects_current_unbound_concept_tie_shape(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_BINDING_FIELDS_MISSING"):
            validate_bound_task_rows([{"task_id": "openspec/changes/x/tasks.md#L1"}])

    def test_rejects_generated_packet_identity(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_GENERATED_PACKET_KEY"):
            validate_bound_task_rows([row(candidate_packet_key="packet:task-1")])

    def test_rejects_non_sha_revisions(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_REVISION_NOT_SHA256"):
            validate_bound_task_rows([row(source_revision="rev:openspec:20261107")])

    def test_rejects_duplicate_logical_identity(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_DUPLICATE_TASK_IDENTITY"):
            validate_bound_task_rows([row(), row(1, task_id="other-locator")])

    def test_rejects_mixed_snapshot(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_MIXED_SNAPSHOT_OR_WORKSPACE"):
            validate_bound_task_rows([row(), row(1, task_id="openspec:task-2", canonical_task_key="openspec:task-2",
                                                  candidate_packet_key="ace:packet:task-2",
                                                  candidate_snapshot_revision="sha256:" + "c" * 64)])

    def test_rejects_ordinal_gap(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_ORDINAL_MISMATCH"):
            validate_bound_task_rows([row(3)])

    def test_rejects_wrong_embedding_or_latent_width(self):
        with self.assertRaisesRegex(ValueError, "LOWRANK_SEMANTIC_768_INVALID"):
            validate_bound_task_rows([row(semantic_embedding_768=[0.0] * 64)])
        with self.assertRaisesRegex(ValueError, "LOWRANK_LATENT_64_INVALID"):
            validate_bound_task_rows([row(latent_vector_64=[0.0] * 768)])


if __name__ == "__main__":
    unittest.main()
