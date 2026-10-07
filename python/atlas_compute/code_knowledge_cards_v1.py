"""Strict mirror of repo-local code-knowledge cards; no persistence or admission."""
from typing import Annotated, Literal, Union
from pydantic import BaseModel, ConfigDict, Field

class StrictCard(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

class Citation(StrictCard):
    source_ref: str = Field(min_length=1)
    source_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    workspace_revision: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")
    start_byte: int = Field(ge=0)
    end_byte: int = Field(ge=1)
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")

class Card(StrictCard):
    schema_version: Literal["atlas.code-knowledge-card.v1"]
    packet_key: str = Field(min_length=1)
    citation: Citation
    receipt_id: str | None
    predicate_id: str | None
    admitted: bool

class SymbolKnowledgeCardV1(Card):
    card_kind: Literal["symbol"]
    symbol_version_id: str = Field(min_length=1)
    language: str
    symbol_kind: str
    qualified_name: str
    signature: str | None

class ModuleKnowledgeCardV1(Card):
    card_kind: Literal["module"]
    module_path: str
    imports: list[str]
    exports: list[str]

class PackageKnowledgeCardV1(Card):
    card_kind: Literal["package"]
    package_name: str
    package_version: str | None
    declared_dependencies: list[str]

class LibraryNuanceCardV1(Card):
    card_kind: Literal["library_nuance"]
    library_name: str
    language: str
    constraint: str

class CitationKnowledgeCardV1(Card):
    card_kind: Literal["citation"]
    statement: str

CodeKnowledgeCardV1 = Annotated[
    Union[SymbolKnowledgeCardV1, ModuleKnowledgeCardV1, PackageKnowledgeCardV1,
          LibraryNuanceCardV1, CitationKnowledgeCardV1],
    Field(discriminator="card_kind"),
]
