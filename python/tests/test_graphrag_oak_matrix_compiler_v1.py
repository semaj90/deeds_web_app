from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from python.atlas_graph_runtime.graphrag_oak_matrix_compiler_v1 import (
    compile_graphrag_oak_matrix_v1,
    export_xgb_csv_and_grpo_pairs_v1,
)


class GraphRagOakMatrixCompilerTests(unittest.TestCase):
    def test_compiles_pinned_matrix_with_networkx_pagerank_and_cosine(self) -> None:
        chunks = [
            {
                "chunkId": "c1",
                "sourceRef": "docs/a.md",
                "sourceRevision": "sha256:" + "a" * 64,
                "text": "GraphRAG oaklib relation",
            },
            {
                "chunkId": "c2",
                "sourceRef": "docs/b.md",
                "sourceRevision": "sha256:" + "b" * 64,
                "text": "PageRank matrix",
            },
        ]
        graph_revision = "sha256:" + "c" * 64
        rels = [{
            "subjectId": "docs/a.md",
            "objectId": "docs/b.md",
            "predicate": "DOCUMENTED_BY",
            "sourceRef": "docs/a.md",
            "sourceRevision": "sha256:" + "a" * 64,
            "evidenceRef": "docs/a.md#bytes=0-20",
            "graphRevision": graph_revision,
            "admissionState": "GRAPH_ADMITTED",
            "canonicalAuthority": True,
        }]
        oak = {"docs/a.md": ["oak_concept_1"], "docs/b.md": ["oak_concept_1", "oak_concept_2"]}
        emb = np.asarray([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]], dtype=np.float32)
        q = np.asarray([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

        res = compile_graphrag_oak_matrix_v1(
            chunks=chunks,
            relations=rels,
            oak_concepts_by_ref=oak,
            embeddings=emb,
            query_embedding=q,
            graph_revision=graph_revision,
            model_revision="embeddinggemma2:q8_0",
        )
        self.assertEqual(res["matrixShape"], [2, 5])
        self.assertEqual(res["dtype"], "float32")
        self.assertEqual(res["pageRankReceipt"]["effective_backend"], "networkx")
        self.assertAlmostEqual(res["xgbAndRlRows"][0]["features"][0], 1.0, places=5)
        self.assertFalse(res["canonicalAuthority"])
        self.assertFalse(res["writesPerformed"])

        with tempfile.TemporaryDirectory() as tmp:
            exp = export_xgb_csv_and_grpo_pairs_v1(
                query="GraphRAG oaklib",
                rows=res["xgbAndRlRows"],
                csv_path=Path(tmp) / "xgb.csv",
                grpo_path=Path(tmp) / "grpo.jsonl",
            )
            self.assertEqual(exp["xgbRowCount"], 2)
            self.assertEqual(exp["grpoPairCount"], 1)
            pair = __import__("json").loads((Path(tmp) / "grpo.jsonl").read_text(encoding="utf-8"))
            self.assertEqual(pair["schema"], "atlas.doc14-ranking-pair-diagnostic.v1")
            self.assertEqual(pair["rewardSource"], "FIXED_FEATURE_HEURISTIC")
            self.assertFalse(pair["trainingEligible"])

    def test_pending_or_mismatched_relations_never_enter_graph_features(self) -> None:
        chunks = [{
            "chunkId": "c1",
            "sourceRef": "docs/a.md",
            "sourceRevision": "sha256:" + "a" * 64,
            "text": "API relation proposal",
        }]
        embeddings = np.asarray([[1.0, 0.0]], dtype=np.float32)
        query = np.asarray([1.0, 0.0], dtype=np.float32)
        base = {
            "subjectId": "docs/a.md",
            "objectId": "docs/b.md",
            "predicate": "DOCUMENTED_BY",
            "sourceRef": "docs/a.md",
            "sourceRevision": "sha256:" + "a" * 64,
            "evidenceRef": "docs/a.md#bytes=0-20",
            "graphRevision": "sha256:" + "c" * 64,
            "canonicalAuthority": True,
        }

        def compile_relation(relation: dict[str, object]) -> None:
            compile_graphrag_oak_matrix_v1(
                chunks=chunks,
                relations=[relation],
                oak_concepts_by_ref={},
                embeddings=embeddings,
                query_embedding=query,
                graph_revision="sha256:" + "c" * 64,
                model_revision="embeddinggemma2:q8_0",
            )

        with self.assertRaisesRegex(ValueError, "RELATION_NOT_GRAPH_ADMITTED"):
            compile_relation({**base, "admissionState": "PENDING"})
        with self.assertRaisesRegex(ValueError, "RELATION_GRAPH_REVISION_MISMATCH"):
            compile_relation({**base, "admissionState": "GRAPH_ADMITTED", "graphRevision": "sha256:" + "d" * 64})


if __name__ == "__main__":
    unittest.main()
