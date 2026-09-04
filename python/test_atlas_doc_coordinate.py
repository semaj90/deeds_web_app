"""Tests for DocCoordinateV1 (parent-atlas-versioned-doc-intelligence, DOC-02)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from atlas_doc_coordinate import DocCoordinateV1, build_doc_coordinate
from atlas_external_docs import chunk_document


def _coord(**overrides: object) -> DocCoordinateV1:
    base = dict(
        provider="nvidia",
        product="cuda-tile-ir",
        product_version="13.2",
        architecture="sm_86",
        language="python",
        url="https://docs.nvidia.com/cuda/tile-ir/",
        content_hash="a" * 64,
    )
    base.update(overrides)
    return build_doc_coordinate(**base)  # type: ignore[arg-type]


def test_same_url_two_versions_distinct_evidence_revision():
    v132 = _coord(product_version="13.2")
    v133 = _coord(product_version="13.3")
    assert v132.evidence_revision != v133.evidence_revision
    assert v132.url == v133.url  # same page, deliberately -- proves it's the version that differs


def test_same_inputs_deterministic_evidence_revision():
    a = _coord()
    b = _coord()
    assert a.evidence_revision == b.evidence_revision


def test_content_change_changes_evidence_revision():
    a = _coord(content_hash="a" * 64)
    b = _coord(content_hash="b" * 64)
    assert a.evidence_revision != b.evidence_revision


def test_architecture_is_optional_for_non_gpu_docs():
    coord = build_doc_coordinate(
        provider="postgresql",
        product="postgresql",
        product_version="18",
        url="https://www.postgresql.org/docs/18/",
        content_hash="c" * 64,
    )
    assert coord.architecture is None
    assert coord.language is None


def test_blank_provider_rejected():
    with pytest.raises(ValidationError):
        _coord(provider="   ")


def test_blank_product_version_rejected():
    with pytest.raises(ValidationError):
        _coord(product_version="")


def test_frozen_immutable():
    coord = _coord()
    with pytest.raises(ValidationError):
        coord.product_version = "14.0"  # type: ignore[misc]


def test_to_json_dict_includes_evidence_revision():
    coord = _coord()
    data = coord.to_json_dict()
    assert data["evidence_revision"] == coord.evidence_revision
    assert data["schema"] == "atlas.doc-coordinate.v1"
    assert data["product_version"] == "13.2"


def test_chunk_document_without_coordinate_is_unaffected():
    """Backward-compat: existing callers that don't pass doc_coordinate see no change."""
    chunks = chunk_document(
        source_id="src1",
        source_revision="sha256:" + "d" * 64,
        source_url="https://docs.nvidia.com/cuda/tile-ir/",
        title="Tile IR",
        text="# Intro\nSome text about tile programming.\n\n# Details\nMore detail here.",
    )
    assert len(chunks) >= 1
    assert all(chunk.doc_coordinate is None for chunk in chunks)
    assert "doc_coordinate" in chunks[0].to_dict()
    assert chunks[0].to_dict()["doc_coordinate"] is None


def test_chunk_document_with_coordinate_threads_per_chunk_section_anchor():
    """Real integration proof for DOC-02: each chunk gets its own DocCoordinateV1 with a
    section_anchor matching its own heading path, all sharing the same
    provider/product/product_version/url identity.
    """
    base = _coord(url="https://docs.nvidia.com/cuda/tile-ir/13.2/")
    chunks = chunk_document(
        source_id="src1",
        source_revision="sha256:" + "d" * 64,
        source_url=base.url,
        title="Tile IR",
        text="# Intro\nSome text about tile programming on Ampere.\n\n# Details\nMore detail about sm_86.",
        doc_coordinate=base,
    )
    assert len(chunks) >= 2
    for chunk in chunks:
        assert chunk.doc_coordinate is not None
        assert isinstance(chunk.doc_coordinate, DocCoordinateV1)
        assert chunk.doc_coordinate.provider == base.provider
        assert chunk.doc_coordinate.product == base.product
        assert chunk.doc_coordinate.product_version == base.product_version
        assert chunk.doc_coordinate.url == base.url
        # content_hash is rebound to the whole-document checksum, not the base's placeholder
        assert chunk.doc_coordinate.content_hash == chunk.document_checksum

    anchors = {chunk.doc_coordinate.section_anchor for chunk in chunks}
    assert "Intro" in anchors
    assert "Details" in anchors
    # Different section anchors -> different evidence_revision per chunk, even though
    # provider/product/product_version/url are identical -- proves section-level identity works.
    revisions = {chunk.doc_coordinate.evidence_revision for chunk in chunks}
    assert len(revisions) == len(chunks)


def test_chunk_document_serializes_doc_coordinate_in_to_dict():
    base = _coord()
    chunks = chunk_document(
        source_id="src1",
        source_revision="sha256:" + "d" * 64,
        source_url=base.url,
        title="Tile IR",
        text="# Intro\nSome text.",
        doc_coordinate=base,
    )
    serialized = chunks[0].to_dict()["doc_coordinate"]
    assert serialized["provider"] == "nvidia"
    assert serialized["product_version"] == "13.2"
    assert "evidence_revision" in serialized
