from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import torch

from atlas_spatial_mcts_pipeline_v1 import AtlasSpatialMctsPipeline
from spatial_search_engine_v1 import (
    SpatialCodebaseIndex,
    build_hamming_projection_artifact_v1,
    decode_hamming_projection_artifact_v1,
    evaluate_hamming_topk_recall_v1,
    tie_aware_recall_at_k_v1,
    write_hamming_projection_artifact_v1,
)


class TestJSpaceProjectionArtifactV1(unittest.TestCase):
    def test_generation_is_repeatable_and_does_not_mutate_global_torch_rng(self) -> None:
        torch.manual_seed(90210)
        state_before = torch.random.get_rng_state().clone()
        first, first_manifest = build_hamming_projection_artifact_v1(dim=24, j_bits=8, seed=7)
        state_after = torch.random.get_rng_state()
        second, second_manifest = build_hamming_projection_artifact_v1(dim=24, j_bits=8, seed=7)

        self.assertTrue(torch.equal(state_before, state_after))
        self.assertEqual(first, second)
        self.assertEqual(first_manifest, second_manifest)
        self.assertEqual(first_manifest["generationDevice"], "cpu")
        self.assertEqual(first_manifest["dtype"], "float32-le")
        self.assertEqual(first_manifest["bitOrder"], "least-significant-bit-first")

    def test_decoder_checks_artifact_hash_matrix_hash_and_shape(self) -> None:
        artifact, manifest = build_hamming_projection_artifact_v1(dim=16, j_bits=4, seed=99)
        matrix, decoded_manifest = decode_hamming_projection_artifact_v1(
            artifact,
            expected_artifact_sha256=manifest["artifactSha256"],
        )
        self.assertEqual(tuple(matrix.shape), (16, 4))
        self.assertEqual(decoded_manifest, manifest)
        with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_SHA256_MISMATCH"):
            decode_hamming_projection_artifact_v1(artifact, expected_artifact_sha256="0" * 64)

        tampered = bytearray(artifact)
        tampered[-1] ^= 1
        with self.assertRaisesRegex(ValueError, "JSPACE_MATRIX_CHECKSUM_MISMATCH"):
            decode_hamming_projection_artifact_v1(tampered)
        with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_MAGIC_INVALID"):
            decode_hamming_projection_artifact_v1(b"not-an-artifact")

    def test_explicit_atomic_artifact_load_is_revision_pinned(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "jspace-v1.bin"
            receipt = write_hamming_projection_artifact_v1(target, dim=32, j_bits=8, seed=11)
            index = SpatialCodebaseIndex(
                dim=32,
                j_bits=8,
                projection_path=str(target),
                projection_sha256=str(receipt["artifactSha256"]),
            )
            self.assertTrue(index.projection_artifact_backed)
            self.assertEqual(index.projection_manifest["artifactSha256"], receipt["artifactSha256"])
            self.assertEqual(tuple(index.hamming_proj.shape), (32, 8))
            self.assertEqual(
                write_hamming_projection_artifact_v1(target, dim=32, j_bits=8, seed=11)["artifactSha256"],
                receipt["artifactSha256"],
            )
            with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_PATH_IMMUTABLE"):
                write_hamming_projection_artifact_v1(target, dim=32, j_bits=8, seed=12)
            with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_SHAPE_MISMATCH"):
                SpatialCodebaseIndex(
                    dim=31,
                    j_bits=8,
                    projection_path=str(target),
                    projection_sha256=str(receipt["artifactSha256"]),
                )
            with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_HASH_REQUIRED"):
                SpatialCodebaseIndex(dim=32, j_bits=8, projection_path=str(target))

    def test_ephemeral_projection_requires_explicit_opt_in(self) -> None:
        with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_PATH_REQUIRED"):
            SpatialCodebaseIndex(dim=12, j_bits=4, seed=5)
        first = SpatialCodebaseIndex(dim=12, j_bits=4, seed=5, allow_ephemeral_projection=True)
        second = SpatialCodebaseIndex(dim=12, j_bits=4, seed=5, allow_ephemeral_projection=True)
        self.assertFalse(first.projection_artifact_backed)
        self.assertTrue(torch.equal(first.hamming_proj, second.hamming_proj))

    def test_mcts_pipeline_requires_and_forwards_pinned_artifact(self) -> None:
        with self.assertRaisesRegex(ValueError, "JSPACE_ARTIFACT_PATH_REQUIRED"):
            AtlasSpatialMctsPipeline(dim=16, j_bits=4)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "jspace-v1.bin"
            receipt = write_hamming_projection_artifact_v1(target, dim=16, j_bits=4, seed=17)
            pipeline = AtlasSpatialMctsPipeline(
                dim=16,
                j_bits=4,
                projection_artifact_path=str(target),
                projection_artifact_sha256=str(receipt["artifactSha256"]),
            )
            self.assertTrue(pipeline.spatial_index.projection_artifact_backed)
            self.assertEqual(
                pipeline.spatial_index.projection_manifest["artifactSha256"],
                receipt["artifactSha256"],
            )

    def test_tie_aware_recall_accepts_any_exact_neighbor_tied_at_kth_score(self) -> None:
        exact_scores = torch.tensor([1.0, 0.9, 0.9, 0.7])
        approximate_order = torch.tensor([2, 0, 3, 1])
        self.assertEqual(tie_aware_recall_at_k_v1(exact_scores, approximate_order, 2), 1.0)
        self.assertAlmostEqual(tie_aware_recall_at_k_v1(exact_scores, torch.tensor([2, 3, 0, 1]), 2), 0.5)
        with self.assertRaisesRegex(ValueError, "JSPACE_RECALL_APPROXIMATE_ORDER_INVALID"):
            tie_aware_recall_at_k_v1(exact_scores, torch.tensor([0, 0, 2, 3]), 2)

    def test_recall_evaluator_is_bounded_and_receipts_both_frozen_inputs(self) -> None:
        generator = torch.Generator(device="cpu").manual_seed(123)
        corpus = torch.randn((9, 16), generator=generator)
        queries = torch.randn((3, 16), generator=generator)
        index = SpatialCodebaseIndex(dim=16, j_bits=8, seed=7, allow_ephemeral_projection=True)
        receipt = evaluate_hamming_topk_recall_v1(index, corpus, queries, k_values=(1, 3))
        self.assertEqual(receipt["status"], "FIXTURE_OR_CALLER_SUPPLIED_COHORT_ONLY")
        self.assertEqual(receipt["cohort"]["pairwiseComparisonCount"], 27)
        self.assertTrue(str(receipt["cohort"]["corpusSha256"]).startswith("sha256:"))
        self.assertTrue(str(receipt["cohort"]["queriesSha256"]).startswith("sha256:"))
        self.assertEqual(set(receipt["recallAtK"]), {"1", "3"})
        self.assertFalse(receipt["canonicalAuthority"])
        self.assertFalse(receipt["writesPerformed"])
        with self.assertRaisesRegex(ValueError, "JSPACE_RECALL_PAIR_BUDGET_EXCEEDED"):
            evaluate_hamming_topk_recall_v1(index, corpus, queries, k_values=(1,), max_pairwise_comparisons=10)


if __name__ == "__main__":
    unittest.main()
