"""Phase A: NES Taxonomy Inventory & Feature-Label Registry.

Provides the canonical categorical domain IDs (1..9), symbol kind IDs (1..16),
and the 64-bit hot feature taxonomy palette with bit assignments and structural rules.
"""

from __future__ import annotations

import hashlib
import struct
from typing import ClassVar, Literal
from pydantic import Field, model_validator

from .structural_observation_v1 import StrictModel

# Canonical Domain Mapping (1..9)
CANONICAL_DOMAIN_IDS: dict[str, int] = {
    "auth": 1,
    "ui": 2,
    "retrieval": 3,
    "network": 4,
    "database": 5,
    "cache": 6,
    "agent": 7,
    "graph": 8,
    "ml": 9,
}

DOMAIN_ID_TO_NAME: dict[int, str] = {v: k for k, v in CANONICAL_DOMAIN_IDS.items()}

# Canonical Symbol Kinds (1..16)
SYMBOL_KIND_IDS: dict[str, int] = {
    "unknown": 0,
    "function": 1,
    "class": 2,
    "component": 3,
    "interface": 4,
    "type_alias": 5,
    "variable": 6,
    "route_handler": 7,
    "database_schema": 8,
    "rpc_service": 9,
    "test_case": 10,
    "export_statement": 11,
    "import_statement": 12,
    "method": 13,
    "snippet": 14,
    "render_tag": 15,
}

SYMBOL_ID_TO_KIND: dict[int, str] = {v: k for k, v in SYMBOL_KIND_IDS.items()}

# 64-Hot-Feature Taxonomy Palette
HOT_FEATURE_BITS: dict[str, int] = {
    # Frontend / UI (bits 0..7)
    "svelte.runes.state": 0,
    "svelte.component.props": 1,
    "svelte.route.load": 2,
    "svelte.snippet": 3,
    "svelte.render": 4,
    "ui.html5.element": 5,
    "ui.bits_ui.primitive": 6,
    "ui.unocss.token": 7,
    # Backend / RPC / Network (bits 8..15)
    "api.request.validation": 8,
    "rpc.grpc.handler": 9,
    "http.rest.endpoint": 10,
    "auth.session.jwt": 11,
    "auth.oauth2.flow": 12,
    # Database / Storage (bits 16..23)
    "postgres.drizzle.query": 16,
    "postgres.transaction": 17,
    "postgres.bytea.bitset": 18,
    "db.migration.schema": 19,
    "seaweedfs.s3.storage": 20,
    # Retrieval / Vector / Search (bits 24..31)
    "search.bm25": 24,
    "search.vector.hnsw": 25,
    "vector.turbovec.2bit": 26,
    "vector.turbovec.4bit": 27,
    "vector.mrl128.prefix": 28,
    "vector.qdrant.projection": 29,
    # Graph / Topology (bits 32..39)
    "graph.pagerank": 32,
    "graph.reference.edge": 33,
    "graph.neo4j.traversal": 34,
    "topology.som.20x20": 35,
    "topology.kmeans.256": 36,
    # Cache / Distributed Memory (bits 40..47)
    "cache.valkey.lookup": 40,
    "cache.redis.residency": 41,
    "cache.bitfrost.rerank": 42,
    # GPU / Compute (bits 48..55)
    "gpu.cuda.kernel": 48,
    "gpu.cuvs.cagra": 49,
    "gpu.cuvs.knn": 50,
    "gpu.aten.tensor": 51,
    # Compiler / AST / Diagnostics (bits 56..63)
    "ast.treesitter.parse": 56,
    "ast.astgrep.pattern": 57,
    "agent.ace.prefill": 58,
    "test.contract.lineage": 59,
    "diagnostic.syntax.error": 60,
    "diagnostic.entity.unescaped": 61,
}

FEATURE_BIT_TO_NAME: dict[int, str] = {v: k for k, v in HOT_FEATURE_BITS.items()}


class AtlasFeatureRowV1(StrictModel):
    """Python representation of the packed 24-byte `AtlasFeatureRow`."""

    candidate_ordinal: int = Field(ge=0, le=0xFFFFFFFF)
    domain_id: int = Field(ge=0, le=0xFFFF)
    symbol_kind_id: int = Field(ge=0, le=0xFFFF)
    feature_mask_lo: int = Field(ge=0, le=0xFFFFFFFF)
    feature_mask_hi: int = Field(ge=0, le=0xFFFFFFFF)
    relation_offset: int = Field(ge=0, le=0xFFFFFFFF)
    relation_count: int = Field(ge=0, le=0xFFFF)
    diagnostic_flags: int = Field(ge=0, le=0xFFFF)

    ROW_STRUCT: ClassVar[struct.Struct] = struct.Struct("<IHHIIIHH")

    def to_bytes(self) -> bytes:
        """Packs into exactly 24 bytes, matching C++ `sizeof(AtlasFeatureRow)`."""
        return self.ROW_STRUCT.pack(
            self.candidate_ordinal,
            self.domain_id,
            self.symbol_kind_id,
            self.feature_mask_lo,
            self.feature_mask_hi,
            self.relation_offset,
            self.relation_count,
            self.diagnostic_flags,
        )

    @classmethod
    def from_bytes(cls, data: bytes) -> AtlasFeatureRowV1:
        if len(data) != 24:
            raise ValueError(f"AtlasFeatureRow requires 24 bytes, got {len(data)}")
        unpacked = cls.ROW_STRUCT.unpack(data)
        return cls(
            candidate_ordinal=unpacked[0],
            domain_id=unpacked[1],
            symbol_kind_id=unpacked[2],
            feature_mask_lo=unpacked[3],
            feature_mask_hi=unpacked[4],
            relation_offset=unpacked[5],
            relation_count=unpacked[6],
            diagnostic_flags=unpacked[7],
        )

    @property
    def feature_mask_64(self) -> int:
        return (self.feature_mask_hi << 32) | self.feature_mask_lo


def compute_feature_mask_from_labels(labels: Iterable[str]) -> tuple[int, int]:
    mask_64 = 0
    for label in labels:
        bit = HOT_FEATURE_BITS.get(label)
        if bit is not None and 0 <= bit < 64:
            mask_64 |= (1 << bit)
    return (mask_64 & 0xFFFFFFFF, (mask_64 >> 32) & 0xFFFFFFFF)
