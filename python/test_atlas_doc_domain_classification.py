"""Tests for DOC-09: DomainClassificationV1 envelope (parent-atlas-versioned-doc-intelligence)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from atlas_doc_coordinate import build_doc_coordinate
from atlas_doc_domain_classification import DomainClassificationV1, classify_external_doc_domain
from atlas_external_docs import chunk_document
from parent_atlas_ontology.domain_mapping import admit_domain_classification


def _gpu_chunk():
    # "CUDA" literal is required to actually trigger classify_domain()'s gpu
    # DOMAIN_RULES pattern (\b(cuda|cuvs|cugraph|cusparse|gpu|tensor core|
    # triton|cutlass)\b) -- domain_class is computed once for the whole
    # document (classify_domain(title, normalized) in chunk_document()), so
    # every chunk in this fixture shares it, and "tile_ir"/"sm_86" alone
    # don't match any DOMAIN_RULES pattern.
    text = (
        "# Tile IR\n"
        "CUDA kernel programming with tile_ir on sm_86.\n\n"
        "## API\n"
        "Call `cutile.tile_load(ptr, shape)` to load a tile."
    )
    coordinate = build_doc_coordinate(
        provider="nvidia",
        product="cuda-tile-ir",
        product_version="13.2",
        architecture="sm_86",
        language="python",
        url="https://docs.nvidia.com/cuda/tile-ir/13.2/",
        content_hash="a" * 64,
    )
    chunks = chunk_document(
        source_id="nvidia-tile-ir",
        source_revision="sha256:" + "b" * 64,
        source_url=coordinate.url,
        title="Tile IR",
        text=text,
        doc_coordinate=coordinate,
    )
    return chunks


def test_gpu_domain_now_admitted_not_unmapped():
    """The whole point of DOC-09's mapping-table extension: 'gpu' used to be
    UNMAPPED for external docs (classify_domain() can emit it, but the
    pre-existing _DEFAULT_MAPPINGS never covered it)."""
    admission = admit_domain_classification("gpu", confidence=1.0)
    assert admission.status == "ADMITTED"
    assert admission.classId == "atlas:GpuComputeDomain"


@pytest.mark.parametrize(
    "label",
    ["gpu", "training", "model_runtime", "cache", "protocol", "testing", "api"],
)
def test_all_external_doc_only_labels_now_admitted(label):
    admission = admit_domain_classification(label, confidence=1.0)
    assert admission.status == "ADMITTED", f"{label} still unmapped"


def test_classify_external_doc_domain_envelope_shape():
    chunks = _gpu_chunk()
    api_chunk = next(c for c in chunks if c.heading_path == ("Tile IR", "API"))
    envelope = classify_external_doc_domain(api_chunk, producer_revision="test-r1")

    assert isinstance(envelope, DomainClassificationV1)
    data = envelope.to_json_dict()
    assert data["schema"] == "atlas.domain-classification.v1"
    assert data["kind"] == "ExternalDocumentation"
    assert data["canonicalAuthority"] is False
    assert data["metadata"]["provider"] == "nvidia"
    assert data["metadata"]["product"] == "cuda-tile-ir"
    assert data["metadata"]["version"] == "13.2"
    assert tuple(data["metadata"]["architectures"]) == ("sm_86",)
    assert tuple(data["metadata"]["languages"]) == ("python",)
    assert "cutile.tile_load(ptr, shape)" in data["metadata"]["capabilities"]
    assert tuple(data["evidenceRefs"]) == (api_chunk.chunk_id,)
    assert data["producerRevision"] == "test-r1"


def test_confidence_reflects_real_admission_status_not_a_bare_fallback_check():
    chunks = _gpu_chunk()
    api_chunk = next(c for c in chunks if c.heading_path == ("Tile IR", "API"))
    # "gpu" is admitted (DOC-09 mapping extension) -> confidence 1.0
    assert api_chunk.domain_class == "gpu"
    envelope = classify_external_doc_domain(api_chunk, producer_revision="r1")
    assert envelope.confidence == 1.0


def test_capabilities_come_from_existing_api_signatures_not_a_new_taxonomy():
    """capabilities must be exactly the chunk's own DOC-05 api_signatures --
    never a hand-invented keyword list, per design.md's governing principle."""
    chunks = _gpu_chunk()
    api_chunk = next(c for c in chunks if c.heading_path == ("Tile IR", "API"))
    envelope = classify_external_doc_domain(api_chunk, producer_revision="r1")
    assert tuple(envelope.metadata.capabilities) == tuple(api_chunk.api_signatures)


def test_no_doc_coordinate_yields_empty_version_fields_not_a_crash():
    """Backward compat: a chunk without doc_coordinate (pre-DOC-02 caller)
    still produces a valid envelope, just without version qualification."""
    chunks = chunk_document(
        source_id="s", source_revision="sha256:" + "c" * 64, source_url="https://example.test/",
        title="T", text="# H\nSome plain documentation text.",
    )
    envelope = classify_external_doc_domain(chunks[0], producer_revision="r1")
    assert envelope.metadata.provider == ""
    assert envelope.metadata.architectures == ()
    assert envelope.canonical_authority is False


def test_canonical_authority_is_always_false():
    chunks = _gpu_chunk()
    for chunk in chunks:
        envelope = classify_external_doc_domain(chunk, producer_revision="r1")
        assert envelope.canonical_authority is False


def test_frozen_immutable():
    chunks = _gpu_chunk()
    envelope = classify_external_doc_domain(chunks[0], producer_revision="r1")
    with pytest.raises(ValidationError):
        envelope.primary = "other"  # type: ignore[misc]


def test_confidence_out_of_range_rejected():
    from atlas_doc_domain_classification import DomainClassificationMetadataV1

    with pytest.raises(ValidationError):
        DomainClassificationV1(
            metadata=DomainClassificationMetadataV1(domain="gpu"),
            primary="gpu",
            confidence=1.5,
            evidenceRefs=("chunk:1",),
            producerRevision="r1",
        )


def test_empty_evidence_refs_rejected():
    from atlas_doc_domain_classification import DomainClassificationMetadataV1

    with pytest.raises(ValidationError):
        DomainClassificationV1(
            metadata=DomainClassificationMetadataV1(domain="gpu"),
            primary="gpu",
            confidence=1.0,
            evidenceRefs=(),
            producerRevision="r1",
        )
