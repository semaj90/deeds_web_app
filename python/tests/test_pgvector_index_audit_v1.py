import unittest
from scripts.atlas.audit_pgvector_hnsw_ivfflat_diskann_v1 import (
    analyze_vector_indexes,
    parse_index_def,
)


class TestPgvectorIndexAuditV1(unittest.TestCase):
    def test_parse_index_def_hnsw_and_halfvec(self) -> None:
        hnsw_fp32 = parse_index_def(
            "idx_codebase_chunk_content_embedding_768_hnsw",
            "codebase_chunk_index",
            "CREATE INDEX idx_codebase_chunk_content_embedding_768_hnsw ON public.codebase_chunk_index USING hnsw (content_embedding_768 vector_cosine_ops) WITH (m='16', ef_construction='64')",
        )
        self.assertEqual(hnsw_fp32["accessMethod"], "hnsw")
        self.assertEqual(hnsw_fp32["columnName"], "content_embedding_768")
        self.assertEqual(hnsw_fp32["precisionLane"], "fp32_vector")
        self.assertEqual(hnsw_fp32["options"]["ef_construction"], "64")

        hnsw_fp16 = parse_index_def(
            "idx_codebase_chunk_content_hnsw",
            "codebase_chunk_index",
            "CREATE INDEX idx_codebase_chunk_content_hnsw ON public.codebase_chunk_index USING hnsw (content_embedding halfvec_cosine_ops) WITH (m='16', ef_construction='200')",
        )
        self.assertEqual(hnsw_fp16["precisionLane"], "fp16_halfvec")
        self.assertEqual(hnsw_fp16["options"]["ef_construction"], "200")

    def test_analyze_detects_drift_duplicates_and_ivfflat(self) -> None:
        indexes = [
            parse_index_def(
                "idx_codebase_chunk_content_embedding_768_hnsw",
                "codebase_chunk_index",
                "CREATE INDEX idx_codebase_chunk_content_embedding_768_hnsw ON public.codebase_chunk_index USING hnsw (content_embedding_768 vector_cosine_ops) WITH (m='16', ef_construction='64')",
            ),
            parse_index_def(
                "idx_codebase_chunk_content_hnsw",
                "codebase_chunk_index",
                "CREATE INDEX idx_codebase_chunk_content_hnsw ON public.codebase_chunk_index USING hnsw (content_embedding halfvec_cosine_ops) WITH (m='16', ef_construction='200')",
            ),
            parse_index_def(
                "idx_cluster_summaries_embedding_ivfflat",
                "cluster_summaries",
                "CREATE INDEX idx_cluster_summaries_embedding_ivfflat ON public.cluster_summaries USING ivfflat (summary_embedding vector_cosine_ops) WITH (lists='5')",
            ),
            parse_index_def(
                "cluster_summaries_embedding_hnsw",
                "cluster_summaries",
                "CREATE INDEX cluster_summaries_embedding_hnsw ON public.cluster_summaries USING hnsw (summary_embedding vector_cosine_ops) WITH (m='16', ef_construction='64')",
            ),
            parse_index_def(
                "idx_agent_observations_hnsw",
                "agent_observations",
                "CREATE INDEX idx_agent_observations_hnsw ON public.agent_observations USING hnsw (hnsw_embedding vector_cosine_ops) WITH (m='16', ef_construction='64')",
            ),
            parse_index_def(
                "idx_agent_observations_hnsw_768",
                "agent_observations",
                "CREATE INDEX idx_agent_observations_hnsw_768 ON public.agent_observations USING hnsw (hnsw_embedding vector_cosine_ops) WITH (m='16', ef_construction='64')",
            ),
        ]
        installed = [{"extname": "vector", "extversion": "0.8.3"}]
        available = [{"name": "vector", "defaultVersion": "0.8.3", "installedVersion": "0.8.3", "comment": "pgvector"}]

        res = analyze_vector_indexes(indexes, installed, available)
        codes = {f["findingCode"] for f in res["findings"]}
        self.assertIn("HNSW_EF_CONSTRUCTION_DRIFT", codes)
        self.assertIn("REDUNDANT_IVFFLAT_AND_HNSW_COEXISTENCE", codes)
        self.assertIn("DUPLICATE_HNSW_INDEX", codes)
        self.assertIn("MIXED_FP32_VECTOR_AND_FP16_HALFVEC_INDEXES", codes)
        self.assertFalse(res["diskannAndVamanaStatus"]["pgvectorscale_installed"])


if __name__ == "__main__":
    unittest.main()
