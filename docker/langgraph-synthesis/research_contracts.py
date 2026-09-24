"""Typed, non-canonical contracts for research evidence and DAG parameters."""

from __future__ import annotations

from typing import Any, Literal
import hashlib

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WebSearchResultV1(BaseModel):
    """One bounded web-search observation, never a canonical source row."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=512)
    url: str = Field(min_length=1, max_length=4096)
    snippet: str = Field(default="", max_length=8000)
    source: str = Field(min_length=1, max_length=128)


class WebSearchEnvelopeV1(BaseModel):
    """Stable envelope for LDR-style web-search tool output."""

    model_config = ConfigDict(extra="forbid")

    schema_: str = Field(default="atlas.web-search-envelope.v1", alias="schema")
    query: str = Field(min_length=1, max_length=4096)
    provider: str = Field(min_length=1, max_length=128)
    results: list[WebSearchResultV1] = Field(default_factory=list, max_length=50)
    canonical_authority: bool = False
    writes_performed: bool = False


class FetchedResearchDocumentV1(BaseModel):
    """Bounded fetched-page evidence; not an admitted source revision."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    schema_: Literal["atlas.fetched-research-document.v1"] = Field(
        default="atlas.fetched-research-document.v1", alias="schema"
    )
    query: str = Field(min_length=1, max_length=4096)
    url: str = Field(min_length=1, max_length=4096)
    resolved_url: str = Field(min_length=1, max_length=4096)
    title: str = Field(min_length=1, max_length=512)
    fetcher: Literal["BEAUTIFULSOUP_HTTP", "FIRECRAWL_V2"]
    normalized_text: str = Field(min_length=1, max_length=2_000_000)
    normalized_checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False

    @classmethod
    def checksum_for(cls, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    @model_validator(mode="after")
    def checksum_matches_content(self) -> "FetchedResearchDocumentV1":
        if self.checksum_for(self.normalized_text) != self.normalized_checksum:
            raise ValueError("FETCHED_DOCUMENT_CHECKSUM_MISMATCH")
        return self


class ParameterArtifactV1(BaseModel):
    """Receipt-qualified DAG parameters; values are inputs, not authority."""

    model_config = ConfigDict(extra="forbid")

    schema_: str = Field(default="atlas.parameter-artifact.v1", alias="schema")
    parameter_key: str = Field(min_length=1, max_length=256)
    value: Any
    input_checksum: str = Field(min_length=1, max_length=256)
    producer_revision: str = Field(min_length=1, max_length=256)
    evidence_refs: list[str] = Field(default_factory=list, max_length=100)
    canonical_authority: bool = False
    writes_performed: bool = False
