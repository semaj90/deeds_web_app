from __future__ import annotations

import hashlib
import json
import struct
import sys
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
NATIVE_BUILD_DIR = REPO_ROOT / "python" / "atlas_corpus_lib" / "atlas_corpus_lib"


def load_native_module() -> Any:
    build_str = str(NATIVE_BUILD_DIR)
    if build_str not in sys.path:
        sys.path.insert(0, build_str)
    import _atlas_native_core as native_mod  # type: ignore[import-not-found]

    return native_mod


NES_FSM_BINARY_SCHEMA_REVISION_V1 = "atlas.nes-fsm-binary-descriptor.v1"
NES_FSM_MAGIC_LE = 0x4E455331
NES_FSM_ENDIAN_TAG_LE = 0x01020304
NES_FSM_ENDIAN_TAG_BE = 0x04030201
HEADER_BYTES = 64
RECORD_BYTES = 16
ALIGN_BYTES = 64
MAX_NATIVE_RADIX_ROWS_V1 = 65_536
VALID_DOMAIN_MASK = 1023

FROZEN_SOURCE_REVISION_V1 = "fixture:parent-atlas-nes-fsm-native-runtime-v1:source"
FROZEN_WORKSPACE_REVISION_V1 = "fixture:parent-atlas-nes-fsm-native-runtime-v1:workspace"
FROZEN_GRAPH_REVISION_V1 = "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce"
FROZEN_EDGE_POLICY_REVISION_V1 = "atlas.edge-policy.v1"

CANONICAL_PALETTE_BRIDGE: dict[int, tuple[str, int]] = {
    1: ("0x16", 0x16),
    2: ("0x2a", 0x2A),
    3: ("0x21", 0x21),
    4: ("0x2c", 0x2C),
    5: ("0x12", 0x12),
    6: ("0x27", 0x27),
    7: ("0x24", 0x24),
    8: ("0x1a", 0x1A),
    9: ("0x14", 0x14),
    10: ("0x0f", 0x0F),
}

HEADER_PREFIX_FMT = "<IIHHBBHIBBBB"  # 24 bytes (offsets 0..23)
RECORD_FMT = "<IHHHHBBH"  # 16 bytes
INPUT_RECORD_FMT = "<IHHHBBHH"  # 16 bytes


@dataclass(frozen=True)
class FrozenCandidateInput:
    candidate_ordinal: int
    kmeans_cluster_id: int
    som_bmu_id: int
    primary_lut_byte: int
    domain_bitmask: int
    feature_label: str
    source_ref: str
    token_count: int = 128


FROZEN_BATCH: tuple[FrozenCandidateInput, ...] = (
    FrozenCandidateInput(142, 2, 17, 10, 0x0202, "canvas", "src/lib/server/atlas/fsm/nes-feature-fsm.ts"),
    FrozenCandidateInput(108, 1, 6, 2, 0x0002, "search_rag", "src/lib/server/search/qdrant-search.ts"),
    FrozenCandidateInput(115, 2, 7, 1, 0x0001, "auth", "src/lib/server/lucia.ts"),
    FrozenCandidateInput(101, 0, 12, 6, 0x0022, "cases", "src/lib/server/db/client.ts"),
    FrozenCandidateInput(130, 3, 42, 9, 0x0104, "ai_chat", "src/lib/server/atlas/fsm/nes-feature-token-pipeline.ts"),
    FrozenCandidateInput(121, 1, 6, 10, 0x0200, "canvas", "src/lib/server/atlas/rendering/nes-glyph-canvas-renderer-v1.ts"),
    FrozenCandidateInput(104, 0, 3, 2, 0x0006, "search_rag", "src/lib/server/retrieval/orchestrator.ts"),
    FrozenCandidateInput(155, 3, 88, 8, 0x0080, "reconstruction_sim", "src/lib/gpu/nes-glyph-webgpu.ts"),
    FrozenCandidateInput(111, 1, 19, 5, 0x0010, "upload_ingest", "src/lib/server/seaweed-client.ts"),
    FrozenCandidateInput(127, 2, 7, 3, 0x0024, "evidence", "src/lib/server/atlas/cache/bitfrost-token-fsm-v1.ts"),
    FrozenCandidateInput(136, 3, 15, 7, 0x0040, "code_intel", "src/lib/server/atlas/taxonomy/task-domain-lut-reconciliation-v1.ts"),
    FrozenCandidateInput(102, 0, 3, 1, 0x0003, "auth", "src/lib/server/atlas/orchestration/task-execution-lifecycle-fsm-v1.ts"),
    FrozenCandidateInput(148, 2, 210, 4, 0x0008, "knowledge_graph", "src/lib/server/atlas/graph/csr-traversal-cursor.ts"),
    FrozenCandidateInput(119, 1, 14, 6, 0x0020, "cases", "src/lib/server/atlas/kanban-task-board.ts"),
    FrozenCandidateInput(109, 0, 12, 2, 0x000A, "wiki", "src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts"),
    FrozenCandidateInput(124, 2, 7, 10, 0x0202, "admin_ops", "src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts"),
)


