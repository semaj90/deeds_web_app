"""DOC-09: design.md's DomainClassificationV1 (`kind: 'ExternalDocumentation'`)
envelope for external documentation chunks (parent-atlas-versioned-doc-intelligence).

Reuses, does not duplicate, existing classification machinery:
``atlas_external_docs.classify_domain``/``classify_ontology`` (rule-based label
extraction) and ``parent_atlas_ontology.domain_mapping.admit_domain_classification``
(the existing okf classifies-does-not-own admission boundary). This module only
adds the richer envelope shape design.md specifies -- provider/product/version/
architecture/language pulled from DocCoordinateV1, plus retrieval-facing tags --
around what those two already-tested modules produce.

``capabilities`` is deliberately populated from the chunk's own already-extracted
``api_signatures`` (DOC-05), not a hand-curated keyword list: design.md's governing
principle is "extract deterministic structure first, enrich semantically second,"
and api_signatures IS that deterministic structure -- inventing a second,
speculative capability taxonomy here would be exactly what that principle warns
against.

``canonicalAuthority`` is a hard invariant, never anything but ``False`` -- okf
classifies, Postgres (DOC-06/DOC-06A) is the evidence owner.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from atlas_external_docs import ChunkRecord
from parent_atlas_ontology.domain_mapping import admit_domain_classification

Json = dict[str, Any]


class DomainClassificationMetadataV1(BaseModel):
    domain: str
    provider: str = ""
    product: str = ""
    version: str = ""
    capabilities: tuple[str, ...] = Field(default_factory=tuple)
    architectures: tuple[str, ...] = Field(default_factory=tuple)
    languages: tuple[str, ...] = Field(default_factory=tuple)
    retrieval_tags: tuple[str, ...] = Field(default_factory=tuple, alias="retrievalTags")

    model_config = {"frozen": True, "extra": "forbid", "populate_by_name": True}


class DomainClassificationV1(BaseModel):
    """design.md's DomainClassificationV1, ``kind: 'ExternalDocumentation'``."""

    schema_: str = Field(default="atlas.domain-classification.v1", alias="schema")
    kind: str = Field(default="ExternalDocumentation")
    metadata: DomainClassificationMetadataV1
    primary: str
    subdomain: str = ""
    confidence: float = Field(..., ge=0.0, le=1.0)
    evidence_refs: tuple[str, ...] = Field(..., min_length=1, alias="evidenceRefs")
    producer_revision: str = Field(..., min_length=1, alias="producerRevision")
    canonical_authority: bool = Field(default=False, alias="canonicalAuthority")

    model_config = {"frozen": True, "extra": "forbid", "populate_by_name": True}

    def to_json_dict(self) -> Json:
        return self.model_dump(by_alias=True)


def classify_external_doc_domain(
    chunk: ChunkRecord,
    *,
    producer_revision: str,
) -> DomainClassificationV1:
    """Build design.md's DomainClassificationV1 envelope for one chunk.

    Deterministic only: domain/ontology labels come from the existing
    classify_domain()/classify_ontology() rule engines (already run inside
    chunk_document() -- reused here from the chunk's own fields, not
    re-derived), provider/product/version/architecture/language come from the
    chunk's own DocCoordinateV1 (DOC-02) when present, capabilities come from
    the chunk's own already-extracted api_signatures (DOC-05). Nothing here
    is LLM-derived.
    """

    admission = admit_domain_classification(chunk.domain_class, confidence=1.0)
    coordinate = chunk.doc_coordinate

    metadata = DomainClassificationMetadataV1(
        domain=chunk.domain_class,
        provider=coordinate.provider if coordinate is not None else "",
        product=coordinate.product if coordinate is not None else "",
        version=coordinate.product_version if coordinate is not None else "",
        capabilities=tuple(chunk.api_signatures),
        architectures=(coordinate.architecture,) if coordinate is not None and coordinate.architecture else (),
        languages=(coordinate.language,) if coordinate is not None and coordinate.language else (),
        retrievalTags=tuple(chunk.ontology_classes),
    )

    # confidence: 1.0 when admit_domain_classification() actually admits the
    # label against the (now DOC-09-extended) mapping table; 0.5 when it
    # doesn't (UNMAPPED/AMBIGUOUS/BELOW_CONFIDENCE). Grounded in the real
    # admission result -- not a bare "isn't the fallback label" heuristic --
    # so this directly exercises whatever labels this task's own mapping-table
    # extension added or missed.
    confidence = 1.0 if admission.status == "ADMITTED" else 0.5

    return DomainClassificationV1(
        metadata=metadata,
        primary=chunk.domain_class,
        subdomain=chunk.ontology_classes[0] if chunk.ontology_classes else "",
        confidence=confidence,
        evidenceRefs=(chunk.chunk_id,),
        producerRevision=producer_revision,
        canonicalAuthority=False,
    )
