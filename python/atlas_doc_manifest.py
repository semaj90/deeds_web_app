"""Pydantic manifest schema for the /docs/.okf external documentation pipeline
(parent-atlas-versioned-doc-intelligence, DOC-01 / OKF-DOC-PYDANTIC-MANIFEST-01).

``atlas_okf_docs_pipeline.py``'s ``PipelineManifest``/``SourceConfig`` stay
``@dataclass(frozen=True)`` -- every downstream pipeline stage (fetch, chunk,
embed, Qdrant, SOM) already consumes those exact types, and this task does not
touch them (DOC-01 explicitly requires not breaking the existing CLI's
dataclass consumers; do not refactor every internal dataclass in one gate).

This module is the strict validation *admission boundary*: ``PipelineManifestV1``
parses (and rejects) a manifest JSON document -- via ``model_validate_json`` on
raw bytes, or ``model_validate``/the ``parse_manifest_v1`` convenience wrapper on
an already-loaded dict -- before ``atlas_okf_docs_pipeline.load_manifest()`` ever
constructs the dataclasses the rest of the pipeline consumes.

Every model in this file sets ``extra: "forbid"``: a misspelled manifest field
(e.g. ``allowd_domains``) fails validation instead of being silently ignored.
The model's field structure mirrors the real on-disk manifest shape 1:1,
including nested ``qdrant``/``embedding``/``features.som`` blocks (verified
against ``docs/.okf/dev/atlas-doc-fabric.manifest.example.json``, the real
fixture for this loader) -- not a flattened dataclass-mirroring shape -- so
``model_validate_json`` can be handed raw manifest bytes directly with no
external dict-massaging step in between.

Pydantic v2's ``ValidationError`` subclasses ``ValueError`` (confirmed live:
pydantic 2.13.5, ``ValidationError.__mro__`` includes ``ValueError``), so
every existing ``assertRaises(ValueError)`` caller keeps working unchanged.

Depends only on ``atlas_external_docs`` (a leaf module) so
``atlas_okf_docs_pipeline.py`` can import this module without a cycle.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from atlas_external_docs import enforce_allowed_domain, validate_okf_output_namespace

Json = dict[str, Any]

_STRICT = {"frozen": True, "extra": "forbid"}


class SomConfigV1(BaseModel):
    rows: int = Field(default=20, ge=1)
    columns: int = Field(default=20, ge=1)

    model_config = _STRICT


class FeaturesConfigV1(BaseModel):
    low_rank: int = Field(default=64, ge=1)
    kmeans_clusters: int = Field(default=64, ge=1)
    som: SomConfigV1 = Field(default_factory=SomConfigV1)

    model_config = _STRICT


class QdrantConfigV1(BaseModel):
    collection: str = "external_programming_docs_768"
    url: str = "http://127.0.0.1:6333"
    api_key_env: Optional[str] = None

    model_config = _STRICT

    @field_validator("api_key_env")
    @classmethod
    def _blank_is_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class EmbeddingConfigV1(BaseModel):
    url: str = "http://127.0.0.1:8081"
    model: str = "embeddinggemma-300m-f16.gguf"

    model_config = _STRICT


class SourceConfigV1(BaseModel):
    """Validated mirror of ``atlas_okf_docs_pipeline.SourceConfig``, plus
    ``extra: "forbid"`` -- a misspelled source field (e.g. ``base_url`` for
    ``base_urls``) is a validation error, not silently dropped data."""

    source_id: str = Field(..., min_length=1)
    source_revision: str = Field(..., min_length=1)
    title: str = Field(default="")
    base_urls: tuple[str, ...] = Field(default_factory=tuple)
    allowed_domains: tuple[str, ...] = Field(default_factory=tuple)
    authority_class: str = "PRIMARY_PROJECT"
    default_fetcher: str = "BEAUTIFULSOUP_HTTP"
    output_namespace: str = Field(default="")
    include_paths: tuple[str, ...] = Field(default_factory=tuple)
    exclude_paths: tuple[str, ...] = Field(default_factory=tuple)
    maximum_pages: int = Field(default=100, ge=1)
    maximum_depth: int = Field(default=3, ge=0)
    pages: tuple[str, ...] = Field(default_factory=tuple)
    ldr_export_files: tuple[str, ...] = Field(default_factory=tuple)
    source_namespace: Optional[str] = None

    model_config = _STRICT

    @model_validator(mode="before")
    @classmethod
    def _defaults_from_source_id(cls, data: Any) -> Any:
        """Per-source defaults that depend on a sibling field (source_id) --
        must run before individual field validation, so this is a "before"
        model validator rather than per-field defaults."""
        if isinstance(data, dict):
            data = dict(data)
            source_id = str(data.get("source_id") or "")
            if not data.get("title"):
                data["title"] = source_id
            if not data.get("output_namespace"):
                data["output_namespace"] = f"docs/.okf/{source_id}"
        return data

    @field_validator("allowed_domains")
    @classmethod
    def _lowercase_domains(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        return tuple(str(item).lower().lstrip(".") for item in value)

    @field_validator("source_namespace")
    @classmethod
    def _blank_namespace_is_none(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("output_namespace")
    @classmethod
    def _valid_output_namespace(cls, value: str) -> str:
        validate_okf_output_namespace(value)
        return value

    @model_validator(mode="after")
    def _urls_and_domains_required_and_allowed(self) -> "SourceConfigV1":
        if not self.base_urls or not self.allowed_domains:
            raise ValueError(f"SOURCE_URLS_AND_DOMAINS_REQUIRED:{self.source_id}")
        for url in (*self.base_urls, *self.pages):
            enforce_allowed_domain(url, self.allowed_domains)
        return self


class PipelineManifestV1(BaseModel):
    """Validated mirror of ``atlas_okf_docs_pipeline.PipelineManifest``, field
    structure matching the real on-disk manifest shape 1:1 (nested
    ``qdrant``/``embedding``/``features.som`` blocks, not flattened), so
    ``model_validate_json`` can parse raw manifest bytes directly. ``extra:
    "forbid"`` at every level -- an unknown top-level or nested key fails
    validation rather than being silently ignored."""

    manifest_revision: str = Field(..., min_length=1)
    workspace_revision: str = Field(..., min_length=1)
    source_snapshot_revision: str = Field(..., min_length=1)
    producer_revision: str = Field(..., min_length=1)
    output_root: str = "."
    sources: tuple[SourceConfigV1, ...] = Field(..., min_length=1)
    qdrant: QdrantConfigV1 = Field(default_factory=QdrantConfigV1)
    embedding: EmbeddingConfigV1 = Field(default_factory=EmbeddingConfigV1)
    features: FeaturesConfigV1 = Field(default_factory=FeaturesConfigV1)

    model_config = _STRICT

    @model_validator(mode="after")
    def _unique_source_ids(self) -> "PipelineManifestV1":
        seen: set[str] = set()
        for source in self.sources:
            if source.source_id in seen:
                raise ValueError(f"DUPLICATE_SOURCE_ID:{source.source_id}")
            seen.add(source.source_id)
        return self


def parse_manifest_v1(payload: Json) -> PipelineManifestV1:
    """Validate an already-loaded manifest dict. Thin wrapper over
    ``model_validate`` -- kept as a named entry point so callers don't need to
    know the Pydantic method name, and so the docstring's field-shape
    guarantees live in one place."""
    return PipelineManifestV1.model_validate(payload)


def parse_manifest_json_v1(raw: bytes | str) -> PipelineManifestV1:
    """Validate raw manifest JSON bytes/text directly -- Pydantic v2's
    ``model_validate_json`` (the admission boundary this gate exists to add:
    raw JSON -> Pydantic-validated manifest -> existing pipeline internals,
    with no untyped dict passed through in between)."""
    return PipelineManifestV1.model_validate_json(raw)
