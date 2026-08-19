from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest

import numpy as np


try:
    import torch  # noqa: F401
    from atlas_compute.aligned_snapshot_experiment_v2 import run_aligned_snapshot_experiment_v2
    from atlas_compute.semantic_snapshot_freeze import freeze_semantic_snapshot
    AVAILABLE = True
except Exception:
    AVAILABLE = False


@unittest.skipUnless(AVAILABLE, "PyTorch/NumPy required")
class AlignedSnapshotExperimentTests(unittest.TestCase):
    def test_cpu_vertical_alignment_with_explicit_context_order(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "semantic.ndjson"
            tensor = root / "semantic.npy"
            manifest = root / "semantic.json"
            spec = root / "experiment.json"
            output = root / "receipt.json"

            rows = []
            for index, canonical_id in enumerate(["f", "a", "e", "b", "d", "c"]):
                vector = np.zeros(768, dtype=np.float32)
                vector[index] = 1.0
                vector[(index + 1) % 6] = 0.25
                rows.append({
                    "canonical_id": canonical_id,
                    "canonical_revision": "r1",
                    "source_ref": f"src/{canonical_id}.ts",
                    "representation_id": "semantic_768",
                    "embedding": vector.tolist(),
                })
            source.write_text("\n".join(json.dumps(row) for row in rows) + "\n", encoding="utf-8")
            freeze_semantic_snapshot(
                source,
                tensor_path=tensor,
                manifest_path=manifest,
                snapshot_revision="workspace:fixture",
                representation_revision="semantic_768:fixture",
                producer_revision="test",
            )

            # The semantic freezer will canonical-sort IDs a..f. Context order is
            # deliberately different and represents source/workflow sequence.
            experiment = {
                "experiment_revision": "aligned:v2:test",
                "metric": "cosine",
                "k": 2,
                "query_canonical_ids": ["a", "b", "c"],
                "torch_device": "cpu",
                "enable_cuvs": False,
                "enable_binary_quantization": False,
                "enable_kmeans": False,
                "enable_som": True,
                "som_grid_rows": 2,
                "som_grid_columns": 2,
                "som_epochs": 2,
                "benchmark_repeats": 2,
                "nary": {
                    "snapshot_revision": "relations:test",
                    "relationships": [
                        {"relationship_id": "rel:ab", "participant_ids": ["a", "b"]},
                        {"relationship_id": "rel:bc", "participant_ids": ["b", "c"]},
                        {"relationship_id": "rel:def", "participant_ids": ["d", "e", "f"]},
                    ],
                },
                "context": {
                    "context_revision": "source-order:test",
                    "order_kind": "source_order",
                    "ordered_canonical_ids": ["f", "a", "e", "b", "d", "c"],
                    "window_size": 3,
                    "causal": False,
                    "temperature": 1.0,
                },
                "relevance": {
                    "a": ["b"],
                    "b": ["a", "c"],
                    "c": ["b"],
                },
                "nary_relevance": {
                    "a": ["rel:ab"],
                    "b": ["rel:ab", "rel:bc"],
                    "c": ["rel:bc"],
                },
            }
            spec.write_text(json.dumps(experiment, indent=2) + "\n", encoding="utf-8")

            receipt = run_aligned_snapshot_experiment_v2(
                semantic_manifest_path=manifest,
                experiment_spec_path=spec,
                output_path=output,
            )
            self.assertEqual(receipt.schema, "atlas.aligned-snapshot-experiment.v2")
            self.assertTrue(receipt.exact_self_exclusion)
            self.assertEqual(receipt.stages["cuvs_exact_cagra"]["status"], "SKIPPED")
            self.assertEqual(receipt.stages["ordered_context"]["status"], "PASS")
            self.assertEqual(receipt.stages["nary_sparse"]["status"], "PASS")
            self.assertEqual(receipt.context_retrieval["status"], "PASS")
            self.assertEqual(receipt.nary_retrieval["status"], "PASS")
            self.assertLess(receipt.sparse_dense["max_abs_parity_error"], 1e-6)
            self.assertGreater(receipt.aligned_feature_columns, 768)
            self.assertEqual(len(receipt.output_checksum), 64)
            self.assertTrue(output.exists())


if __name__ == "__main__":
    unittest.main()
