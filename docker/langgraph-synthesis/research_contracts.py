"""Typed, non-canonical contracts for research evidence and DAG parameters."""

from __future__ import annotations

import hashlib
from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel


class StrictCamelContract(BaseModel):
    """Base contract enforcing camelCase JSON wire format and extra='forbid'."""
    model_config = ConfigDict(
        extra="forbid",
        populate_by_name=True,
        alias_generator=to_camel,
    )


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
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


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


class ResearchParameterArtifactV1(StrictCamelContract):
    """Renamed from atlas.parameter-artifact.v1 to resolve collision with TS kernel binding."""
    schema_id: Literal["atlas.research-parameter.v1"] = Field(
        default="atlas.research-parameter.v1", alias="schema"
    )
    parameter_key: str
    value: str | int | float | bool
    input_checksum: str = Field(min_length=64, max_length=64, pattern=r"^[a-f0-9]{64}$")
    producer_revision: str
    evidence_refs: list[str] = Field(default_factory=list)
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


class DagPrefillNodeV1(StrictCamelContract):
    node_id: str
    relative_path: str
    topo_class: str
    graph_authority: float = Field(ge=0.0, le=1.0)
    pagerank: float = Field(ge=0.0, le=1.0)
    agents_dir: str
    error_signatures: list[str] = Field(default_factory=list)


class AcpKanbanErrorTaskV1(StrictCamelContract):
    """End-to-end payload emitted by :8095 LangGraph synthesis for ACP/A2A Kanban agents."""
    schema_id: Literal["atlas.acp-kanban-error-task.v1"] = Field(
        default="atlas.acp-kanban-error-task.v1", alias="schema"
    )
    task_id: str
    board_column: Literal["backlog", "prefilled", "in_progress", "verify", "blocked"]
    source_agent: str
    target_agent: str
    relative_path: str
    extracted_spans: list[str]
    dag_prefill_nodes: list[DagPrefillNodeV1]
    prompt_cards: list[str]
    recommended_fix_actions: list[str]
    db_schema_verified: bool
    canonical_authority: Literal[False] = False
    writes_performed: Literal[False] = False


# Backward-compatibility alias
ParameterArtifactV1 = ResearchParameterArtifactV1
