from __future__ import annotations

import json
from dataclasses import replace
from hashlib import sha256
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np

from atlas_external_docs import ChunkRecord, _normalize_ws, chunk_document
from atlas_okf_docs_pipeline import (
    PipelineManifest,
    PageArtifact,
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
    run_pipeline,
    write_source_artifacts,
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

    def test_acquire_only_writes_local_cited_chunks_without_embedding_or_projection(self) -> None:
        source = self._recrawl_source(pages=("https://docs.example.test/guide",))
        manifest = self._recrawl_manifest("acquire-only-test", source)
        page = PageArtifact(
            source_id=source.source_id,
            source_revision=source.source_revision,
            requested_url="https://docs.example.test/guide",
            resolved_url="https://docs.example.test/guide",
            title="Guide",
            text="# Guide\n\nA source-grounded computer engineering guide.",
            fetcher="BEAUTIFULSOUP_HTTP",
            raw_checksum="raw-sha256",
            normalized_checksum=sha256(b"# Guide\n\nA source-grounded computer engineering guide.").hexdigest(),
            outgoing_urls=(),
            metadata={},
            retrieved_at="2026-10-04T00:00:00Z",
        )
        with TemporaryDirectory() as tmp:
            manifest = PipelineManifest(**{**manifest.__dict__, "output_root": tmp})
            with patch("atlas_okf_docs_pipeline.discover_and_fetch", return_value=(page,)), \
                 patch("atlas_okf_docs_pipeline.embed_llama_server_768", side_effect=AssertionError("EMBEDDING_RAN")):
                receipt = run_pipeline(
                    manifest,
                    enable_stanza=False,
                    enable_clusters=False,
                    write_qdrant=False,
                    smoke_query=None,
                    acquire_only=True,
                )
            self.assertEqual(receipt["status"], "ACQUISITION_ONLY")
            self.assertFalse(receipt["embedding_performed"])
            self.assertFalse(receipt["qdrant"]["write"])
            self.assertFalse(receipt["external_projection_writes"])
            self.assertTrue(receipt["local_artifacts_written"])
            self.assertTrue(receipt["writes_performed"])
            self.assertEqual(receipt["page_count"], 1)
            self.assertGreater(receipt["chunk_count"], 0)
            raw_root = Path(tmp) / source.output_namespace / "raw"
            markdown_path = next(path for path in raw_root.glob("*.md") if not path.name.endswith(".normalized.md"))
            page_receipt = json.loads(next(raw_root.glob("*.json")).read_text(encoding="utf-8"))
            markdown_bytes = markdown_path.read_bytes()
            self.assertEqual(markdown_bytes, page.text.encode("utf-8"))
            self.assertEqual(sha256(markdown_bytes).hexdigest(), page.normalized_checksum)
            normalized_path = Path(page_receipt["normalized_markdown_path"])
            normalized_bytes = normalized_path.read_bytes()
            self.assertEqual(sha256(normalized_bytes).hexdigest(), page_receipt["normalized_artifact_checksum"])
            self.assertFalse(page_receipt["canonical_authority"])
            chunks_bytes = (Path(tmp) / source.output_namespace / "chunks.jsonl").read_bytes()
            self.assertNotIn(b"\r\n", chunks_bytes)
            self.assertTrue(chunks_bytes.endswith(b"\n"))

    def test_relation_candidate_artifact_reads_back_utf8_spans_and_rejects_corruption(self) -> None:
        source = self._recrawl_source(source_id="shared-doc", source_revision="manifest-r1")
        pages = tuple(
            PageArtifact(
                source_id=source.source_id,
                source_revision=source.source_revision,
                requested_url=f"https://docs.example.test/{slug}",
                resolved_url=f"https://docs.example.test/{slug}",
                title=slug,
                text=f"# Guide\n\nCaf\u00e9 {slug} documents API.",
                fetcher="FIXTURE",
                raw_checksum="raw",
                normalized_checksum=sha256(_normalize_ws(f"# Guide\n\nCafé {slug} documents API.").encode("utf-8")).hexdigest(),
                outgoing_urls=(),
                metadata={},
            )
            for slug in ("alpha", "beta")
        )

        def relation_extractor(chunk_text: str):
            subject_start = chunk_text.index("Café")
            subject_end = subject_start + len("Café")
            predicate_start = chunk_text.index("documents", subject_end)
            predicate_end = predicate_start + len("documents")
            object_start = chunk_text.index("API", predicate_end)
            object_end = object_start + len("API")
            return tuple(), ({
                "schema": "atlas.external-doc-ontology-tuple.v1",
                "tuple_id": "tuple:cafe",
                "predicate": "documents",
                "subject_candidates": [
                    {"role": "subject", "text": "Café", "normalized_text": "café", "start_char": subject_start, "end_char": subject_end},
                ],
                "object_candidates": [
                    {"role": "object", "text": "API", "normalized_text": "api", "start_char": object_start, "end_char": object_end},
                ],
                "predicate_span_chars": [predicate_start, predicate_end],
                "evidence_span_chars": [subject_start, object_end],
                "participants": [
                    {"role": "subject", "text": "Café", "normalized_text": "café", "start_char": subject_start, "end_char": subject_end},
                    {"role": "object", "text": "API", "normalized_text": "api", "start_char": object_start, "end_char": object_end},
                ],
                "producer_revision": "fixture-v1",
                "extractor_version": "fixture-v1",
                "model_revision": "fixture-model-v1",
                "status": "PROPOSED",
                "canonical_authority": False,
            },)

        chunks = tuple(
            chunk
            for page in pages
            for chunk in chunk_document(
                source_id=page.source_id,
                source_revision=page.source_revision,
                source_url=page.resolved_url,
                title=page.title,
                text=page.text,
                maximum_chars=100,
                overlap_chars=0,
                nlp=relation_extractor,
            )
        )
        self.assertEqual(len(chunks), 2)

        oak_revision = "sha256:" + "b" * 64
        oak_producer = "oak-sidecar-fixture-v1"
        oak_responses = {
            chunk.chunk_id: {
                "schema": "atlas.oaklib-label-search-response.v1",
                "status": "PROPOSAL_ONLY",
                "ontologyRevision": oak_revision,
                "producerRevision": oak_producer,
                "canonicalAuthority": False,
                "writesPerformed": False,
                "matches": [
                    {"searchText": "Café", "externalIds": ["fixture:Cafe"]},
                    {"searchText": "API", "externalIds": ["fixture:API"]},
                ],
                "candidateBundle": {
                    "schema": "atlas.oaklib-candidate-bundle.v1",
                    "sourceSelector": "sqlite:/private/fixture.obo",
                    "ontologyRevision": oak_revision,
                    "producerRevision": oak_producer,
                    "canonicalAuthority": False,
                    "concepts": [
                        {"externalId": "fixture:Cafe", "label": "Café", "evidenceRefs": ["sqlite:/private/fixture.obo:entity:fixture:Cafe"], "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": oak_revision, "producerRevision": oak_producer},
                        {"externalId": "fixture:API", "label": "API", "evidenceRefs": ["sqlite:/private/fixture.obo:entity:fixture:API"], "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": oak_revision, "producerRevision": oak_producer},
                    ],
                    "relations": [{"subjectExternalId": "fixture:Cafe", "predicateExternalId": "fixture:documents", "objectExternalId": "fixture:API", "status": "PROPOSED", "canonicalAuthority": False, "ontologyRevision": oak_revision, "producerRevision": oak_producer}],
                },
            }
            for chunk in chunks
        }

        with TemporaryDirectory() as tmp:
            receipt = write_source_artifacts(
                Path(tmp), source, pages, chunks, workspace_revision="workspace-fixture-r1",
                oak_responses_by_chunk=oak_responses,
            )
            artifact_path = Path(receipt["relation_candidates_path"])
            rows = [json.loads(line) for line in artifact_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual([row["span_validation"] for row in rows], ["SPAN_READBACK_VERIFIED"] * 2)
            self.assertTrue(all(row["candidate"]["status"] == "PROPOSED" for row in rows))
            self.assertEqual(rows[0]["candidate"]["subject_candidates"][0]["text"], "Café")
            self.assertEqual(rows[0]["candidate"]["object_candidates"][0]["text"], "API")
            self.assertEqual(rows[0]["candidate"]["extractor_version"], "fixture-v1")
            self.assertEqual(receipt["relation_candidate_bound_count"], 2)
            self.assertEqual(receipt["relation_candidate_rejected_count"], 0)
            self.assertEqual(receipt["relation_proposal_bridged_count"], 2)
            self.assertTrue(all(row["ontology_mapping_status"] == "UNMAPPED_REVIEW_REQUIRED" for row in rows))
            proposal = rows[0]["hypergraph_proposal"]
            self.assertEqual(proposal["admission_state"], "PROPOSAL_ONLY")
            self.assertEqual(proposal["predicate"], "UNMAPPED_VERB:documents")
            self.assertEqual(proposal["ontology_ids"], [])
            self.assertEqual(proposal["concept_ids"], [])
            self.assertFalse(proposal["canonical_authority"])
            self.assertFalse(proposal["writes_performed"])
            oak_path = Path(receipt["relation_oak_review_path"])
            oak_rows = [json.loads(line) for line in oak_path.read_text(encoding="utf-8").splitlines()]
            self.assertEqual(receipt["relation_oak_review_count"], 2)
            self.assertEqual(len(oak_rows), 2)
            self.assertEqual(oak_rows[0]["participantMappings"][0]["status"], "SINGLE_CANDIDATE_REVIEW_REQUIRED")
            self.assertEqual(oak_rows[0]["participantMappings"][1]["status"], "SINGLE_CANDIDATE_REVIEW_REQUIRED")
            self.assertEqual(oak_rows[0]["relationProposal"]["ontologyIds"], [])
            self.assertEqual(len(oak_rows[0]["existingOntologyRelations"]), 1)
            self.assertFalse(oak_rows[0]["canonicalAuthority"])
            self.assertFalse(oak_rows[0]["writesPerformed"])
            self.assertNotIn("/private/", oak_path.read_text(encoding="utf-8"))

            prior_artifact = artifact_path.read_bytes()
            corrupt_relation = dict(chunks[0].ontology_tuples[0])
            corrupt_binding = dict(corrupt_relation["evidence_binding"])
            corrupt_binding["start_byte"] += 4  # starts inside the UTF-8 encoding of é
            corrupt_relation["evidence_binding"] = corrupt_binding
            corrupt_chunk = replace(chunks[0], ontology_tuples=(corrupt_relation,))
            with self.assertRaisesRegex(ValueError, "DOC14_RELATION_CANDIDATE_BATCH_REJECTED"):
                write_source_artifacts(
                    Path(tmp), source, pages, (corrupt_chunk, chunks[1]), workspace_revision="workspace-fixture-r1"
                )
            self.assertEqual(artifact_path.read_bytes(), prior_artifact)

            changed_page = replace(pages[0], text=pages[0].text.replace("documents", "mentions"))
            with self.assertRaisesRegex(ValueError, "NORMALIZED_CAPTURE_READBACK_CHECKSUM_MISMATCH"):
                write_source_artifacts(
                    Path(tmp), source, (changed_page, pages[1]), chunks,
                    workspace_revision="workspace-fixture-r1",
                )
            self.assertEqual(artifact_path.read_bytes(), prior_artifact)

    def test_api_document_facts_are_source_spanned_and_remain_pending(self) -> None:
        source_revision = "sha256:" + ("a" * 64)
        source = self._recrawl_source(source_id="dspy-docs", source_revision=source_revision)
        page = PageArtifact(
            source_id=source.source_id,
            source_revision=source_revision,
            requested_url="https://dspy.ai/current/api/modules/RLM/",
            resolved_url="https://dspy.ai/current/api/modules/RLM/",
            title="DSPy RLM API",
            text="# DSPy RLM\nUse `dspy.Predict(Signature)` with CUDA >= 12.1.\n",
            fetcher="FIXTURE",
            raw_checksum="raw",
            normalized_checksum=sha256(_normalize_ws("# DSPy RLM\nUse `dspy.Predict(Signature)` with CUDA >= 12.1.\n").encode("utf-8")).hexdigest(),
            outgoing_urls=(),
            metadata={},
        )
        chunks = chunk_document(
            source_id=page.source_id,
            source_revision=page.source_revision,
            source_url=page.resolved_url,
            title=page.title,
            text=page.text,
            maximum_chars=200,
            overlap_chars=0,
        )
        with TemporaryDirectory() as tmp:
            receipt = write_source_artifacts(Path(tmp), source, (page,), chunks, workspace_revision="workspace-r1")
            records = [
                json.loads(line)
                for line in Path(receipt["api_document_facts_path"]).read_text(encoding="utf-8").splitlines()
            ]
        self.assertEqual(receipt["api_document_fact_pending_count"], 1)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["status"], "PENDING_ONTOLOGY_REVIEW")
        fact = records[0]["facts"][0]
        self.assertEqual(fact["relationProposal"]["predicate"], "DOCUMENTED_BY")
        self.assertEqual(fact["relationProposal"]["status"], "PENDING")
        self.assertIsNone(fact["relationProposal"]["ontologyRevision"])
        self.assertIsNone(fact["relationProposal"]["objectRef"])
        chunk_bytes = chunks[0].text.encode("utf-8")
        mention = fact["mention"]
        self.assertEqual(chunk_bytes[mention["startByte"]:mention["endByte"]].decode("utf-8"), mention["text"])

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
