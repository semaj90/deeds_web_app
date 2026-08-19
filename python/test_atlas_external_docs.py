from __future__ import annotations

import unittest

import numpy as np

from atlas_external_docs import (
    ChunkRecord,
    build_context_payload,
    chunk_document,
    classify_domain,
    classify_ontology,
    deterministic_pagerank,
    enforce_allowed_domain,
    low_rank_sample_query_features,
    qdrant_points,
)


class ExternalDocFabricTests(unittest.TestCase):
    def test_domain_and_ontology_are_deterministic_derived_labels(self) -> None:
        text = "Qdrant hybrid search uses embeddings, HNSW, payload filters, and reranking."
        self.assertEqual(classify_domain("Qdrant", text), "retrieval")
        labels = classify_ontology(text)
        self.assertIn("RETRIEVAL", labels)
        self.assertIn("ALGORITHM", labels)

    def test_domain_allowlist_rejects_cross_domain_crawl(self) -> None:
        enforce_allowed_domain("https://docs.firecrawl.dev/api-reference", ["firecrawl.dev"])
        with self.assertRaises(ValueError):
            enforce_allowed_domain("https://example.com/redirect", ["firecrawl.dev"])

    def test_chunking_preserves_revision_and_heading_path(self) -> None:
        text = "# Retrieval\nQdrant supports hybrid search.\n\n## Filters\nPayload indexes constrain candidates."
        chunks = chunk_document(
            source_id="qdrant",
            source_revision="qdrant-r1",
            source_url="https://qdrant.tech/documentation/",
            title="Qdrant",
            text=text,
            maximum_chars=80,
            overlap_chars=8,
        )
        self.assertGreaterEqual(len(chunks), 1)
        self.assertTrue(all(chunk.source_revision == "qdrant-r1" for chunk in chunks))
        self.assertTrue(all(chunk.chunk_id.startswith("doc:qdrant:") for chunk in chunks))
        self.assertTrue(any(chunk.heading_path for chunk in chunks))

    def test_low_rank_sampling_is_probability_distribution_and_noncanonical(self) -> None:
        matrix = np.array(
            [[1.0, 0.0, 0.0], [0.9, 0.1, 0.0], [0.0, 0.0, 1.0]],
            dtype=np.float32,
        )
        probabilities, receipt = low_rank_sample_query_features(matrix, rank=2)
        self.assertAlmostEqual(float(probabilities.sum()), 1.0, places=6)
        self.assertTrue(np.all(probabilities >= 0))
        self.assertEqual(receipt["rank"], 2)
        self.assertFalse(receipt["canonical_authority"])

    def test_pagerank_is_derived_and_normalized(self) -> None:
        scores, receipt = deterministic_pagerank(
            ["a", "b", "c"],
            [("a", "b"), ("b", "c"), ("c", "b")],
        )
        self.assertAlmostEqual(sum(scores.values()), 1.0, places=8)
        self.assertGreater(scores["b"], scores["a"])
        self.assertFalse(receipt["canonical_authority"])

    def test_qdrant_projection_fails_closed_on_zero_or_wrong_vectors(self) -> None:
        chunk = ChunkRecord(
            chunk_id="chunk:1",
            source_id="qdrant",
            source_revision="r1",
            source_url="https://qdrant.tech/documentation/",
            document_checksum="a" * 64,
            ordinal=0,
            heading_path=("Search",),
            start_char=0,
            end_char=10,
            text="search docs",
            domain_class="retrieval",
            ontology_classes=("RETRIEVAL",),
            lexical_tokens=tuple(),
            ontology_tuples=tuple(),
        )
        with self.assertRaises(ValueError):
            qdrant_points([chunk], np.zeros((1, 768), dtype=np.float32), producer_revision="r1")
        with self.assertRaises(ValueError):
            qdrant_points([chunk], np.ones((1, 512), dtype=np.float32), producer_revision="r1")

        points = qdrant_points([chunk], np.ones((1, 768), dtype=np.float32), producer_revision="r1")
        self.assertEqual(len(points), 1)
        self.assertEqual(points[0]["payload"]["semantic_dimension"], 768)
        self.assertFalse(points[0]["payload"]["canonical_authority"])

    def test_context_payload_uses_ranked_chunks_but_stays_noncanonical(self) -> None:
        chunk = ChunkRecord(
            chunk_id="chunk:1",
            source_id="qdrant",
            source_revision="r1",
            source_url="https://qdrant.tech/documentation/",
            document_checksum="a" * 64,
            ordinal=0,
            heading_path=("Search",),
            start_char=0,
            end_char=10,
            text="search docs",
            domain_class="retrieval",
            ontology_classes=("RETRIEVAL",),
            lexical_tokens=tuple(),
            ontology_tuples=tuple(),
        )
        payload = build_context_payload(
            ["chunk:1"],
            {"chunk:1": chunk},
            maximum_hops=2,
            maximum_chunks=8,
        )
        self.assertEqual(payload["chunks"][0]["source_revision"], "r1")
        self.assertFalse(payload["canonical_authority"])


if __name__ == "__main__":
    unittest.main()
