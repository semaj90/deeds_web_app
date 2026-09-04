from __future__ import annotations

import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

import numpy as np

from atlas_external_docs import ChunkRecord, chunk_document
from atlas_okf_docs_pipeline import (
    build_qdrant_points,
    deterministic_qdrant_uuid,
    is_uuid,
    load_manifest,
    qdrant_payload_index_requests,
    qdrant_query_body,
    read_ldr_export_urls,
    preview_domain_ontology_admission,
)
from parent_atlas_ontology.domain_mapping import mapping_revision


class OkfDocsPipelineTests(unittest.TestCase):
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