class DoubleBufferDescriptorSlot:
    def __init__(self) -> None:
        self.active_buffer: bytes | None = None
        self.active_checksum: str | None = None
        self.active_revision: str | None = None
        self.swap_count = 0

    def commit_validated_scratch(self, scratch: bytes, checksum: str, source_revision: str) -> None:
        self.active_buffer = bytes(scratch)
        self.active_checksum = checksum
        self.active_revision = source_revision
        self.swap_count += 1


def sha256_hex(data: bytes | str) -> str:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    return hashlib.sha256(raw).hexdigest()


def nes_pixel(chr_bytes: bytes, tile: int, x: int, y: int) -> int:
    if len(chr_bytes) == 8:
        raise ValueError("CHR_FORMAT_VIOLATION: expected 16-byte 2bpp CHR pixel tile, got 8-byte NESCHROM97 metadata")
    if len(chr_bytes) < 16 or len(chr_bytes) % 16 != 0:
        raise ValueError(f"CHR_TILE_BUFFER_INVALID_LENGTH: {len(chr_bytes)}")
    if not (0 <= x <= 7 and 0 <= y <= 7):
        raise ValueError("CHR_PIXEL_COORD_OUT_OF_RANGE")
    base = tile * 16
    if base + 16 > len(chr_bytes):
        raise ValueError("CHR_TILE_INDEX_OUT_OF_RANGE")
    bit = 7 - x
    low = (chr_bytes[base + y] >> bit) & 1
    high = (chr_bytes[base + 8 + y] >> bit) & 1
    return low | (high << 1)


def compute_ordinal_map_checksum(records: tuple[FrozenCandidateInput, ...], source_revision: str) -> str:
    canonical = "".join(
        f"{idx}|{rec.candidate_ordinal}|{rec.source_ref}|{source_revision}\n"
        for idx, rec in enumerate(records)
    )
    return sha256_hex(canonical)


def serialize_input_buffer_le(records: tuple[FrozenCandidateInput, ...]) -> bytes:
    chunks = [
        struct.pack(
            INPUT_RECORD_FMT,
            rec.candidate_ordinal,
            rec.kmeans_cluster_id,
            rec.som_bmu_id,
            rec.domain_bitmask,
            rec.primary_lut_byte,
            0,
            rec.token_count,
            0,
        )
        for rec in records
    ]
    raw = b"".join(chunks)
    aligned_len = (len(raw) + 63) & ~63
    return raw.ljust(aligned_len, b"\x00")


