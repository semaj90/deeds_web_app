"""DocCoordinateV1 -- version-qualified external-documentation identity.

Part of ``parent-atlas-versioned-doc-intelligence`` (DOC-02). A crawl of the
same URL under a different ``product_version`` must never collide with or
overwrite a prior crawl -- each combination is a distinct identity. This is
the direct fix for "CUDA 13.2 Tile IR support on sm_86" vs a 13.1- or
Hopper-only page silently answering the wrong question.

Pydantic (not a dataclass) per this proposal's "Pydantic first" direction --
matches the existing ``WebEvidenceRequestV1``/``WebEvidenceResponseV1``
convention in ``miniforge_nlp_sidecar_v2.py``, distinct from the plain
``@dataclass`` ``FetchResult``/``ChunkRecord`` in ``atlas_external_docs.py``
this module composes with.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Optional

from pydantic import BaseModel, Field, field_validator


def _sha(value: str) -> str:
    return sha256(value.encode("utf-8")).hexdigest()


def _stable_json(value: dict[str, object]) -> str:
    import json

    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class DocCoordinateV1(BaseModel):
    """Version-qualified identity for one crawled documentation page/section."""

    schema_: str = Field(default="atlas.doc-coordinate.v1", alias="schema")
    provider: str = Field(..., min_length=1, description='e.g. "nvidia", "postgresql", "sveltejs"')
    product: str = Field(..., min_length=1, description='e.g. "cuda-tile-ir", "postgresql", "sveltekit"')
    product_version: str = Field(..., min_length=1, description='e.g. "13.2", "18", "2"')
    architecture: Optional[str] = Field(default=None, description='e.g. "sm_86"; null for non-GPU docs')
    language: Optional[str] = Field(default=None, description='e.g. "python", "cpp", "sql", "typescript"')
    url: str = Field(..., min_length=8, max_length=4_096)
    section_anchor: Optional[str] = Field(default=None)
    content_hash: str = Field(..., min_length=8, description="sha256 of normalized extracted text")

    model_config = {"populate_by_name": True, "frozen": True}

    @field_validator("provider", "product", "product_version", "url", "content_hash")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @property
    def evidence_revision(self) -> str:
        """sha256 of the identity-bearing fields -- distinct crawls of the same URL under a
        different product_version always produce a distinct evidence_revision, never a collision.
        """
        payload = {
            "provider": self.provider,
            "product": self.product,
            "product_version": self.product_version,
            "url": self.url,
            "section_anchor": self.section_anchor,
            "content_hash": self.content_hash,
        }
        return f"sha256:{_sha(_stable_json(payload))}"

    def to_json_dict(self) -> dict[str, object]:
        data = self.model_dump(by_alias=True)
        data["evidence_revision"] = self.evidence_revision
        return data


def build_doc_coordinate(
    *,
    provider: str,
    product: str,
    product_version: str,
    url: str,
    content_hash: str,
    architecture: str | None = None,
    language: str | None = None,
    section_anchor: str | None = None,
) -> DocCoordinateV1:
    """Construct a DocCoordinateV1 from manifest-source fields + a fetched page's content hash."""

    return DocCoordinateV1(
        provider=provider,
        product=product,
        product_version=product_version,
        architecture=architecture,
        language=language,
        url=url,
        section_anchor=section_anchor,
        content_hash=content_hash,
    )
