"""Typed, non-canonical contracts for research evidence and DAG parameters."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


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