def verify_descriptor_readback(
    buf: bytes,
    expected_source_revision: str,
    expected_ordinal_map_checksum: str,
    expected_csr_checksum: str,
) -> dict[str, Any]:
    if len(buf) < HEADER_BYTES or (len(buf) % ALIGN_BYTES) != 0:
        raise ValueError("BINARY_DESCRIPTOR_ALIGNMENT_INVALID")

    (
        magic_le,
        endian_tag_le,
        schema_version,
        count,
        primary_lut_byte,
        nes_palette_byte,
        domain_bitmask,
        policy_auth_mask,
        from_state_code,
        to_state_code,
        authority_flags_byte,
        csr_total_visited,
    ) = struct.unpack_from(HEADER_PREFIX_FMT, buf, 0)

    if endian_tag_le == NES_FSM_ENDIAN_TAG_BE or magic_le == 0x3153454E:
        raise ValueError("BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH: expected little-endian (0x01020304)")
    if endian_tag_le != NES_FSM_ENDIAN_TAG_LE or magic_le != NES_FSM_MAGIC_LE:
        raise ValueError("BINARY_DESCRIPTOR_MAGIC_OR_ENDIAN_INVALID")
    if schema_version != 1:
        raise ValueError("BINARY_DESCRIPTOR_SCHEMA_VERSION_UNSUPPORTED")
    if count == 0 or count > 256:
        raise ValueError("BINARY_DESCRIPTOR_COUNT_OUT_OF_RANGE")
    required_len = HEADER_BYTES + count * RECORD_BYTES
    if len(buf) < required_len:
        raise ValueError("BINARY_DESCRIPTOR_TRUNCATED")
    if authority_flags_byte != 0:
        raise ValueError("BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS")
    if domain_bitmask == 0 or (domain_bitmask & ~VALID_DOMAIN_MASK) != 0:
        raise ValueError("INVALID_DOMAIN_BITMASK")
    if primary_lut_byte not in CANONICAL_PALETTE_BRIDGE:
        raise ValueError("PRIMARY_LUT_INVALID")

    if buf[24:32] != hashlib.sha256(expected_source_revision.encode("utf-8")).digest()[:8]:
        raise ValueError("BINARY_DESCRIPTOR_STALE_SOURCE_REVISION")
    if buf[32:40] != bytes.fromhex(expected_ordinal_map_checksum)[:8]:
        raise ValueError("BINARY_DESCRIPTOR_ORDINAL_MAP_CHECKSUM_MISMATCH")
    if buf[40:48] != bytes.fromhex(expected_csr_checksum)[:8]:
        raise ValueError("BINARY_DESCRIPTOR_CSR_CURSOR_CHECKSUM_MISMATCH")

    payload = buf[HEADER_BYTES:required_len]
    if buf[48:64] != hashlib.sha256(payload).digest()[:16]:
        raise ValueError("BINARY_DESCRIPTOR_PAYLOAD_CHECKSUM_MISMATCH")

    seen_ordinals: set[int] = set()
    prev_key = -1
    for i in range(count):
        ordinal, cluster, som_cell, _src_idx, rec_mask, rec_lut, _bf, _tok = struct.unpack_from(
            RECORD_FMT, buf, HEADER_BYTES + i * RECORD_BYTES
        )
        if ordinal in seen_ordinals:
            raise ValueError(f"BINARY_DESCRIPTOR_DUPLICATE_ORDINAL: {ordinal}")
        seen_ordinals.add(ordinal)
        if som_cell >= 400:
            raise ValueError("BINARY_DESCRIPTOR_SOM_CELL_OUT_OF_RANGE")
        if rec_mask == 0 or (rec_mask & ~VALID_DOMAIN_MASK) != 0 or rec_lut < 1 or rec_lut > 10 or not (rec_mask & (1 << (rec_lut - 1))):
            raise ValueError(f"BINARY_DESCRIPTOR_RECORD_MASK_INVALID at {i}")
        composite_key = (cluster << 48) | (som_cell << 32) | ordinal
        if composite_key <= prev_key:
            raise ValueError(f"BINARY_DESCRIPTOR_NOT_RADIX_SORTED at {i}")
        prev_key = composite_key

    return {
        "schema": NES_FSM_BINARY_SCHEMA_REVISION_V1,
        "count": count,
        "primary_lut_byte": primary_lut_byte,
        "nes_palette_byte": nes_palette_byte,
        "policy_auth_mask": policy_auth_mask,
        "from_state_code": from_state_code,
        "to_state_code": to_state_code,
        "csr_total_visited": csr_total_visited,
    }


