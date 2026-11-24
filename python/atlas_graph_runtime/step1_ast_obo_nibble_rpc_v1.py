"""Step 1 AST-grep / Tree-sitter / rg + OBO Taxonomy -> Nibble Bitset + Mode-7 + ARPC RPC adapter.

Bridges structural/lexical codebase extractions (Tree-sitter, ast-grep, rg line hits,
Svelte 5 runes) into:
  1. OBO-mapped taxonomy tuples (`atlas-domain-and-language-terms-v1.obo` via
     `okf_language_lsp_term_expander_v1.py`) with `canonical_authority = False`.
  2. A baked key-value index dictionary (`kv_index`) mapping `(domain, lang, kind)` -> ordinal.
  3. Nibble-aware 4-bit INT4 packed feature bytes (`low | (high << 4)`) + `lsb0` bitmask
     matching PG18 `get_bit(bytes, i)` and `THV1`.
  4. Mode-7 2D affine coordinates + NES LOD tier assignment (`LOD_1_5` / `LOD_6_14` / `LOD_15_20`).
  5. `ARPC` MsgPack/zlib BYTEA envelope (`duckdb_bytea_rpc_packet_v1.py`) + frozen Arrow IPC
     batch (`pg18_arrow_ipc_roundtrip_v1.py`).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any, Mapping, Sequence

from python.atlas_external_doc_hypergraph_v2 import project_mode7_affine_v2
from python.atlas_graph_runtime.duckdb_bytea_rpc_packet_v1 import (
    decode_rpc_packet_v1,
    encode_rpc_packet_v1,
)
from python.atlas_graph_runtime.okf_language_lsp_term_expander_v1 import (
    detect_file_extension_language_v1,
    load_okf_language_profiles_v1,
)
from python.atlas_graph_runtime.pg18_arrow_ipc_roundtrip_v1 import (
    FrozenFeatureBatchBundleV1,
    build_frozen_feature_batch_ipc_v1,
    build_lsb0_bitmask_bytes_v1,
)


@dataclass(frozen=True)
class Step1BakedBundleV1:
    schema: str
    workspace_revision: str
    kv_index: dict[str, int]
    nibble_bytes: bytes
    bitmask_bytes: bytes
    lod_tiers: tuple[str, ...]
    mode7_world_coords: tuple[tuple[float, float], ...]
    arpc_packet_bytes: bytes
    arrow_bundle: FrozenFeatureBatchBundleV1
    canonical_authority: bool = False
    writes_performed: bool = False


def pack_nibbles_v1(values_0_to_15: Sequence[int]) -> bytes:
    """Pack pairs of 4-bit integers (0..15) into bytes: low nibble = even idx, high nibble = odd idx."""
    out = bytearray((len(values_0_to_15) + 1) // 2)
    for idx, val in enumerate(values_0_to_15):
        if val < 0 or val > 15:
            raise ValueError(f"NIBBLE_OUT_OF_RANGE:{val}")
        if (idx & 1) == 0:
            out[idx >> 1] |= val & 0x0F
        else:
            out[idx >> 1] |= (val & 0x0F) << 4
    return bytes(out)


def unpack_nibbles_v1(packed: bytes, count: int) -> list[int]:
    """Unpack `count` 4-bit nibbles from packed bytes."""
    if count < 0 or len(packed) < (count + 1) // 2:
        raise ValueError("NIBBLE_BUFFER_UNDERSIZED")
    out: list[int] = []
    for idx in range(count):
        b = packed[idx >> 1]
        out.append((b & 0x0F) if (idx & 1) == 0 else ((b >> 4) & 0x0F))
    return out


def assign_nes_lod_tier_v1(score: float) -> str:
    """Map normalized relevance score [0, 1] to NES LOD tier group."""
    if score >= 0.75:
        return "LOD_1_5"
    if score >= 0.40:
        return "LOD_6_14"
    return "LOD_15_20"


def build_step1_obo_nibble_rpc_bundle_v1(
    *,
    extractions: Sequence[Mapping[str, Any]],
    workspace_revision: str,
    mode7_affine: Sequence[float] = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0),
    compression: str = "zlib",
) -> Step1BakedBundleV1:
    """Bake AST-grep/Tree-sitter/rg extractions + OBO terms into nibble/bitmask/Mode-7/ARPC/Arrow."""
    if not workspace_revision.strip():
        raise ValueError("WORKSPACE_REVISION_REQUIRED")
    if not extractions:
        raise ValueError("STEP1_EXTRACTIONS_EMPTY")

    profiles = load_okf_language_profiles_v1()
    kv_index: dict[str, int] = {}
    nibbles: list[int] = []
    active_ordinals: list[int] = []
    lod_tiers: list[str] = []
    mode7_coords: list[tuple[float, float]] = []
    arrow_rows: list[dict[str, Any]] = []
    baked_tuples: list[dict[str, Any]] = []

    for ordinal, rec in enumerate(extractions):
        source_ref = str(rec.get("source_ref") or "").strip()
        symbol_name = str(rec.get("symbol_name") or "").strip()
        symbol_kind = str(rec.get("symbol_kind") or "symbol").strip()
        domain_id = str(rec.get("domain_id") or "ATLASDOM:general").strip()
        source_bytes = rec.get("source_bytes")
        start_byte = int(rec.get("start_byte", 0))
        end_byte = int(rec.get("end_byte", 0))
        score = max(0.0, min(1.0, float(rec.get("score", 0.5))))

        if not source_ref or not symbol_name:
            raise ValueError(f"STEP1_IDENTITY_MISSING:ordinal={ordinal}")
        if isinstance(source_bytes, (bytes, bytearray)):
            if start_byte < 0 or end_byte <= start_byte or end_byte > len(source_bytes):
                raise ValueError(f"STEP1_UTF8_SPAN_INVALID:ordinal={ordinal}")
            # Verify strict UTF-8 boundary
            source_bytes[start_byte:end_byte].decode("utf-8", errors="strict")

        lang_info = detect_file_extension_language_v1(source_ref, profiles)
        lang_id = f"ATLASLANG:{lang_info.get('language') or 'unknown'}"
        kv_key = f"{domain_id}|{lang_id}|{symbol_kind}"
        if kv_key not in kv_index:
            kv_index[kv_key] = len(kv_index)

        # Quantize score [0, 1] -> 4-bit nibble [0..15]
        nibbles.append(min(15, max(0, int(round(score * 15.0)))))
        if bool(rec.get("active", True)):
            active_ordinals.append(ordinal)

        lod_tier = assign_nes_lod_tier_v1(score)
        lod_tiers.append(lod_tier)

        u = float(rec.get("tile_u", ordinal % 16))
        v = float(rec.get("tile_v", ordinal // 16))
        wx, wy = project_mode7_affine_v2(mode7_affine, u, v)
        mode7_coords.append((wx, wy))

        candidate_uuid = str(
            rec.get("candidate_uuid")
            or hashlib.sha256(f"{source_ref}:{symbol_name}:{start_byte}:{end_byte}".encode("utf-8")).hexdigest()[:32]
        )
        arrow_rows.append(
            {
                "candidate_uuid": candidate_uuid,
                "source_revision": str(rec.get("source_revision") or workspace_revision),
                "task_id": str(rec.get("task_id") or f"step1:{ordinal}"),
                "presence_mask": (1 << (kv_index[kv_key] % 63)),
                "feature_score": score,
                "embedding": list(rec.get("embedding") or (wx, wy, score, float(kv_index[kv_key]))),
            }
        )
        baked_tuples.append(
            {
                "ordinal": ordinal,
                "kv_id": kv_index[kv_key],
                "source_ref": source_ref,
                "symbol_name": symbol_name,
                "lang_id": lang_id,
                "domain_id": domain_id,
                "lod_tier": lod_tier,
                "mode7_xy": [wx, wy],
                "admission_state": "PROPOSAL_ONLY",
            }
        )

    nibble_bytes = pack_nibbles_v1(nibbles)
    bitmask_bytes = build_lsb0_bitmask_bytes_v1(active_ordinals, len(extractions))
    arrow_bundle = build_frozen_feature_batch_ipc_v1(
        rows=arrow_rows,
        workspace_revision=workspace_revision,
        active_ordinals=active_ordinals,
    )

    arpc_packet_bytes = encode_rpc_packet_v1(
        {
            "schema": "atlas.step1-obo-nibble-rpc.v1",
            "workspace_revision": workspace_revision,
            "snapshot_checksum": arrow_bundle.snapshot_checksum,
            "kv_index": kv_index,
            "nibble_hex": nibble_bytes.hex(),
            "bitmask_hex": bitmask_bytes.hex(),
            "tuples": baked_tuples,
            "canonical_authority": False,
        },
        compression=compression,
    )

    return Step1BakedBundleV1(
        schema="atlas.step1-obo-nibble-rpc.v1",
        workspace_revision=workspace_revision,
        kv_index=kv_index,
        nibble_bytes=nibble_bytes,
        bitmask_bytes=bitmask_bytes,
        lod_tiers=tuple(lod_tiers),
        mode7_world_coords=tuple(mode7_coords),
        arpc_packet_bytes=arpc_packet_bytes,
        arrow_bundle=arrow_bundle,
    )
