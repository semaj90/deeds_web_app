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


# ---------------------------------------------------------------------------------------------------------------
# ExternalDocChunkEvidenceV1 -- CHUNK-grain evidence identity (EXTERNAL_DOC_CHUNK_EVIDENCE_IDENTITY_01).
#
# DocCoordinateV1 above is PAGE/VERSION identity and is carried UNCHANGED into every child chunk. A chunk's own
# identity is its exact UTF-8 span + bytes under that page revision, hashed with the repository's canonical encoder
# (a faithful port of sveltekit-frontend/src/lib/server/atlas/prefill/canonical-hash-v1.ts canonicalEncodeV1, so the
# TypeScript admission adapter recomputes the identical value). headingPath / sectionAnchor / parser / chunker /
# model revisions are deliberately NOT part of the identity: they are provenance/metadata.

import re
import struct
import unicodedata
from typing import Any

EXTERNAL_DOC_CHUNK_EVIDENCE_SCHEMA = "atlas.external-doc-chunk-evidence.v1"
_SIMPLE_KEY = re.compile(r"^[a-z][A-Za-z0-9]*$")


def external_doc_chunk_id_v2(*, source_id: str, chunk_evidence_revision: str) -> str:
    """Return a version-scoped chunk identity without changing the legacy V1 chunk-id scheme.

    V1 IDs are based on source id + document checksum + ordinal and therefore collide when
    identical bytes are admitted under two product versions. V2 binds the exact chunk evidence
    revision, which already includes the page/version revision, ordinal, UTF-8 span and chunk
    checksum. Callers must not switch an existing corpus to V2 implicitly; admission integration
    must explicitly select this contract and preserve existing V1 rows.
    """
    if not isinstance(source_id, str) or not source_id.strip():
        raise ValueError("DOC_CHUNK_ID_V2_SOURCE_ID_REQUIRED")
    if not isinstance(chunk_evidence_revision, str) or not re.fullmatch(r"sha256:[a-f0-9]{64}", chunk_evidence_revision):
        raise ValueError("DOC_CHUNK_ID_V2_EVIDENCE_REVISION_INVALID")
    digest = canonical_sha256_v1({
        "schema": "atlas.external-doc-chunk-identity.v2",
        "sourceId": source_id,
        "chunkEvidenceRevision": chunk_evidence_revision,
    })
    return f"doc:v2:{digest}"


def _length_prefixed(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value)
    return f"{len(normalized.encode('utf-8'))}:{normalized}"


def canonical_encode_v1(value: Any) -> str:
    """Port of canonicalEncodeV1 (ATLAS_CANONICAL_V1). Object keys must be plain lowerCamel ASCII so codepoint order
    equals the TypeScript ``localeCompare('en')`` order; anything else is rejected rather than risk a silent mismatch."""
    if value is None:
        return "n;"
    if isinstance(value, bool):
        return "b1;" if value else "b0;"
    if isinstance(value, str):
        return f"s{_length_prefixed(value)};"
    if isinstance(value, (int, float)):
        number = float(value)
        if number != number or number in (float("inf"), float("-inf")):
            raise TypeError("canonical encoding rejects NaN and Infinity")
        return f"f{struct.pack('>d', 0.0 if number == 0 else number).hex()};"
    if isinstance(value, (list, tuple)):
        return f"a{len(value)}[{''.join(canonical_encode_v1(item) for item in value)}]"
    if isinstance(value, dict):
        for key in value:
            if not isinstance(key, str) or not _SIMPLE_KEY.match(key):
                raise TypeError(f"canonical object key not supported by the Python port: {key!r}")
        keys = sorted(value)
        return f"o{len(keys)}{{{''.join(f'k{_length_prefixed(key)};{canonical_encode_v1(value[key])}' for key in keys)}}}"
    raise TypeError(f"canonical encoding does not support {type(value).__name__}")


def canonical_sha256_v1(value: Any) -> str:
    return sha256(canonical_encode_v1(value).encode("utf-8")).hexdigest()


def chunk_evidence_revision(*, page_evidence_revision: str, ordinal: int, start_byte: int, end_byte: int, chunk_checksum: str) -> str:
    """``sha256:<64 hex>`` (never truncated) over the chunk's identity inputs. Distinct spans/bytes/page revisions
    always differ; deterministic replay is identical; heading metadata and producer revisions do not participate."""
    if not page_evidence_revision:
        raise ValueError("CHUNK_EVIDENCE_REQUIRES_PAGE_EVIDENCE_REVISION")
    if end_byte <= start_byte or start_byte < 0:
        raise ValueError("CHUNK_EVIDENCE_INVALID_BYTE_SPAN")
    digest = canonical_sha256_v1({
        "schema": EXTERNAL_DOC_CHUNK_EVIDENCE_SCHEMA,
        "pageEvidenceRevision": page_evidence_revision,
        "ordinal": ordinal,
        "startByte": start_byte,
        "endByte": end_byte,
        "chunkChecksum": chunk_checksum,
    })
    return f"sha256:{digest}"


class ExternalDocChunkEvidenceV1(BaseModel):
    """Chunk-grain evidence identity. ``chunk_evidence_revision`` is derived, never supplied."""

    schema_: str = Field(default=EXTERNAL_DOC_CHUNK_EVIDENCE_SCHEMA, alias="schema")
    page_evidence_revision: str = Field(..., min_length=8)
    ordinal: int = Field(..., ge=0)
    start_byte: int = Field(..., ge=0)
    end_byte: int = Field(..., gt=0)
    chunk_checksum: str = Field(..., pattern=r"^[a-f0-9]{64}$")

    model_config = {"populate_by_name": True, "frozen": True}

    @property
    def chunk_evidence_revision(self) -> str:
        return chunk_evidence_revision(
            page_evidence_revision=self.page_evidence_revision, ordinal=self.ordinal,
            start_byte=self.start_byte, end_byte=self.end_byte, chunk_checksum=self.chunk_checksum,
        )