def run_python_nes_fsm_runtime(
    records: tuple[FrozenCandidateInput, ...] = FROZEN_BATCH,
    expected_source_revision: str = FROZEN_SOURCE_REVISION_V1,
    batch_source_revision: str = FROZEN_SOURCE_REVISION_V1,
    grant: dict[str, Any] | None = None,
    csr_graph_revision: str = FROZEN_GRAPH_REVISION_V1,
    cancel_event: threading.Event | None = None,
    buffer_slot: DoubleBufferDescriptorSlot | None = None,
    token_budget: int = 1536,
) -> dict[str, Any]:
    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("NES_FSM_RUNTIME_CANCELLED")
    if batch_source_revision != expected_source_revision:
        raise ValueError(f"FSM_REVISION_MISMATCH: expected {expected_source_revision}, got {batch_source_revision}")
    if csr_graph_revision != FROZEN_GRAPH_REVISION_V1:
        raise ValueError("CSR_CURSOR_GRAPH_REVISION_MISMATCH")

    active_grant = grant or {
        "grantKind": "EXPLICIT_POLICY_GRANT",
        "actor": "system:cpu-vertical-slice-verifier",
        "taskId": "PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01",
        "sourceRevision": FROZEN_SOURCE_REVISION_V1,
        "grantedPolicyMask": 0x000F,
        "requiredPolicyMask": 0x0007,
        "inputsPresent": True,
        "unresolvedDependencies": [],
    }
    if "nesHex" in active_grant or "domainBitmask" in active_grant:
        raise ValueError("NON_AUTHORIZING_FIELD_PASSED_AS_POLICY_GRANT")
    if active_grant.get("sourceRevision") != expected_source_revision:
        raise ValueError("FSM_REVISION_MISMATCH")
    if (int(active_grant["grantedPolicyMask"]) & int(active_grant["requiredPolicyMask"])) != int(
        active_grant["requiredPolicyMask"]
    ):
        raise PermissionError("POLICY_AUTHORIZATION_DENIED")

    seen_ord: set[int] = set()
    for rec in records:
        if rec.candidate_ordinal in seen_ord:
            raise ValueError(f"SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE: {rec.candidate_ordinal}")
        seen_ord.add(rec.candidate_ordinal)
        if rec.domain_bitmask <= 0 or (rec.domain_bitmask & ~VALID_DOMAIN_MASK) != 0:
            raise ValueError(f"INVALID_DOMAIN_BITMASK: 0x{rec.domain_bitmask:x}")
        if rec.primary_lut_byte not in CANONICAL_PALETTE_BRIDGE or not (
            rec.domain_bitmask & (1 << (rec.primary_lut_byte - 1))
        ):
            raise ValueError("PRIMARY_LUT_NOT_IN_DOMAIN_BITMASK")

    native = load_native_module()
    ordinal_map_checksum = compute_ordinal_map_checksum(records, batch_source_revision)
    input_buffer_checksum = sha256_hex(serialize_input_buffer_le(records))

    sorted_indices = native.radix_sort_som_candidate_indices(
        [r.kmeans_cluster_id for r in records],
        [r.som_bmu_id for r in records],
        [r.candidate_ordinal for r in records],
    )

    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("NES_FSM_RUNTIME_CANCELLED")

    # Bounded CSR traversal (identical to FROZEN_NES_FSM_CSR_GRAPH_V1)
    row_offsets = (0, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16)
    col_indices = (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0)
    seeds = sorted({sorted_indices[0] % 16, sorted_indices[1] % 16})
    visited = bytearray(16)
    prefix_parts: list[str] = []
    for s in seeds:
        visited[s] = 1
        prefix_parts.append(f"seed:{s}\n")
    frontier = list(seeds)
    discovered = 0
    for depth in range(1, 3):
        if not frontier:
            break
        next_set: set[int] = set()
        for node in frontier:
            for edge in range(row_offsets[node], row_offsets[node + 1]):
                nbr = col_indices[edge]
                if visited[nbr] == 0:
                    next_set.add(nbr)
        next_frontier = sorted(next_set)
        for nbr in next_frontier:
            visited[nbr] = 1
            discovered += 1
            prefix_parts.append(f"node:{depth}:{nbr}\n")
        frontier = next_frontier
    csr_total_visited = len(seeds) + discovered
    csr_checksum = sha256_hex("".join(prefix_parts))

    # BitFrost residency assignment
    used_tokens = 0
    bitfrost_codes: list[int] = []
    resident_ordinals: list[int] = []
    admitted_ordinals: list[int] = []
    for src_idx in sorted_indices:
        rec = records[src_idx]
        if used_tokens + rec.token_count <= token_budget:
            used_tokens += rec.token_count
            bitfrost_codes.append(2)
            resident_ordinals.append(rec.candidate_ordinal)
        else:
            bitfrost_codes.append(1)
            admitted_ordinals.append(rec.candidate_ordinal)

    lead = records[sorted_indices[0]]
    _, nes_palette_byte = CANONICAL_PALETTE_BRIDGE[lead.primary_lut_byte]

    record_bytes = b"".join(
        struct.pack(
            RECORD_FMT,
            records[src_idx].candidate_ordinal,
            records[src_idx].kmeans_cluster_id,
            records[src_idx].som_bmu_id,
            src_idx,
            records[src_idx].domain_bitmask,
            records[src_idx].primary_lut_byte,
            bitfrost_codes[rank],
            records[src_idx].token_count,
        )
        for rank, src_idx in enumerate(sorted_indices)
    )

    total_len = (HEADER_BYTES + len(record_bytes) + (ALIGN_BYTES - 1)) & ~(ALIGN_BYTES - 1)
    scratch = bytearray(total_len)
    struct.pack_into(
        HEADER_PREFIX_FMT,
        scratch,
        0,
        NES_FSM_MAGIC_LE,
        NES_FSM_ENDIAN_TAG_LE,
        1,
        len(sorted_indices),
        lead.primary_lut_byte,
        nes_palette_byte,
        lead.domain_bitmask,
        int(active_grant["grantedPolicyMask"]),
        4,
        6,
        0,
        csr_total_visited,
    )
    scratch[24:32] = hashlib.sha256(batch_source_revision.encode("utf-8")).digest()[:8]
    scratch[32:40] = bytes.fromhex(ordinal_map_checksum)[:8]
    scratch[40:48] = bytes.fromhex(csr_checksum)[:8]
    scratch[HEADER_BYTES : HEADER_BYTES + len(record_bytes)] = record_bytes
    scratch[48:64] = hashlib.sha256(record_bytes).digest()[:16]

    if cancel_event is not None and cancel_event.is_set():
        raise RuntimeError("NES_FSM_RUNTIME_CANCELLED")

    raw_descriptor = bytes(scratch)
    verify_descriptor_readback(raw_descriptor, batch_source_revision, ordinal_map_checksum, csr_checksum)
    output_buffer_checksum = sha256_hex(raw_descriptor)

    if buffer_slot is not None:
        buffer_slot.commit_validated_scratch(raw_descriptor, output_buffer_checksum, batch_source_revision)

    return {
        "runtime": "python",
        "sourceRevision": batch_source_revision,
        "binarySchemaRevision": NES_FSM_BINARY_SCHEMA_REVISION_V1,
        "endianness": "LE",
        "serializedLayoutAlignmentBytes": ALIGN_BYTES,
        "descriptorByteLength": len(raw_descriptor),
        "candidateOrdinalMapChecksum": ordinal_map_checksum,
        "inputBufferChecksum": input_buffer_checksum,
        "outputBufferChecksum": output_buffer_checksum,
        "csrTotalVisited": csr_total_visited,
        "csrDiscoveryPrefixChecksum": csr_checksum,
        "sortedOrdinals": [records[i].candidate_ordinal for i in sorted_indices],
        "residentCount": len(resident_ordinals),
        "admittedCount": len(admitted_ordinals),
        "descriptorHex": raw_descriptor.hex(),
        "canonicalAuthority": False,
        "promotionEligible": False,
    }


