"""Phase B: Deterministic Bitencoded Directory Feature Tile Builder.

Produces bounded GPU-resident search tiles with separate numeric matrices,
compact 24-byte categorical feature rows, and CandidateOrdinal maps.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path
from typing import Any, Iterable, Literal
from pydantic import Field, model_validator

from .nes_taxonomy_registry import (
    AtlasFeatureRowV1,
    CANONICAL_DOMAIN_IDS,
    SYMBOL_KIND_IDS,
    compute_feature_mask_from_labels,
)
from .structural_observation_v1 import StrictModel

FEATURE_TILE_DEFAULT_BATCH_SIZE = 4096
FEATURE_TILE_NUMERIC_DIM = 64


class AtlasGpuFeatureTileV1(StrictModel):
    """Proposal-only envelope describing a bounded GPU feature tile."""

    schema_id: Literal["atlas.gpu.feature-tile.v1"] = Field(
        default="atlas.gpu.feature-tile.v1", alias="schema", serialization_alias="schema"
    )
    snapshot_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    taxonomy_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    feature_recipe_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")

    row_count: int = Field(ge=1, le=65536)
    feature_dimension: int = Field(default=64, ge=1, le=1024)

    numeric_artifact_ref: str = Field(min_length=1)
    categorical_artifact_ref: str = Field(min_length=1)
    ordinal_map_artifact_ref: str = Field(min_length=1)

    numeric_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    categorical_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    ordinal_map_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")

    identity_authority: Literal[False] = False
    status: Literal["PROPOSAL_ONLY"] = "PROPOSAL_ONLY"


class FeatureCandidateInputV1(StrictModel):
    """Source input item before tile assembly."""

    source_ref: str = Field(min_length=1)
    symbol_name: str = Field(min_length=1)
    domain_name: str = Field(min_length=1)
    symbol_kind: str = Field(min_length=1)
    feature_labels: list[str] = Field(default_factory=list)
    numeric_features_64: list[float] = Field(min_length=64, max_length=64)
    relation_offset: int = 0
    relation_count: int = 0
    diagnostic_flags: int = 0


def assemble_gpu_feature_tile(
    candidates: list[FeatureCandidateInputV1],
    *,
    snapshot_revision: str,
    taxonomy_revision: str,
    feature_recipe_revision: str,
    output_dir: Path | str,
    tile_name_prefix: str = "tile_0001",
) -> tuple[AtlasGpuFeatureTileV1, bytes, bytes, str]:
    """Assembles a bounded feature tile into:
    1. `categorical.bin`: N * 24 bytes of packed AtlasFeatureRow
    2. `numeric.bin`: N * 64 * 4 bytes of IEEE-754 float32
    3. `ordinal_map.json`: maps ordinal -> source_ref, symbol_name
    Returns the tile descriptor envelope and in-memory buffers.
    """
    row_count = len(candidates)
    if row_count == 0:
        raise ValueError("Cannot assemble feature tile with 0 candidates")

    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    categorical_buf = bytearray()
    numeric_buf = bytearray()
    ordinal_map_entries = []

    for ordinal, c in enumerate(candidates):
        domain_id = CANONICAL_DOMAIN_IDS.get(c.domain_name, 0)
        symbol_kind_id = SYMBOL_KIND_IDS.get(c.symbol_kind, 0)
        mask_lo, mask_hi = compute_feature_mask_from_labels(c.feature_labels)

        row = AtlasFeatureRowV1(
            candidate_ordinal=ordinal,
            domain_id=domain_id,
            symbol_kind_id=symbol_kind_id,
            feature_mask_lo=mask_lo,
            feature_mask_hi=mask_hi,
            relation_offset=c.relation_offset,
            relation_count=c.relation_count,
            diagnostic_flags=c.diagnostic_flags,
        )
        categorical_buf.extend(row.to_bytes())

        # Pack 64 numeric floats (little endian)
        for val in c.numeric_features_64:
            numeric_buf.extend(struct.pack("<f", val))

        ordinal_map_entries.append({
            "ordinal": ordinal,
            "source_ref": c.source_ref,
            "symbol_name": c.symbol_name,
            "domain": c.domain_name,
        })

    categorical_bytes = bytes(categorical_buf)
    numeric_bytes = bytes(numeric_buf)
    ordinal_map_str = json.dumps({
        "schema": "atlas.gpu.ordinal-map.v1",
        "snapshotRevision": snapshot_revision,
        "rowCount": row_count,
        "entries": ordinal_map_entries,
    }, indent=2, sort_keys=True)

    cat_digest = f"sha256:{hashlib.sha256(categorical_bytes).hexdigest()}"
    num_digest = f"sha256:{hashlib.sha256(numeric_bytes).hexdigest()}"
    ord_digest = f"sha256:{hashlib.sha256(ordinal_map_str.encode('utf-8')).hexdigest()}"

    cat_file = out_path / f"{tile_name_prefix}_categorical_24b.bin"
    num_file = out_path / f"{tile_name_prefix}_numeric_64f.bin"
    ord_file = out_path / f"{tile_name_prefix}_ordinal_map.json"

    cat_file.write_bytes(categorical_bytes)
    num_file.write_bytes(numeric_bytes)
    ord_file.write_text(ordinal_map_str, encoding="utf-8")

    envelope = AtlasGpuFeatureTileV1(
        snapshot_revision=snapshot_revision,
        taxonomy_revision=taxonomy_revision,
        feature_recipe_revision=feature_recipe_revision,
        row_count=row_count,
        feature_dimension=FEATURE_TILE_NUMERIC_DIM,
        numeric_artifact_ref=str(num_file).replace("\\", "/"),
        categorical_artifact_ref=str(cat_file).replace("\\", "/"),
        ordinal_map_artifact_ref=str(ord_file).replace("\\", "/"),
        numeric_digest=num_digest,
        categorical_digest=cat_digest,
        ordinal_map_digest=ord_digest,
        identity_authority=False,
        status="PROPOSAL_ONLY",
    )

    return envelope, categorical_bytes, numeric_bytes, ordinal_map_str
