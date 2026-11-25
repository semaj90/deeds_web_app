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


class SqlFunctionTableSignatureTests(unittest.TestCase):
    def test_overloads_rendered_on_one_line_are_all_extracted(self) -> None:
        from atlas_external_docs import extract_code_blocks_and_signatures

        text = (
            "to_tsvector ( [ config regconfig , ] document json ) → tsvector "
            "to_tsvector ( [ config regconfig , ] document jsonb ) → tsvector Converts each string value."
        )
        _, signatures = extract_code_blocks_and_signatures(text)
        self.assertIn("to_tsvector ( [ config regconfig , ] document json )", signatures)
        self.assertIn("to_tsvector ( [ config regconfig , ] document jsonb )", signatures)

    def test_one_signature_per_line_and_bracketed_arrays_still_match(self) -> None:
        from atlas_external_docs import extract_code_blocks_and_signatures

        text = (
            "ts_rank ( [ weights real[] , ] vector tsvector , query tsquery [ , normalization integer ] ) → real\n"
            "setweight ( vector tsvector , weight \"char\" , lexemes text[] ) → tsvector\n"
        )
        _, signatures = extract_code_blocks_and_signatures(text)
        self.assertEqual(len(signatures), 2)
        self.assertTrue(any(s.startswith("ts_rank (") and s.endswith("normalization integer ] )") for s in signatures))
        self.assertTrue(any(s.startswith("setweight (") and "text[]" in s for s in signatures))

    def test_prose_arrows_without_a_call_do_not_become_signatures(self) -> None:
        from atlas_external_docs import extract_code_blocks_and_signatures

        _, signatures = extract_code_blocks_and_signatures("Click Save → done. The result → value.")
        self.assertEqual(signatures, ())


class _FakeHeaders:
    def __init__(self, content_type: str) -> None:
        self._content_type = content_type

    def get_content_type(self) -> str:
        return self._content_type


class _FakeResponse:
    def __init__(self, body: bytes, content_type: str, read_error: Exception | None = None) -> None:
        self.headers = _FakeHeaders(content_type)
        self._body = body
        self._read_error = read_error

    def read(self, limit: int = -1) -> bytes:
        if self._read_error is not None:
            raise self._read_error
        return self._body if limit < 0 else self._body[:limit]

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *exc: object) -> None:
        return None


class _FakeOpener:
    def __init__(self, response: _FakeResponse) -> None:
        self._response = response

    def open(self, request: object, timeout: int = 30) -> _FakeResponse:
        return self._response


class DirectMarkdownFetcherTests(unittest.TestCase):
    URL = "https://svelte.dev/docs/kit/llms.txt"

    def _fetch(self, body: bytes, content_type: str = "text/plain", read_error: Exception | None = None):
        from unittest import mock

        import atlas_external_docs

        response = _FakeResponse(body, content_type, read_error)
        with mock.patch.object(atlas_external_docs, "build_opener", return_value=_FakeOpener(response)):
            return atlas_external_docs.fetch_direct_markdown(self.URL)

    def test_text_plain_and_text_markdown_are_accepted_with_original_bytes_checksummed(self) -> None:
        import atlas_external_docs

        body = b"# Intro\n\nSome documentation.\n"
        for content_type in ("text/plain", "text/markdown", "text/x-markdown"):
            result = self._fetch(body, content_type)
            self.assertEqual(result.fetcher, "DIRECT_MARKDOWN")
            self.assertEqual(result.markdown, body.decode("utf-8"))
            self.assertEqual(result.raw_checksum, atlas_external_docs._sha(body))

    def test_utf8_and_svelte_syntax_survive_unchanged(self) -> None:
        body = "<SYSTEM>docs</SYSTEM>\n\n{@render children()}\n\nDash — and café\n".encode("utf-8")
        result = self._fetch(body)
        self.assertIn("{@render children()}", result.markdown)
        self.assertIn("—", result.markdown)
        self.assertIn("café", result.markdown)

    def test_unsupported_content_types_are_rejected(self) -> None:
        for content_type in ("text/html", "application/json", "application/octet-stream"):
            with self.assertRaisesRegex(ValueError, "DIRECT_MARKDOWN_CONTENT_TYPE_INVALID"):
                self._fetch(b"# x", content_type)

    def test_response_over_two_mebibytes_is_rejected(self) -> None:
        with self.assertRaisesRegex(ValueError, "DIRECT_MARKDOWN_BYTE_LIMIT_EXCEEDED"):
            self._fetch(b"a" * (2 * 1024 * 1024 + 1))
        self._fetch(b"a" * (2 * 1024 * 1024))

    def test_invalid_utf8_and_empty_bodies_are_rejected(self) -> None:
        with self.assertRaises(UnicodeDecodeError):
            self._fetch(b"\xff\xfe\xfa invalid")
        with self.assertRaisesRegex(ValueError, "DIRECT_MARKDOWN_EMPTY"):
            self._fetch(b"  \n\t \n")

    def test_http_scheme_is_rejected_before_any_request(self) -> None:
        import atlas_external_docs

        with self.assertRaisesRegex(ValueError, "DIRECT_MARKDOWN_HTTPS_REQUIRED"):
            atlas_external_docs.fetch_direct_markdown("http://svelte.dev/docs/kit/llms.txt")

    def test_truncated_transfer_error_propagates_instead_of_returning_partial_text(self) -> None:
        from http.client import IncompleteRead

        with self.assertRaises(IncompleteRead):
            self._fetch(b"partial", read_error=IncompleteRead(b"partial", 100))

    def test_extracts_multiple_sql_overloads_on_same_line(self) -> None:
        import atlas_external_docs

        line = (
            "to_tsvector ( [ config regconfig , ] document json ) → tsvector "
            "to_tsvector ( [ config regconfig , ] document jsonb ) → tsvector"
        )
        _, sigs = atlas_external_docs.extract_code_blocks_and_signatures(line)
        self.assertIn("to_tsvector ( [ config regconfig , ] document json )", sigs)
        self.assertIn("to_tsvector ( [ config regconfig , ] document jsonb )", sigs)


if __name__ == "__main__":
    unittest.main()