def test_python_native_fsm_runtime_and_buffer_swap() -> None:
    native = load_native_module()

    # Probe pybind native guards directly
    with pytest.raises(ValueError, match="SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED"):
        native.radix_sort_som_candidate_indices(
            [0] * (MAX_NATIVE_RADIX_ROWS_V1 + 1),
            [0] * (MAX_NATIVE_RADIX_ROWS_V1 + 1),
            list(range(MAX_NATIVE_RADIX_ROWS_V1 + 1)),
        )
    with pytest.raises(ValueError, match="SOM_RADIX_KEY_OUT_OF_RANGE"):
        native.radix_sort_som_candidate_indices([0], [400], [1])
    with pytest.raises(ValueError, match="SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE"):
        native.radix_sort_som_candidate_indices([1, 1], [2, 2], [9, 9])

    slot = DoubleBufferDescriptorSlot()
    report = run_python_nes_fsm_runtime(buffer_slot=slot)
    assert report["canonicalAuthority"] is False
    assert report["promotionEligible"] is False
    assert report["descriptorByteLength"] == 320
    assert report["csrTotalVisited"] == 5
    assert report["residentCount"] == 12
    assert report["admittedCount"] == 4
    assert report["sortedOrdinals"][0] == 102
    assert slot.swap_count == 1
    assert slot.active_checksum == report["outputBufferChecksum"]


