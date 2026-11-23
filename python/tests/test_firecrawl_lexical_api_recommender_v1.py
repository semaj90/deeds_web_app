from __future__ import annotations

import unittest
from pathlib import Path

import numpy as np

from python.atlas_graph_runtime.firecrawl_lexical_api_recommender_v1 import (
    build_rlm_dspy_self_prompt_packet_v1,
    extract_official_api_lexical_signals_v1,
    extract_openspec_task_keywords_v1,
    rank_document_chunks_for_task_v1,
    resolve_workboard_task_v1,
    run_concurrent_rg_keyword_search_v1,
    simd_cosine_topk_v1,
)


class FirecrawlLexicalApiRecommenderTests(unittest.TestCase):
    def test_extracts_official_apis_imports_and_advisory_domain_tags(self) -> None:
        text = """
        import { pgTable, text } from 'drizzle-orm/pg-core';
        CREATE INDEX idx_vec ON atlas_chunks USING hnsw (content_embedding vector_cosine_ops);
        const count = $state(0);
        """
        sig = extract_official_api_lexical_signals_v1(
            text=text,
            product="postgresql",
            api_signatures=["USING hnsw"],
            heading_path=["Indexes", "HNSW"],
        )
        self.assertIn("drizzle-orm/pg-core", sig["modules"])
        self.assertTrue(any("hnsw" in s.lower() for s in sig["sqlApis"]))
        self.assertIn("$state", sig["svelteApis"])
        self.assertIn("pgvector", sig["advisoryDomainTags"])

    def test_api_mentions_use_absolute_utf8_byte_spans(self) -> None:
        text = "é use `RequestHandler` and import { load } from 'sveltekit';"
        sig = extract_official_api_lexical_signals_v1(text=text, chunk_start_byte=100)
        mention = next(m for m in sig["mentions"] if m["value"] == "RequestHandler")
        self.assertEqual(text.encode("utf-8")[mention["startByte"] - 100:mention["endByte"] - 100].decode(), "RequestHandler")

    def test_exact_workboard_task_resolution_preserves_revision_and_rejects_done(self) -> None:
        row = {
            "taskKey": "change:42", "stableKey": "change#abc", "logicalTaskKey": "change:DOC-1",
            "taskIdentity": {"taskRevision": "sha256:" + "a" * 64}, "text": "Extract API docs",
            "state": "OPEN", "sourceCheckboxState": "OPEN", "source": "openspec/change/tasks.md",
            "line": 42, "blockHash": "sha256:" + "a" * 64,
        }
        workboard = {"taskInventory": [row], "sourceFileHashes": {row["source"]: "b" * 64}}
        resolved = resolve_workboard_task_v1(workboard, "change#abc")
        self.assertEqual(resolved["taskRevision"], row["taskIdentity"]["taskRevision"])
        self.assertEqual(resolved["title"], row["text"])
        row["state"] = "DONE"
        with self.assertRaisesRegex(ValueError, "TASK_NOT_OPEN"):
            resolve_workboard_task_v1(workboard, "change:42")

    def test_ranking_is_explainable_official_only_and_ties_are_stable(self) -> None:
        docs = [
            {"chunkId": "b", "sourceAuthority": "OFFICIAL", "startByte": 10, "text": "Use DSPy with GEPA.", "lexicalSignals": {"tokens": ["dspy", "gepa"], "sqlApis": [], "svelteApis": [], "apiSignatures": []}},
            {"chunkId": "a", "sourceAuthority": "OFFICIAL", "startByte": 10, "text": "Use DSPy with GEPA.", "lexicalSignals": {"tokens": ["dspy", "gepa"], "sqlApis": [], "svelteApis": [], "apiSignatures": []}},
            {"chunkId": "0", "sourceAuthority": "COMMUNITY", "lexicalSignals": {"tokens": ["dspy", "gepa"], "sqlApis": [], "svelteApis": [], "apiSignatures": []}},
        ]
        result = rank_document_chunks_for_task_v1(task_keywords=["DSPy"], task_title="Use GEPA with DSPy", documents=docs)
        self.assertEqual([item["chunkId"] for item in result], ["a", "b"])
        self.assertEqual(result[0]["rankBreakdown"]["method"], "EXACT_API_IDENTIFIER_OVERLAP_V1")
        self.assertEqual((result[0]["excerptStartByte"], result[0]["excerptEndByte"]), (10, 29))
        generic_only = rank_document_chunks_for_task_v1(
            task_keywords=["candidate"], task_title="candidate search",
            documents=[{"chunkId": "generic", "sourceAuthority": "OFFICIAL",
                        "lexicalSignals": {"tokens": ["candidate"], "sqlApis": [], "svelteApis": [], "apiSignatures": []}}],
        )
        self.assertEqual(generic_only, [])
        product_only = rank_document_chunks_for_task_v1(
            task_keywords=["PostgreSQL"], task_title="PostgreSQL",
            documents=[{"chunkId": "product", "sourceAuthority": "OFFICIAL",
                        "lexicalSignals": {"tokens": ["postgresql"], "sqlApis": [], "svelteApis": [], "apiSignatures": []}}],
        )
        self.assertEqual(product_only, [])
        exact_api = rank_document_chunks_for_task_v1(
            task_keywords=["websearch_to_tsquery"], task_title="websearch_to_tsquery",
            documents=[{"chunkId": "api", "sourceAuthority": "OFFICIAL", "text": "websearch_to_tsquery", "startByte": 0,
                        "lexicalSignals": {"tokens": ["websearch_to_tsquery"], "sqlApis": ["websearch_to_tsquery"], "svelteApis": [], "apiSignatures": []}}],
        )
        self.assertEqual([item["chunkId"] for item in exact_api], ["api"])

    def test_extracts_task_keywords_and_simd_cosine_and_self_prompt_packet(self) -> None:
        kws = extract_openspec_task_keywords_v1({
            "stableKey": "parent-atlas:ML-CPU-01",
            "title": "Wire TensorHandleV1 and pgvector HNSW retrieval",
            "sourceRef": "sveltekit-frontend/src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts",
            "concepts": ["pgvector", "TensorHandleV1"],
        })
        self.assertTrue(len(kws) >= 2)
        self.assertNotIn("sveltekit-frontend/src/lib/server/atlas/tensors/tensor-handle-4x4x6-v1.ts", kws)
        mat = np.asarray([[1.0, 0.0, 0.0], [0.0, 1.0, 1.0]], dtype=np.float32)
        q = np.asarray([0.0, 1.0, 1.0], dtype=np.float32)
        top = simd_cosine_topk_v1(q, mat, k=2)
        self.assertEqual(top[0][0], 1)
        self.assertAlmostEqual(top[0][1], 1.0, places=5)

        pkt = build_rlm_dspy_self_prompt_packet_v1(
            task_id="parent-atlas:ML-CPU-01",
            task_title="Wire TensorHandleV1",
            task_keywords=kws,
            rg_hits_by_keyword={kws[0]: [{"sourceRef": "a.ts", "line": 10, "keyword": kws[0]}]},
            recommended_doc_chunks=[{
                "chunkId": "doc:1",
                "pageId": "page-1",
                "title": "pgvector HNSW",
                "url": "https://docs.example.test/pgvector/hnsw",
                "product": "pgvector",
                "productVersion": "0.8.0",
                "sourceAuthority": "OFFICIAL",
                "startByte": 100,
                "endByte": 150,
                "chunkChecksum": "sha256:" + "b" * 64,
                "evidenceRevision": "sha256:" + "a" * 64,
                "score": 0.95,
                "domainTags": [],
                "lexicalSignals": {"modules": ["drizzle-orm"], "sqlApis": ["USING hnsw"], "svelteApis": [], "apiSignatures": []},
            }],
        )
        self.assertEqual(pkt["schema"], "atlas.rlm-dspy-self-prompt.v1")
        self.assertFalse(pkt["canonicalAuthority"])
        self.assertFalse(pkt["writesPerformed"])
        self.assertTrue(pkt["packetChecksum"].startswith("sha256:"))

    def test_concurrent_rg_search_runs_on_repo(self) -> None:
        repo_root = Path(__file__).resolve().parents[2]
        hits = run_concurrent_rg_keyword_search_v1(
            repo_root=repo_root,
            keywords=["TensorHandleV1"],
            search_roots=("sveltekit-frontend/src/lib/server/atlas/tensors",),
            max_workers=2,
            max_matches_per_keyword=3,
        )
        self.assertIn("TensorHandleV1", hits)
        self.assertGreater(len(hits["TensorHandleV1"]), 0)


if __name__ == "__main__":
    unittest.main()
