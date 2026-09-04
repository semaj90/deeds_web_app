"""Tests for the Pydantic manifest schema (parent-atlas-versioned-doc-intelligence, DOC-01)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from atlas_doc_manifest import PipelineManifestV1, SourceConfigV1, parse_manifest_v1

_VALID_PAYLOAD = {
    "manifest_revision": "m1",
    "workspace_revision": "w1",
    "source_snapshot_revision": "s1",
    "producer_revision": "p1",
    "sources": [
        {
            "source_id": "qdrant",
            "source_revision": "q1",
            "title": "Qdrant",
            "base_urls": ["https://qdrant.tech/documentation/"],
            "allowed_domains": ["qdrant.tech"],
            "authority_class": "OFFICIAL_PRIMARY",
            "default_fetcher": "BEAUTIFULSOUP_HTTP",
            "output_namespace": "docs/.okf/qdrant",
            "pages": ["https://qdrant.tech/documentation/concepts/points/"],
        }
    ],
}


def test_valid_manifest_parses():
    manifest = parse_manifest_v1(_VALID_PAYLOAD)
    assert isinstance(manifest, PipelineManifestV1)
    assert manifest.sources[0].source_id == "qdrant"
    assert manifest.sources[0].source_namespace is None
    # defaults resolved same as the pre-DOC-01 hand-rolled loader
    assert manifest.qdrant.collection == "external_programming_docs_768"
    assert manifest.features.som.rows == 20


def test_page_outside_allowed_domain_rejected():
    payload = {**_VALID_PAYLOAD, "sources": [dict(_VALID_PAYLOAD["sources"][0])]}
    payload["sources"][0] = {**payload["sources"][0], "pages": ["https://example.com/not-qdrant"]}
    with pytest.raises(ValueError):
        parse_manifest_v1(payload)


def test_missing_manifest_revision_rejected():
    payload = {k: v for k, v in _VALID_PAYLOAD.items() if k != "manifest_revision"}
    with pytest.raises(ValidationError):
        parse_manifest_v1(payload)


def test_duplicate_source_id_rejected():
    source = dict(_VALID_PAYLOAD["sources"][0])
    payload = {**_VALID_PAYLOAD, "sources": [source, dict(source)]}
    with pytest.raises(ValueError, match="DUPLICATE_SOURCE_ID"):
        parse_manifest_v1(payload)


def test_missing_base_urls_rejected():
    source = {**_VALID_PAYLOAD["sources"][0], "base_urls": []}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    with pytest.raises(ValueError, match="SOURCE_URLS_AND_DOMAINS_REQUIRED"):
        parse_manifest_v1(payload)


def test_invalid_output_namespace_rejected():
    source = {**_VALID_PAYLOAD["sources"][0], "output_namespace": "not/under/okf"}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    with pytest.raises(ValueError, match="INVALID_OKF_OUTPUT_NAMESPACE"):
        parse_manifest_v1(payload)


def test_output_namespace_defaults_from_source_id_when_absent():
    source = {k: v for k, v in _VALID_PAYLOAD["sources"][0].items() if k != "output_namespace"}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    manifest = parse_manifest_v1(payload)
    assert manifest.sources[0].output_namespace == "docs/.okf/qdrant"


def test_frozen_immutable():
    manifest = parse_manifest_v1(_VALID_PAYLOAD)
    with pytest.raises(ValidationError):
        manifest.manifest_revision = "m2"  # type: ignore[misc]
    with pytest.raises(ValidationError):
        manifest.sources[0].source_id = "other"  # type: ignore[misc]


def test_allowed_domains_lowercased_and_dot_stripped():
    source = {**_VALID_PAYLOAD["sources"][0], "allowed_domains": [".Qdrant.Tech"]}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    manifest = parse_manifest_v1(payload)
    assert manifest.sources[0].allowed_domains == ("qdrant.tech",)


def test_blank_source_namespace_normalized_to_none():
    source = {**_VALID_PAYLOAD["sources"][0], "source_namespace": "   "}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    manifest = parse_manifest_v1(payload)
    assert manifest.sources[0].source_namespace is None


def test_load_manifest_dataclass_bridge_matches_pydantic_values(tmp_path):
    """Cross-module proof: atlas_okf_docs_pipeline.load_manifest() now delegates
    to parse_manifest_json_v1() (raw bytes -> model_validate_json, the real
    admission boundary) and must produce field-for-field identical values in
    the SourceConfig/PipelineManifest dataclasses it still returns."""
    import json

    from atlas_okf_docs_pipeline import load_manifest

    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(_VALID_PAYLOAD), encoding="utf-8")

    dataclass_manifest = load_manifest(path)
    pydantic_manifest = parse_manifest_v1(_VALID_PAYLOAD)

    assert dataclass_manifest.manifest_revision == pydantic_manifest.manifest_revision
    assert dataclass_manifest.sources[0].source_id == pydantic_manifest.sources[0].source_id
    assert dataclass_manifest.sources[0].output_namespace == pydantic_manifest.sources[0].output_namespace
    assert dataclass_manifest.qdrant_collection == pydantic_manifest.qdrant.collection


def test_parse_manifest_json_v1_validates_raw_bytes_directly():
    """The real admission-boundary entry point: raw JSON bytes -> Pydantic-
    validated manifest, no untyped dict passed through in between."""
    import json

    from atlas_doc_manifest import parse_manifest_json_v1

    raw = json.dumps(_VALID_PAYLOAD).encode("utf-8")
    manifest = parse_manifest_json_v1(raw)
    assert manifest.sources[0].source_id == "qdrant"
    assert manifest.qdrant.collection == "external_programming_docs_768"


def test_unknown_top_level_field_rejected():
    """extra='forbid': a misspelled/unknown manifest field fails validation
    instead of being silently ignored."""
    payload = {**_VALID_PAYLOAD, "manifets_revision": "typo"}
    with pytest.raises(ValidationError):
        parse_manifest_v1(payload)


def test_unknown_source_field_rejected():
    source = {**_VALID_PAYLOAD["sources"][0], "allowd_domains": ["typo.example"]}
    payload = {**_VALID_PAYLOAD, "sources": [source]}
    with pytest.raises(ValidationError):
        parse_manifest_v1(payload)


def test_unknown_nested_qdrant_field_rejected():
    payload = {**_VALID_PAYLOAD, "qdrant": {"colection": "typo"}}
    with pytest.raises(ValidationError):
        parse_manifest_v1(payload)


# Byte-for-byte copy of docs/.okf/dev/atlas-doc-fabric.manifest.example.json's
# real content, as of this test's writing. That file lives outside this
# container's mount (only python/ is bind-mounted at /app/python -- confirmed
# live: `docker exec miniforge-nlp-sidecar ls /app/` shows only "python"), so
# it can't be read from disk here. Embedded verbatim instead of a synthetic
# payload so this test still proves the schema matches the real fixture's
# shape, not just a shape this file's own author assumed.
_REAL_FIXTURE_JSON = b"""{
  "manifest_revision": "okf-docs-manifest-r1",
  "workspace_revision": "workspace-current",
  "source_snapshot_revision": "external-docs-r1",
  "producer_revision": "parent-atlas-okf-pipeline-r1",
  "output_root": ".",
  "embedding": {
    "url": "http://127.0.0.1:8081",
    "model": "embeddinggemma-300m-f16.gguf"
  },
  "qdrant": {
    "url": "http://127.0.0.1:6333",
    "collection": "external_programming_docs_768"
  },
  "features": {
    "low_rank": 64,
    "kmeans_clusters": 64,
    "som": {
      "rows": 20,
      "columns": 20
    }
  },
  "sources": [
    {
      "source_id": "qdrant",
      "source_revision": "qdrant-docs-2026-08-19",
      "title": "Qdrant Documentation",
      "base_urls": ["https://qdrant.tech/documentation/"],
      "allowed_domains": ["qdrant.tech"],
      "authority_class": "OFFICIAL_PRIMARY",
      "default_fetcher": "FIRECRAWL_V2",
      "output_namespace": "docs/.okf/qdrant",
      "maximum_pages": 16,
      "maximum_depth": 2,
      "pages": [
        "https://qdrant.tech/documentation/concepts/points/",
        "https://qdrant.tech/documentation/search/filtering/",
        "https://qdrant.tech/documentation/manage-data/indexing/",
        "https://qdrant.tech/documentation/manage-data/quantization/"
      ]
    },
    {
      "source_id": "firecrawl",
      "source_revision": "firecrawl-v2-docs-2026-08-19",
      "title": "Firecrawl v2 Documentation",
      "base_urls": ["https://docs.firecrawl.dev/"],
      "allowed_domains": ["docs.firecrawl.dev"],
      "authority_class": "OFFICIAL_PRIMARY",
      "default_fetcher": "FIRECRAWL_V2",
      "output_namespace": "docs/.okf/firecrawl",
      "maximum_pages": 12,
      "maximum_depth": 2,
      "pages": [
        "https://docs.firecrawl.dev/api-reference/v2-introduction",
        "https://docs.firecrawl.dev/api-reference/endpoint/crawl-post"
      ]
    }
  ]
}"""


def test_real_fixture_manifest_validates_end_to_end():
    """Prove the schema matches the real on-disk fixture's shape, not just a
    synthetic payload this test file's own author assumed."""
    from atlas_doc_manifest import parse_manifest_json_v1

    manifest = parse_manifest_json_v1(_REAL_FIXTURE_JSON)
    assert manifest.qdrant.collection == "external_programming_docs_768"
    assert {source.source_id for source in manifest.sources} == {"qdrant", "firecrawl"}
    assert manifest.sources[0].default_fetcher == "FIRECRAWL_V2"
    assert manifest.features.som.rows == 20