def test_python_negative_gates_endianness_duplicates_masks_revisions_and_cancellation() -> None:
    slot = DoubleBufferDescriptorSlot()
    valid = run_python_nes_fsm_runtime(buffer_slot=slot)
    valid_bytes = bytes.fromhex(valid["descriptorHex"])

    # 1. Wrong byte order (BE)
    be_buf = bytearray(valid_bytes)
    struct.pack_into("<I", be_buf, 4, NES_FSM_ENDIAN_TAG_BE)
    with pytest.raises(ValueError, match="BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH"):
        verify_descriptor_readback(
            bytes(be_buf),
            valid["sourceRevision"],
            valid["candidateOrdinalMapChecksum"],
            valid["csrDiscoveryPrefixChecksum"],
        )

    # 2. Duplicate ordinals (preflight + binary readback)
    dup_batch = list(FROZEN_BATCH)
    dup_batch[4] = FrozenCandidateInput(
        FROZEN_BATCH[0].candidate_ordinal,
        dup_batch[4].kmeans_cluster_id,
        dup_batch[4].som_bmu_id,
        dup_batch[4].primary_lut_byte,
        dup_batch[4].domain_bitmask,
        dup_batch[4].feature_label,
        dup_batch[4].source_ref,
    )
    with pytest.raises(ValueError, match="SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE"):
        run_python_nes_fsm_runtime(records=tuple(dup_batch))

    dup_buf = bytearray(valid_bytes)
    first_ord = struct.unpack_from("<I", dup_buf, HEADER_BYTES)[0]
    struct.pack_into("<I", dup_buf, HEADER_BYTES + RECORD_BYTES, first_ord)
    dup_buf[48:64] = hashlib.sha256(dup_buf[HEADER_BYTES : HEADER_BYTES + 16 * RECORD_BYTES]).digest()[:16]
    with pytest.raises(ValueError, match="BINARY_DESCRIPTOR_DUPLICATE_ORDINAL"):
        verify_descriptor_readback(
            bytes(dup_buf),
            valid["sourceRevision"],
            valid["candidateOrdinalMapChecksum"],
            valid["csrDiscoveryPrefixChecksum"],
        )

    # 3. Invalid masks & visual metadata rejected as policy grant
    bad_mask = list(FROZEN_BATCH)
    bad_mask[0] = FrozenCandidateInput(142, 2, 17, 10, 0x0400, "canvas", FROZEN_BATCH[0].source_ref)
    with pytest.raises(ValueError, match="INVALID_DOMAIN_BITMASK"):
        run_python_nes_fsm_runtime(records=tuple(bad_mask))

    with pytest.raises(ValueError, match="NON_AUTHORIZING_FIELD_PASSED_AS_POLICY_GRANT"):
        run_python_nes_fsm_runtime(grant={"nesHex": "0x16", "sourceRevision": FROZEN_SOURCE_REVISION_V1})

    non_zero_auth = bytearray(valid_bytes)
    non_zero_auth[22] = 0x01
    with pytest.raises(ValueError, match="BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS"):
        verify_descriptor_readback(
            bytes(non_zero_auth),
            valid["sourceRevision"],
            valid["candidateOrdinalMapChecksum"],
            valid["csrDiscoveryPrefixChecksum"],
        )

    # 4. Stale revisions
    with pytest.raises(ValueError, match="FSM_REVISION_MISMATCH"):
        run_python_nes_fsm_runtime(expected_source_revision="git:stale/revision")
    with pytest.raises(ValueError, match="CSR_CURSOR_GRAPH_REVISION_MISMATCH"):
        run_python_nes_fsm_runtime(csr_graph_revision="sha256:stale")
    with pytest.raises(ValueError, match="BINARY_DESCRIPTOR_STALE_SOURCE_REVISION"):
        verify_descriptor_readback(
            valid_bytes,
            f"{valid['sourceRevision']}-stale",
            valid["candidateOrdinalMapChecksum"],
            valid["csrDiscoveryPrefixChecksum"],
        )

    # 5. Cancellation preserves prior active buffer
    cancel_evt = threading.Event()
    cancel_evt.set()
    with pytest.raises(RuntimeError, match="NES_FSM_RUNTIME_CANCELLED"):
        run_python_nes_fsm_runtime(cancel_event=cancel_evt, buffer_slot=slot)
    assert slot.swap_count == 1
    assert slot.active_checksum == valid["outputBufferChecksum"]


