from __future__ import annotations

import unittest

import numpy as np


try:
    import torch  # noqa: F401
    from atlas_compute.exact_semantic import exact_semantic_search
    from atlas_compute.hypergraph_tensor import run_tensor_ppr
    from atlas_compute.interpolation import interpolate_topology_field
    from atlas_compute.low_rank import compare_low_rank_recommendations, shortlist_candidate_ordinals
    from atlas_compute.rapids_matrix import deterministic_farthest_first_ordinals
    TORCH_AVAILABLE = True
except Exception:
    TORCH_AVAILABLE = False


@unittest.skipUnless(TORCH_AVAILABLE, "PyTorch is required for Atlas compute reference tests")
class AtlasComputeReferenceTests(unittest.TestCase):
    def test_exact_semantic_uses_stable_ordinal_tie_break(self) -> None:
        corpus = np.array([[1, 0], [1, 0], [0, 1]], dtype=np.float32)
        query = np.array([[1, 0]], dtype=np.float32)
        receipt = exact_semantic_search(
            corpus, query, ["entity:a", "entity:b", "entity:c"],
            metric="cosine", top_k=3, device="cpu",
        )
        self.assertEqual([hit.canonical_id for hit in receipt.hits[0]], ["entity:a", "entity:b", "entity:c"])
        self.assertEqual(receipt.tie_break, "distance_ascending_then_canonical_ordinal")

    def test_exact_semantic_metrics_agree_on_simple_fixture(self) -> None:
        corpus = np.array([[1, 0], [0, 1], [-1, 0]], dtype=np.float32)
        query = np.array([[1, 0]], dtype=np.float32)
        ids = ["positive", "orthogonal", "negative"]
        for metric in ("cosine", "inner_product", "sqeuclidean"):
            receipt = exact_semantic_search(corpus, query, ids, metric=metric, top_k=3, device="cpu")
            self.assertEqual(receipt.hits[0][0].canonical_id, "positive")

    def test_tensor_ppr_favors_seed_component(self) -> None:
        receipt = run_tensor_ppr(
            ["entity:a", "relationship:r", "entity:b", "entity:x", "relationship:u"],
            [("entity:a", "relationship:r"), ("relationship:r", "entity:b"), ("entity:x", "relationship:u")],
            ["entity:a"], device="cpu", epsilon=1e-8, max_iterations=300,
        )
        scores = dict(zip(receipt.node_ids, receipt.scores))
        self.assertGreater(scores["relationship:r"], scores["relationship:u"])
        self.assertEqual(receipt.convergence_rule, "l1_delta_lt_node_count_times_epsilon")

    def test_cubic_interpolation_reproduces_integer_lattice_value(self) -> None:
        field = np.arange(4 * 4 * 4, dtype=np.float32).reshape(4, 4, 4)
        output, receipt = interpolate_topology_field(field, [[2.0, 1.0, 3.0]], spatial_dimensions=3, device="cpu")
        self.assertAlmostEqual(float(output[0]), float(field[2, 1, 3]), places=5)
        self.assertEqual(receipt.maximum_samples_per_coordinate, 64)
        self.assertFalse(receipt.canonical_authority)

    def test_quadcubic_interpolation_has_256_sample_bound(self) -> None:
        field = np.zeros((4, 4, 4, 4), dtype=np.float32)
        field[1, 2, 3, 0] = 7.0
        output, receipt = interpolate_topology_field(field, [[1.0, 2.0, 3.0, 0.0]], spatial_dimensions=4, device="cpu")
        self.assertAlmostEqual(float(output[0]), 7.0, places=5)
        self.assertEqual(receipt.maximum_samples_per_coordinate, 256)

    def test_low_rank_challenger_is_repeatable_with_seed(self) -> None:
        rng = np.random.default_rng(42)
        left = rng.normal(size=(12, 3)).astype(np.float32)
        right = rng.normal(size=(3, 16)).astype(np.float32)
        matrix = left @ right
        first = compare_low_rank_recommendations(matrix, query_row=2, target_rank=3, top_k=5, device="cpu", seed=123)
        second = compare_low_rank_recommendations(matrix, query_row=2, target_rank=3, top_k=5, device="cpu", seed=123)
        self.assertEqual(first.output_checksum, second.output_checksum)
        self.assertEqual(first.length_square_sample_ordinals, second.length_square_sample_ordinals)
        self.assertGreaterEqual(first.top_k_overlap, 0.8)
        self.assertFalse(first.canonical_authority)

    def test_candidate_shortlist_preserves_ordinals_and_target_bound(self) -> None:
        matrix = np.arange(512 * 8, dtype=np.float32).reshape(512, 8)
        ordinals = np.arange(1000, 1512, dtype=np.int64)
        query = matrix[17]
        first, receipt = shortlist_candidate_ordinals(
            matrix, ordinals, query, rank=4, target_count=96, device="cpu", seed=123
        )
        second, second_receipt = shortlist_candidate_ordinals(
            matrix, ordinals, query, rank=4, target_count=96, device="cpu", seed=123
        )
        self.assertEqual(len(first), 96)
        self.assertEqual(len(set(first)), 96)
        self.assertTrue(set(first).issubset(set(ordinals.tolist())))
        self.assertEqual(first, second)
        self.assertEqual(receipt.output_checksum, second_receipt.output_checksum)

    def test_farthest_first_initialization_is_deterministic_and_tie_stable(self) -> None:
        matrix = np.array([
            [0.0, 0.0],
            [2.0, 0.0],
            [-2.0, 0.0],
            [0.0, 3.0],
        ], dtype=np.float32)
        first = deterministic_farthest_first_ordinals(matrix, 3)
        second = deterministic_farthest_first_ordinals(matrix, 3)
        self.assertEqual(first, second)
        self.assertEqual(first[0], 0)
        self.assertEqual(first[1], 3)
        # Rows 1 and 2 are symmetric after selecting 0 and 3; ordinal 1 wins.
        self.assertEqual(first[2], 1)

    @staticmethod
    def _feature_task(index: int, **features: tuple) -> dict:
        """Build a workboard task with a presence-masked featureVector: name=(value, basis) or None (absent)."""
        cells = {}
        for name, spec in features.items():
            cells[name] = (
                {"present": False, "value": 0, "basis": "ABSENT"}
                if spec is None
                else {"present": True, "value": spec[0], "basis": spec[1]}
            )
        return {"id": f"t{index}", "featureVector": {"schema": "atlas.workboard-feature-vector.v1", "features": cells}}

    def _run_task_recommendation(self, tasks: list[dict], *extra_args: str) -> dict:
        import json
        import subprocess
        import sys
        import tempfile
        from pathlib import Path

        script = Path(__file__).resolve().parent / "build_low_rank_task_recommendation_v2.py"
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "workboard.json"
            output = Path(tmp) / "out.json"
            source.write_text(json.dumps({"semanticChecksum": "test", "tasks": tasks}), encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, str(script), "--input", str(source), "--output", str(output), *extra_args],
                capture_output=True, text=True, check=False,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            return json.loads(output.read_text(encoding="utf-8"))

    def test_task_recommendation_is_deterministic_and_non_authoritative(self) -> None:
        tasks = [
            self._feature_task(
                i,
                goalRank=((i % 5) * 10, "DERIVED"),
                selectionEligible=(i % 2, "DERIVED"),
                estimatedMinutes=(10 + (i * 7) % 40, "OBSERVED"),
                unblocksGateCount=((i * 5) % 6, "OBSERVED"),
            )
            for i in range(40)
        ]
        first = self._run_task_recommendation(tasks)
        second = self._run_task_recommendation(tasks)
        self.assertEqual(first["status"], "OK")
        self.assertEqual(first["outputChecksum"], second["outputChecksum"])
        self.assertFalse(first["canonicalAuthority"])
        self.assertFalse(first["eligibleForAuthority"])
        self.assertEqual(sorted(item["id"] for item in first["tasks"]), sorted(task["id"] for task in tasks))
        self.assertEqual([item["rank"] for item in first["tasks"]], list(range(1, 41)))
        self.assertEqual(first["featuresUsedByDeterministicRank"], ["goalRank"])

    def test_task_recommendation_refuses_single_varying_feature(self) -> None:
        tasks = [
            self._feature_task(i, goalRank=((i % 3) * 10, "DERIVED"), estimatedMinutes=(15, "OBSERVED"), risk=None)
            for i in range(12)
        ]
        report = self._run_task_recommendation(tasks)
        self.assertEqual(report["status"], "DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE")
        self.assertEqual(report["tasks"], [])
        reasons = {f["name"]: f["reason"] for f in report["featuresRejected"]}
        self.assertEqual(reasons["estimatedMinutes"], "NO_VARIANCE")
        self.assertEqual(reasons["risk"], "ABSENT_EVERYWHERE")

    def test_task_recommendation_ignores_legacy_scalar_defaults(self) -> None:
        # Legacy scalar fields (adapter defaults) must never be read as observations.
        tasks = [
            {"id": f"t{i}", "goalRank": i % 5, "estimatedMinutes": 10 + (i * 7) % 40, "risk": (i * 3) % 4}
            for i in range(30)
        ]
        report = self._run_task_recommendation(tasks)
        self.assertEqual(report["status"], "DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE")
        self.assertEqual(report["featuresUsed"], [])

    def test_task_recommendation_excludes_weak_basis_unless_opted_in(self) -> None:
        tasks = [
            self._feature_task(
                i,
                goalRank=((i % 5) * 10, "DERIVED"),
                sourceAgeSeconds=((i * 37) % 1000, "PROXY"),
                mutationRisk=(i % 2, "HEURISTIC"),
            )
            for i in range(40)
        ]
        default = self._run_task_recommendation(tasks)
        self.assertEqual(default["status"], "DEGENERATE_INSUFFICIENT_FEATURE_VARIANCE")
        weak = {f["name"]: f["reason"] for f in default["featuresRejected"] if f["reason"].startswith("UNQUALIFIED")}
        self.assertEqual(set(weak), {"sourceAgeSeconds", "mutationRisk"})
        opted = self._run_task_recommendation(tasks, "--include-weak-basis")
        self.assertEqual(opted["status"], "OK")
        self.assertEqual(set(opted["featuresUsed"]), {"goalRank", "sourceAgeSeconds", "mutationRisk"})

    def test_task_recommendation_rejects_sparse_features(self) -> None:
        tasks = [
            self._feature_task(
                i,
                goalRank=((i % 5) * 10, "DERIVED"),
                selectionEligible=(i % 2, "DERIVED"),
                affectedFileCount=((i, "OBSERVED") if i < 5 else None),
            )
            for i in range(40)
        ]
        report = self._run_task_recommendation(tasks)
        sparse = {f["name"]: f["reason"] for f in report["featuresRejected"] if f["name"] == "affectedFileCount"}
        self.assertEqual(sparse["affectedFileCount"], "PRESENT_ON_TOO_FEW_TASKS")
        self.assertEqual(report["status"], "OK")

    def test_task_recommendation_rejects_near_constant_feature(self) -> None:
        # 3 outliers among 1,000 tasks: many distinct values is not the same as informative.
        tasks = [
            self._feature_task(
                i,
                goalRank=((i % 5) * 10, "DERIVED"),
                selectionEligible=(i % 2, "DERIVED"),
                prerequisiteCount=((1 if i < 3 else 0), "TEXT_DERIVED"),
            )
            for i in range(1000)
        ]
        report = self._run_task_recommendation(tasks, "--include-weak-basis")
        reasons = {f["name"]: f["reason"] for f in report["featuresRejected"] if f["present"]}
        self.assertEqual(reasons["prerequisiteCount"], "NEAR_CONSTANT")
        self.assertNotIn("prerequisiteCount", report["featuresUsed"])

    def test_task_recommendation_text_derived_needs_opt_in(self) -> None:
        tasks = [
            self._feature_task(
                i,
                goalRank=((i % 5) * 10, "DERIVED"),
                selectionEligible=(i % 2, "DERIVED"),
                specLineCount=(1 + (i * 13) % 50, "TEXT_DERIVED"),
            )
            for i in range(60)
        ]
        default = self._run_task_recommendation(tasks)
        self.assertNotIn("specLineCount", default["featuresUsed"])
        rejected = {f["name"]: f["reason"] for f in default["featuresRejected"] if f["present"]}
        self.assertEqual(rejected["specLineCount"], "UNQUALIFIED_BASIS:TEXT_DERIVED")
        opted = self._run_task_recommendation(tasks, "--include-weak-basis")
        self.assertIn("specLineCount", opted["featuresUsed"])


if __name__ == "__main__":
    unittest.main()
