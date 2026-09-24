from __future__ import annotations

import json
from hashlib import sha256
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np

from atlas_external_docs import ChunkRecord, chunk_document
from atlas_okf_docs_pipeline import (
    PipelineManifest,
    SourceConfig,
    build_firecrawl_crawl_v2_request,
    build_qdrant_points,
    deterministic_qdrant_uuid,
    is_uuid,
    load_manifest,
    main as pipeline_main,
    qdrant_payload_index_requests,
    qdrant_query_body,
    read_ldr_export_urls,
    preview_domain_ontology_admission,
    plan_manifest_recrawl_delta_v1,
    _sources_selected_by_recrawl_plan,
)
from parent_atlas_ontology.domain_mapping import mapping_revision


class OkfDocsPipelineTests(unittest.TestCase):
    @staticmethod
    def _recrawl_source(
        source_id: str = "pgvector",
        *,
        version: str = "0.8.0",
        source_revision: str = "source-r1",
        identity: str = "V1",
        provider: str = "pgvector",
        product: str = "pgvector",
        pages: tuple[str, ...] = ("https://github.com/pgvector/pgvector",),
    ) -> SourceConfig:
        return SourceConfig(
            source_id=source_id, source_revision=source_revision, title=source_id,
            base_urls=(f"https://docs.example.test/{source_id}/",), allowed_domains=("docs.example.test",),
            authority_class="EXTERNAL_DOCUMENTATION", default_fetcher="BEAUTIFULSOUP_HTTP",
            output_namespace=f"docs/.okf/{source_id}", include_paths=(), exclude_paths=(),
            maximum_pages=3, maximum_depth=1, follow_sitemap=False, pages=pages, ldr_export_files=(),
            provider=provider, product=product, product_version=version,
            version_qualification="EXACT_VERSION", chunk_identity_version=identity,
        )

    @staticmethod
    def _recrawl_manifest(revision: str, *sources: SourceConfig) -> PipelineManifest:
        return PipelineManifest(
            manifest_revision=revision, workspace_revision="workspace-r1", source_snapshot_revision="snapshot-r1",
            producer_revision="producer-r1", output_root=".", sources=tuple(sources),
            qdrant_collection="external-docs", qdrant_url="http://127.0.0.1:6333", qdrant_api_key_env=None,
            embedding_url="http://127.0.0.1:8081", embedding_model="embeddinggemma", low_rank=8,
            kmeans_clusters=4, som_rows=2, som_columns=2,
        )

    def test_manifest_recrawl_plan_selects_only_added_or_explicitly_version_changed_sources(self) -> None:
        unchanged = self._recrawl_source(source_id="unchanged", version="18", source_revision="same")
        prior = self._recrawl_manifest(
            "manifest-old",
            unchanged,
            self._recrawl_source(source_id="pgvector", version="0.8.0", source_revision="old"),
            self._recrawl_source(source_id="removed", version="1.0", source_revision="old"),
        )
        current = self._recrawl_manifest(
            "manifest-new",
            unchanged,
            self._recrawl_source(source_id="pgvector", version="0.9.0", source_revision="new", identity="V2"),
            self._recrawl_source(source_id="added", version="1.0", source_revision="new"),
        )

        plan = plan_manifest_recrawl_delta_v1(prior, current)
        self.assertTrue(plan["canAcquire"])
        self.assertEqual(plan["selectedSourceIds"], ["pgvector", "added"])
        self.assertEqual(
            {row["sourceId"]: row["decision"] for row in plan["entries"]},
            {
                "unchanged": "UNCHANGED",
                "pgvector": "PRODUCT_VERSION_CHANGED",
                "added": "ADDED",
                "removed": "REMOVED_RETAINED",
            },
        )
        self.assertFalse(plan["canonicalAuthority"])
        self.assertEqual(len(plan["planChecksum"]), 64)

        selected, integrated_plan = _sources_selected_by_recrawl_plan(current, prior)
        self.assertEqual([source.source_id for source in selected], ["pgvector", "added"])
        self.assertTrue(selected[0].output_namespace.endswith("/versions/" + sha256(b"0.9.0").hexdigest()[:16]))
        self.assertEqual(integrated_plan, plan)

    def test_manifest_recrawl_rejects_version_change_without_v2_identity(self) -> None:
        prior = self._recrawl_manifest("old", self._recrawl_source(version="0.8.0"))
        current = self._recrawl_manifest("new", self._recrawl_source(version="0.9.0", source_revision="new"))
        plan = plan_manifest_recrawl_delta_v1(prior, current)
        self.assertFalse(plan["canAcquire"])
        self.assertEqual(plan["selectedSourceIds"], [])
        self.assertIn("VERSIONED_CHUNK_IDENTITY_V2_REQUIRED:pgvector", plan["blockers"])
        with self.assertRaisesRegex(ValueError, "DOC_RECRAWL_DELTA_BLOCKED"):
            _sources_selected_by_recrawl_plan(current, prior)

    def test_manifest_recrawl_fails_closed_for_same_version_source_change_and_identity_replacement(self) -> None:
        prior = self._recrawl_manifest("old", self._recrawl_source(version="0.8.0", source_revision="old"))
        same_version_changed = self._recrawl_manifest(
            "new", self._recrawl_source(version="0.8.0", source_revision="changed")
        )
        review = plan_manifest_recrawl_delta_v1(prior, same_version_changed)
        self.assertFalse(review["canAcquire"])
        self.assertIn("SAME_VERSION_SOURCE_CHANGE_REQUIRES_REVIEW:pgvector", review["blockers"])

        replaced = self._recrawl_manifest(
            "new", self._recrawl_source(version="0.8.0", source_revision="old", provider="other-provider")
        )
        conflict = plan_manifest_recrawl_delta_v1(prior, replaced)
        self.assertFalse(conflict["canAcquire"])
        self.assertIn("SOURCE_IDENTITY_CHANGED:pgvector", conflict["blockers"])

    def test_plan_only_cli_emits_delta_without_entering_pipeline(self) -> None:
        prior = self._recrawl_manifest("old", self._recrawl_source(version="0.8.0", source_revision="old"))
        current = self._recrawl_manifest(
            "new", self._recrawl_source(version="0.9.0", source_revision="new", identity="V2")
        )
        output = StringIO()
        with patch("atlas_okf_docs_pipeline.load_manifest", side_effect=[current, prior]), \
             patch("atlas_okf_docs_pipeline.discover_and_fetch", side_effect=AssertionError("PLAN_ONLY_FETCHED")), \
             redirect_stdout(output):
            result = pipeline_main([
                "--manifest", "current.json", "--prior-manifest", "prior.json", "--plan-only"
            ])
        self.assertEqual(result, 0)
        receipt = json.loads(output.getvalue())
        self.assertTrue(receipt["canAcquire"])
        self.assertEqual(receipt["selectedSourceIds"], ["pgvector"])

    def test_firecrawl_request_uses_manifest_bounds_and_disables_domain_expansion(self) -> None:
        source = SourceConfig(
            source_id="doc-03-test", source_revision="manifest:test", title="test",
            base_urls=("https://docs.example.test/root",), allowed_domains=("docs.example.test",),
            authority_class="EXTERNAL_DOCUMENTATION", default_fetcher="FIRECRAWL_CRAWL",
            output_namespace="docs/.okf/test", include_paths=("/root/**",), exclude_paths=("/private/**",),
            maximum_pages=3, maximum_depth=1, follow_sitemap=False, pages=(), ldr_export_files=(),
        )
        request = build_firecrawl_crawl_v2_request(source)
        self.assertEqual(request["limit"], source.maximum_pages)
        self.assertEqual(request["maxDiscoveryDepth"], source.maximum_depth)
        self.assertEqual(request["sitemap"], "skip")
        self.assertFalse(request["crawlEntireDomain"])
        self.assertFalse(request["allowExternalLinks"])
        self.assertFalse(request["allowSubdomains"])
        include_sitemap = build_firecrawl_crawl_v2_request(SourceConfig(
            **{**source.__dict__, "follow_sitemap": True}
        ))
        self.assertEqual(include_sitemap["sitemap"], "include")

    def test_qdrant_id_is_deterministic_supported_uuid_projection(self) -> None:
        first = deterministic_qdrant_uuid("doc:qdrant:abc:0")
        second = deterministic_qdrant_uuid("doc:qdrant:abc:0")
        other = deterministic_qdrant_uuid("doc:qdrant:abc:1")
        self.assertEqual(first, second)
        self.assertNotEqual(first, other)
        self.assertTrue(is_uuid(first))

    def test_manifest_requires_docs_okf_namespace_and_domain_allowlist(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            path.write_text(json.dumps({
                "manifest_revision": "m1",
                "workspace_revision": "w1",
                "source_snapshot_revision": "s1",
                "producer_revision": "p1",
                "sources": [{
                    "source_id": "qdrant",
                    "source_revision": "q1",
                    "title": "Qdrant",
                    "base_urls": ["https://qdrant.tech/documentation/"],
                    "allowed_domains": ["qdrant.tech"],
                    "authority_class": "OFFICIAL_PRIMARY",
                    "default_fetcher": "BEAUTIFULSOUP_HTTP",
                    "output_namespace": "docs/.okf/qdrant",
                    "pages": ["https://qdrant.tech/documentation/concepts/points/"],
                }],
            }), encoding="utf-8")
            manifest = load_manifest(path)
            self.assertEqual(manifest.sources[0].source_id, "qdrant")
            self.assertIsNone(manifest.sources[0].source_namespace)

            payload = json.loads(path.read_text(encoding="utf-8"))
            payload["sources"][0]["pages"] = ["https://example.com/not-qdrant"]
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(ValueError):
                load_manifest(path)

    def test_ldr_export_is_discovery_only_and_filters_domains(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "ldr.json"
            path.write_text(json.dumps({
                "result": {
                    "sources": [
                        {"url": "https://qdrant.tech/documentation/search/", "title": "Search"},
                        {"url": "https://example.com/blog", "title": "Noise"},
                    ]
                }
            }), encoding="utf-8")
            urls = read_ldr_export_urls(path, allowed_domains=["qdrant.tech"])
            self.assertEqual(urls, ("https://qdrant.tech/documentation/search/",))

    def test_domain_admission_preview_requires_namespace_and_revision(self) -> None:
        chunks = chunk_document(
            source_id="qdrant", source_revision="sha256:" + ("c" * 64),
            source_url="https://qdrant.tech/documentation/", title="Qdrant retrieval",
            text="Qdrant retrieval search", maximum_chars=100, overlap_chars=0,
        )
        blocked = preview_domain_ontology_admission(
            chunks, source_namespace=None, ontology_revision=None,
            classification_revision="classifier:v1", mapping_revision_value=mapping_revision(),
        )
        self.assertEqual(blocked["status"], "SOURCE_NAMESPACE_UNPROVEN")
        admitted = preview_domain_ontology_admission(
            chunks, source_namespace="docs:qdrant", ontology_revision="sha256:" + ("d" * 64),
            classification_revision="classifier:v1", mapping_revision_value=mapping_revision(),
        )
        self.assertEqual(admitted["status"], "PREVIEW_PROVEN")
        self.assertTrue(admitted["admittedCount"])
        self.assertFalse(admitted["writesPerformed"])

    def test_qdrant_query_uses_large_quantized_prefetch_then_rescore(self) -> None:
        query = np.ones(768, dtype=np.float32)
        body = qdrant_query_body(
            query,
            prefetch_k=128,
            exact_refine_k=16,
            source_revision="docs-r1",
            domain_class="retrieval",
        )
        self.assertEqual(body["prefetch"]["limit"], 128)
        self.assertFalse(body["prefetch"]["params"]["quantization"]["rescore"])
        self.assertEqual(body["limit"], 16)
        self.assertTrue(body["params"]["quantization"]["rescore"])
        self.assertEqual(len(body["filter"]["must"]), 2)
        with self.assertRaises(ValueError):
            qdrant_query_body(query, prefetch_k=8, exact_refine_k=16)

    def test_qdrant_payload_indexes_are_declared_before_ingest(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "manifest.json"
            path.write_text(json.dumps({
                "manifest_revision": "m1",
                "workspace_revision": "w1",
                "source_snapshot_revision": "s1",
                "producer_revision": "p1",
                "sources": [{
                    "source_id": "qdrant",
                    "source_revision": "q1",
                    "base_urls": ["https://qdrant.tech/documentation/"],
                    "allowed_domains": ["qdrant.tech"],
                    "default_fetcher": "BEAUTIFULSOUP_HTTP",
                    "output_namespace": "docs/.okf/qdrant",
                }],
            }), encoding="utf-8")
            manifest = load_manifest(path)
            requests = qdrant_payload_index_requests(manifest)
            fields = {body["field_name"] for _url, body in requests}
            self.assertIn("source_revision", fields)
            self.assertIn("domain_class", fields)
            self.assertIn("ontology_classes", fields)
            self.assertIn("som_cell", fields)

    def test_build_points_replaces_legacy_hex_projection_with_uuid(self) -> None:
        chunk = ChunkRecord(
            chunk_id="doc:qdrant:abc:0",
            source_id="qdrant",
            source_revision="r1",
            source_url="https://qdrant.tech/documentation/",
            document_checksum="a" * 64,
            ordinal=0,
            heading_path=("Search",),
            start_char=0,
            end_char=5,
            text="hello",
            domain_class="retrieval",
            ontology_classes=("RETRIEVAL",),
            lexical_tokens=tuple(),
            ontology_tuples=tuple(),
        )
        points = build_qdrant_points(
            [chunk],
            np.ones((1, 768), dtype=np.float32),
            feature_rows={chunk.chunk_id: {"pagerank": 0.5}},
            producer_revision="p1",
        )
        self.assertTrue(is_uuid(points[0]["id"]))
        self.assertEqual(points[0]["payload"]["qdrant_point_id"], points[0]["id"])
        self.assertFalse(points[0]["payload"]["qdrant_point_id_is_canonical"])


if __name__ == "__main__":
    unittest.main()