def test_chr_16byte_2bpp_decoder_and_chrom97_separation() -> None:
    # Tile 0: row 0 = [0,1,2,3,0,1,2,3] -> plane0 bits = 0b01010101 (0x55), plane1 = 0b00110011 (0x33)
    chr_tile = bytearray(16)
    chr_tile[0] = 0b01010101
    chr_tile[8] = 0b00110011
    row0 = [nes_pixel(bytes(chr_tile), 0, x, 0) for x in range(8)]
    assert row0 == [0, 1, 2, 3, 0, 1, 2, 3]

    # 8-byte NESCHROM97 metadata must never decode as 16-byte pixel tile
    chrom97_8b = b"\x01\x02\x03\x04\x05\x06\x07\x08"
    with pytest.raises(ValueError, match="CHR_FORMAT_VIOLATION"):
        nes_pixel(chrom97_8b, 0, 0, 0)


def test_dspy_agentic_error_fixer_verifier_gate_and_turn_ledger() -> None:
    scripts_atlas_dir = str(REPO_ROOT / "scripts" / "atlas")
    if scripts_atlas_dir not in sys.path:
        sys.path.insert(0, scripts_atlas_dir)
    import dspy_agentic_error_fixer as fixer  # type: ignore[import-not-found]

    assert fixer.MAX_AGENTIC_TURNS == 3
    assert fixer.ProsecutorErrorFixerAgent is fixer.AtlasAgenticRepairPipeline

    # 1. Reviewed verifier command allowlist & safety checks
    ok_node = fixer.validate_reviewed_verifier_cmd(
        "node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs"
    )
    assert ok_node["valid"] is True
    assert ok_node["checkedPaths"] == ["scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs"]

    ok_vitest = fixer.validate_reviewed_verifier_cmd(
        "npm exec -- vitest run src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.spec.ts"
    )
    assert ok_vitest["valid"] is True

    bad_semicolon = fixer.validate_reviewed_verifier_cmd(
        "node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs; ls"
    )
    assert bad_semicolon["valid"] is False
    assert "SHELL_METACHARACTERS_FORBIDDEN" in bad_semicolon["reason"]

    bad_missing = fixer.validate_reviewed_verifier_cmd(
        "node scripts/atlas/verify-does_not_exist.mjs"
    )
    assert bad_missing["valid"] is False
    assert "VERIFIER_TARGET_MISSING" in bad_missing["reason"]

    bad_inline_py = fixer.validate_reviewed_verifier_cmd("pytest -c foo.py")
    assert bad_inline_py["valid"] is False
    assert "INLINE_EXEC_FLAG_FORBIDDEN" in bad_inline_py["reason"]

    bad_inline_vitest = fixer.validate_reviewed_verifier_cmd("npm exec -- vitest run -e foo")
    assert bad_inline_vitest["valid"] is False
    assert "INLINE_EXEC_FLAG_FORBIDDEN" in bad_inline_vitest["reason"]

    bad_arbitrary = fixer.validate_reviewed_verifier_cmd("rm -rf /tmp/foo")
    assert bad_arbitrary["valid"] is False
    assert "VERIFIER_RUNNER_NOT_ALLOWLISTED" in bad_arbitrary["reason"]

    # 2. Fail-closed forward gates without calling live LLM endpoint
    pipeline = fixer.AtlasAgenticRepairPipeline(api_base="http://127.0.0.1:19999/v1")

    res_missing = pipeline.forward(
        "0x01", "legal-core", "task-1", ["neighbor-1"], "diag", verifier_tier="T0", verifier_cmd=None, turn=1
    )
    assert res_missing["status"] == "BLOCKED_MISSING_T0_VERIFIER"
    assert res_missing["writesPerformed"] is False
    assert res_missing["canonicalAuthority"] is False

    res_t1 = pipeline.forward(
        "0x01",
        "legal-core",
        "task-1",
        ["neighbor-1"],
        "diag",
        verifier_tier="T1",
        verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
        turn=1,
    )
    assert res_t1["status"] == "BLOCKED_MISSING_T0_VERIFIER"

    res_t2 = pipeline.forward(
        "0x01", "legal-core", "task-1", ["neighbor-1"], "diag", verifier_tier="T2", verifier_cmd=None, turn=1
    )
    assert res_t2["status"] == "DIAGNOSE_ONLY_NO_PATCH"

    res_turn4 = pipeline.forward(
        "0x01",
        "legal-core",
        "task-1",
        ["neighbor-1"],
        "diag",
        verifier_tier="T0",
        verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
        turn=4,
    )
    assert res_turn4["status"] == "BLOCKED"
    assert "AGENTIC_TURN_CAP_EXCEEDED" in res_turn4["blockReason"]

    res_unreachable = pipeline.forward(
        "0x01",
        "legal-core",
        "task-1",
        ["neighbor-1"],
        "diag",
        verifier_tier="T0",
        verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
        turn=1,
    )
    assert res_unreachable["status"] == "BLOCKED"
    assert "ORNITH_ENDPOINT_UNREACHABLE" in res_unreachable["blockReason"]
    assert res_unreachable["writesPerformed"] is False
    assert res_unreachable["canonicalAuthority"] is False

    # 3. Turn ledger constraints and forbidden thought/tensor keys
    ledger = fixer.build_turn_ledger_entry_v1(
        task_key="task-1",
        turn=1,
        verifier_tier="T0",
        signature="RepairSignatureV1",
        inputs_hash="sha256:in",
        proposal_hash="sha256:prop",
        verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
        exit_code=0,
        reward=1.0,
        model_id="ornith-1.5-9b",
    )
    assert ledger["schema"] == "atlas.agentic-fixer-turn-ledger.v1"
    assert ledger["writesPerformed"] is False
    assert ledger["canonicalAuthority"] is False

    with pytest.raises(ValueError, match="AGENTIC_TURN_CAP_EXCEEDED"):
        fixer.build_turn_ledger_entry_v1(
            task_key="task-1",
            turn=4,
            verifier_tier="T0",
            signature="RepairSignatureV1",
            inputs_hash="sha256:in",
            proposal_hash="sha256:prop",
            verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
            exit_code=0,
            reward=0.0,
            model_id="ornith-1.5-9b",
        )

    for forbidden_key in ("hiddenThoughts", "chainOfThought"):
        with pytest.raises(ValueError, match="FORBIDDEN_STORAGE_KEY"):
            fixer.build_turn_ledger_entry_v1(
                task_key="task-1",
                turn=1,
                verifier_tier="T0",
                signature="RepairSignatureV1",
                inputs_hash="sha256:in",
                proposal_hash="sha256:prop",
                verifier_cmd="node scripts/atlas/verify-nes-fsm-native-runtime-v1.mjs",
                exit_code=0,
                reward=0.0,
                model_id="ornith-1.5-9b",
                extra_metadata={forbidden_key: "must-fail"},
            )


if __name__ == "__main__":
    if "--emit-json" in sys.argv:
        print(json.dumps(run_python_nes_fsm_runtime()))
    else:
        raise SystemExit(pytest.main([__file__, "-v"]))
