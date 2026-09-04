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
    assert manifest.qdrant_collection == "external_programming_docs_768"
    assert manifest.som_rows == 20


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
    to parse_manifest_v1() and must produce field-for-field identical values in
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
    assert dataclass_manifest.qdrant_collection == pydantic_manifest.qdrant_collection
