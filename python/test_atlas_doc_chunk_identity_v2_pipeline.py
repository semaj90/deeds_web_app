"""DOC-26: explicit versioned-recrawl identity selection, without persistence."""

from __future__ import annotations

import json

import pytest

from atlas_doc_manifest import SourceConfigV1
from atlas_doc_coordinate import build_doc_coordinate, external_doc_chunk_id_v2
from atlas_external_docs import _normalize_ws, _sha
from atlas_okf_docs_pipeline import PageArtifact, compile_chunks, load_manifest


def _source(**overrides):
    source = {
        "source_id": "pgvector",
        "source_revision": "manifest-r1",
        "base_urls": ("https://github.com/pgvector/pgvector",),
        "allowed_domains": ("github.com",),
        "provider": "pgvector",
        "product": "pgvector",
        "product_version": "0.8.0",
        "version_qualification": "EXACT_VERSION",
        "chunk_identity_version": "V2",
    }
    source.update(overrides)
    return SourceConfigV1.model_validate(source)


def _page(version: str) -> tuple[PageArtifact, object]:
    text = "# API\nThe versioned vector search contract remains byte-identical."
    normalized = _normalize_ws(text)
    url = "https://github.com/pgvector/pgvector"
    page = PageArtifact(
        source_id="pgvector",
        source_revision=f"pgvector-{version}",
        requested_url=url,
        resolved_url=url,
        title="pgvector API",
        text=text,
        fetcher="BEAUTIFULSOUP_HTTP",
        raw_checksum=_sha(text),
        normalized_checksum=_sha(normalized),
        outgoing_urls=(),
        metadata={},
    )
    coordinate = build_doc_coordinate(
        provider="pgvector",
        product="pgvector",
        product_version=version,
        url=url,
        content_hash=_sha(normalized),
    )
    return page, coordinate


def test_manifest_defaults_to_legacy_v1_and_explicitly_accepts_qualified_v2():
    assert _source(chunk_identity_version="V1").chunk_identity_version == "V1"
    assert _source().chunk_identity_version == "V2"


def test_manifest_to_pipeline_dataclass_preserves_v2_selection(tmp_path):
    source = {
        "source_id": "pgvector",
        "source_revision": "manifest-r1",
        "base_urls": ["https://github.com/pgvector/pgvector"],
        "allowed_domains": ["github.com"],
        "output_namespace": "docs/.okf/pinned/pgvector",
        "provider": "pgvector",
        "product": "pgvector",
        "product_version": "0.8.0",
        "version_qualification": "EXACT_VERSION",
        "chunk_identity_version": "V2",
    }
    manifest = {
        "manifest_revision": "fixture-m1",
        "workspace_revision": "fixture-w1",
        "source_snapshot_revision": "fixture-s1",
        "producer_revision": "fixture-p1",
        "sources": [source],
    }
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    assert load_manifest(path).sources[0].chunk_identity_version == "V2"


@pytest.mark.parametrize(
    "overrides",
    [
        {"provider": None},
        {"product": None},
        {"product_version": None},
        {"version_qualification": "CURRENT_UPSTREAM"},
    ],
)
def test_v2_manifest_requires_explicit_product_version_identity(overrides):
    with pytest.raises(ValueError):
        _source(**overrides)


def test_pipeline_v2_ids_are_version_qualified_and_v1_ids_remain_unchanged():
    page_a, coordinate_a = _page("0.8.0")
    page_b, coordinate_b = _page("0.9.0")
    coordinate_for_a = lambda _page: coordinate_a
    coordinate_for_b = lambda _page: coordinate_b

    v1_a = compile_chunks(
        [page_a], stanza_pipeline=None, stanza_model_revision="none",
        maximum_chars=400, overlap_chars=20, coordinate_for=coordinate_for_a,
    )
    v1_b = compile_chunks(
        [page_b], stanza_pipeline=None, stanza_model_revision="none",
        maximum_chars=400, overlap_chars=20, coordinate_for=coordinate_for_b,
    )
    assert [chunk.chunk_id for chunk in v1_a] == [chunk.chunk_id for chunk in v1_b]
    assert v1_a[0].chunk_id == f"doc:pgvector:{_sha(_normalize_ws(page_a.text))[:16]}:0"

    v2_a = compile_chunks(
        [page_a], stanza_pipeline=None, stanza_model_revision="none",
        maximum_chars=400, overlap_chars=20, coordinate_for=coordinate_for_a,
        chunk_identity_version="V2",
    )
    v2_b = compile_chunks(
        [page_b], stanza_pipeline=None, stanza_model_revision="none",
        maximum_chars=400, overlap_chars=20, coordinate_for=coordinate_for_b,
        chunk_identity_version="V2",
    )
    assert v2_a[0].chunk_id == external_doc_chunk_id_v2(
        source_id="pgvector", chunk_evidence_revision=v2_a[0].chunk_evidence_revision
    )
    assert v2_b[0].chunk_id == external_doc_chunk_id_v2(
        source_id="pgvector", chunk_evidence_revision=v2_b[0].chunk_evidence_revision
    )
    assert v2_a[0].chunk_id != v2_b[0].chunk_id
    assert v1_a[0].chunk_id.startswith("doc:pgvector:")


def test_v2_chunking_fails_closed_without_revision_qualified_coordinate():
    page, _coordinate = _page("0.8.0")
    with pytest.raises(ValueError, match="DOC_CHUNK_IDENTITY_V2_REQUIRES_VERSIONED_COORDINATE"):
        compile_chunks(
            [page], stanza_pipeline=None, stanza_model_revision="none",
            maximum_chars=400, overlap_chars=20, chunk_identity_version="V2",
        )
