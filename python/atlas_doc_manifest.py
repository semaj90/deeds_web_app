"""Pydantic manifest schema for the /docs/.okf external documentation pipeline
(parent-atlas-versioned-doc-intelligence, DOC-01).

``atlas_okf_docs_pipeline.py``'s ``PipelineManifest``/``SourceConfig`` stay
``@dataclass(frozen=True)`` -- every downstream pipeline stage (fetch, chunk,
embed, Qdrant, SOM) already consumes those exact types, and this task does not
touch them (DOC-01 explicitly requires not breaking the existing CLI's
dataclass consumers).

This module adds a strict validation *front door* instead: ``SourceConfigV1``/
``PipelineManifestV1`` parse and reject a manifest JSON document before
``atlas_okf_docs_pipeline.load_manifest()`` ever constructs the dataclasses,
replacing that function's hand-rolled required-key/duplicate-id/domain checks
with declarative Pydantic validation. Pydantic v2's ``ValidationError``
subclasses ``ValueError`` (confirmed live: pydantic 2.13.5,
``ValidationError.__mro__`` includes ``ValueError``), so every existing
``assertRaises(ValueError)`` caller keeps working unchanged.

Depends only on ``atlas_external_docs`` (a leaf module) so
``atlas_okf_docs_pipeline.py`` can import this module without a cycle.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from atlas_external_docs import enforce_allowed_domain, validate_okf_output_namespace

Json = dict[str, Any]


class SourceConfigV1(BaseModel):
    """Validated mirror of ``atlas_okf_docs_pipeline.SourceConfig``."""

    source_id: str = Field(..., min_length=1)
    source_revision: str = Field(..., min_length=1)
    title: str = Field(default="")
    base_urls: tuple[str, ...] = Field(default_factory=tuple)
    allowed_domains: tuple[str, ...] = Field(default_factory=tuple)
    authority_class: str = "PRIMARY_PROJECT"
    default_fetcher: str = "BEAUTIFULSOUP_HTTP"
    output_namespace: str = Field(..., min_length=1)
    include_paths: tuple[str, ...] = Field(default_factory=tuple)
    exclude_paths: tuple[str, ...] = Field(default_factory=tuple)
    maximum_pages: int = Field(default=100, ge=1)
    maximum_depth: int = Field(default=3, ge=0)
    pages: tuple[str, ...] = Field(default_factory=tuple)
    ldr_export_files: tuple[str, ...] = Field(default_factory=tuple)
    source_namespace: Optional[str] = None

    model_config = {"frozen": True}

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
    """Validated mirror of ``atlas_okf_docs_pipeline.PipelineManifest``."""

    manifest_revision: str = Field(..., min_length=1)
    workspace_revision: str = Field(..., min_length=1)
    source_snapshot_revision: str = Field(..., min_length=1)
    producer_revision: str = Field(..., min_length=1)
    output_root: str = "."
    sources: tuple[SourceConfigV1, ...] = Field(..., min_length=1)
    qdrant_collection: str = "external_programming_docs_768"
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_api_key_env: Optional[str] = None
    embedding_url: str = "http://127.0.0.1:8081"
    embedding_model: str = "embeddinggemma-300m-f16.gguf"
    low_rank: int = Field(default=64, ge=1)
    kmeans_clusters: int = Field(default=64, ge=1)
    som_rows: int = Field(default=20, ge=1)
    som_columns: int = Field(default=20, ge=1)

    model_config = {"frozen": True}

    @model_validator(mode="after")
    def _unique_source_ids(self) -> "PipelineManifestV1":
        seen: set[str] = set()
        for source in self.sources:
            if source.source_id in seen:
                raise ValueError(f"DUPLICATE_SOURCE_ID:{source.source_id}")
            seen.add(source.source_id)
        return self


def parse_manifest_v1(payload: Json) -> PipelineManifestV1:
    """Parse+validate a manifest JSON document (already loaded from disk).

    Mirrors the exact default-resolution rules of
    ``atlas_okf_docs_pipeline.load_manifest`` (per-source ``output_namespace``
    defaulting to ``docs/.okf/<source_id>``, ``title`` defaulting to
    ``source_id``, nested ``qdrant``/``embedding``/``features.som`` blocks)
    so the two loaders agree on every manifest this repo already ships.
    """

    qdrant = payload.get("qdrant") or {}
    embedding = payload.get("embedding") or {}
    features = payload.get("features") or {}
    som = features.get("som") or {}

    def _source(raw: Json) -> SourceConfigV1:
        source_id = str(raw.get("source_id") or "")
        return SourceConfigV1(
            source_id=source_id,
            source_revision=str(raw.get("source_revision") or ""),
            title=str(raw.get("title") or source_id),
            base_urls=tuple(str(item) for item in raw.get("base_urls") or []),
            allowed_domains=tuple(str(item) for item in raw.get("allowed_domains") or []),
            authority_class=str(raw.get("authority_class") or "PRIMARY_PROJECT"),
            default_fetcher=str(raw.get("default_fetcher") or "BEAUTIFULSOUP_HTTP"),
            output_namespace=str(raw.get("output_namespace") or f"docs/.okf/{source_id}"),
            include_paths=tuple(str(item) for item in raw.get("include_paths") or []),
            exclude_paths=tuple(str(item) for item in raw.get("exclude_paths") or []),
            maximum_pages=int(raw.get("maximum_pages", 100)),
            maximum_depth=int(raw.get("maximum_depth", 3)),
            pages=tuple(str(item) for item in raw.get("pages") or []),
            ldr_export_files=tuple(str(item) for item in raw.get("ldr_export_files") or []),
            source_namespace=(str(raw["source_namespace"]) if raw.get("source_namespace") is not None else None),
        )

    return PipelineManifestV1(
        manifest_revision=str(payload.get("manifest_revision") or ""),
        workspace_revision=str(payload.get("workspace_revision") or ""),
        source_snapshot_revision=str(payload.get("source_snapshot_revision") or ""),
        producer_revision=str(payload.get("producer_revision") or ""),
        output_root=str(payload.get("output_root") or "."),
        sources=tuple(_source(raw) for raw in payload.get("sources") or []),
        qdrant_collection=str(qdrant.get("collection") or "external_programming_docs_768"),
        qdrant_url=str(qdrant.get("url") or "http://127.0.0.1:6333"),
        qdrant_api_key_env=(str(qdrant["api_key_env"]) if qdrant.get("api_key_env") else None),
        embedding_url=str(embedding.get("url") or "http://127.0.0.1:8081"),
        embedding_model=str(embedding.get("model") or "embeddinggemma-300m-f16.gguf"),
        low_rank=int(features.get("low_rank", 64)),
        kmeans_clusters=int(features.get("kmeans_clusters", 64)),
        som_rows=int(som.get("rows", 20)),
        som_columns=int(som.get("columns", 20)),
    )
