from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


SHA256_REVISION = re.compile(r"^sha256:[a-f0-9]{64}$")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True, populate_by_name=True)


class CanonicalFeatureBindingV1(StrictModel):
    feature_id: str = Field(min_length=1)
    feature_label: str = Field(min_length=1)
    taxonomy_revision: str

    @model_validator(mode="after")
    def validate_taxonomy_revision(self) -> "CanonicalFeatureBindingV1":
        if not SHA256_REVISION.fullmatch(self.taxonomy_revision):
            raise ValueError("TAXONOMY_REVISION_MUST_BE_SHA256")
        return self


class LspSymbolObservationV1(StrictModel):
    server_id: str = Field(min_length=1)
    server_version: str = Field(min_length=1)
    symbol_name: str = Field(min_length=1)
    symbol_kind: str = Field(min_length=1)
    start_line: int = Field(ge=0)
    start_character_utf16: int = Field(ge=0)
    end_line: int = Field(ge=0)
    end_character_utf16: int = Field(ge=0)
    position_encoding: Literal["UTF16_CODE_UNITS"] = "UTF16_CODE_UNITS"
    status: Literal["OBSERVATION_ONLY"] = "OBSERVATION_ONLY"

    @model_validator(mode="after")
    def validate_range_order(self) -> "LspSymbolObservationV1":
        if (self.end_line, self.end_character_utf16) < (self.start_line, self.start_character_utf16):
            raise ValueError("LSP_RANGE_END_BEFORE_START")
        return self


class StructuralFunctionObservationV1(StrictModel):
    schema_id: Literal["atlas.corpus.structural-observation.v1"] = Field(
        default="atlas.corpus.structural-observation.v1",
        alias="schema",
        serialization_alias="schema",
    )
    source_ref: str = Field(min_length=1)
    file_path: str = Field(min_length=1)
    source_revision: str
    workspace_revision: str
    parser_language: str = Field(min_length=1)
    language_resolver_revision: str = Field(min_length=1)
    extractor_id: str = Field(min_length=1)
    extractor_version: str = Field(min_length=1)
    source_byte_length: int = Field(ge=0)
    start_byte: int = Field(ge=0)
    end_byte: int = Field(ge=0)
    symbol_name: str = Field(min_length=1)
    feature_binding: CanonicalFeatureBindingV1 | None = None
    lsp_observation: LspSymbolObservationV1 | None = None
    authority: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"

    @model_validator(mode="after")
    def validate_lineage_and_spans(self) -> "StructuralFunctionObservationV1":
        if self.source_ref != self.file_path:
            raise ValueError("FILE_PATH_MUST_EQUAL_SOURCE_REF")
        path_parts = self.source_ref.split("/")
        if re.match(r"^[a-zA-Z]:", self.source_ref) or self.source_ref.startswith("/") or "\\" in self.source_ref or any(part in {"", ".", ".."} for part in path_parts):
            raise ValueError("SOURCE_REF_MUST_BE_CANONICAL_REPOSITORY_RELATIVE_POSIX_PATH")
        if not SHA256_REVISION.fullmatch(self.source_revision):
            raise ValueError("SOURCE_REVISION_MUST_BE_SHA256")
        if not SHA256_REVISION.fullmatch(self.workspace_revision):
            raise ValueError("WORKSPACE_REVISION_MUST_BE_SHA256")
        if not self.start_byte < self.end_byte <= self.source_byte_length:
            raise ValueError("UTF8_BYTE_SPAN_OUT_OF_SOURCE_BOUNDS")
        return self
