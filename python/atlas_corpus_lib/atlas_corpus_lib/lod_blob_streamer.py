"""Bitset / Bytea / Bitshift Protobuf ($1..$20) & 128-Byte Aligned LOD Texture
Streaming Blob Assembler for PostgreSQL 18 -> PyTorch `torch.frombuffer` / `at::from_blob`.

Because PyTorch 2.x / LibTorch C++ runtime does not embed an HTTP/3 QUIC transport,
PostgreSQL 18 stores canonical bytea + bit(128) columns and streams 20-field ($1..$20)
Protobuf wire-framed packets and 128-byte cacheline-aligned LOD texture blocks
(LOD0 16B bitset -> LOD1 32B 2-bit -> LOD2 64B 4-bit -> LOD3 768-d exact rescore).
"""

from __future__ import annotations

import hashlib
import math
import struct
import uuid
from typing import Any, Iterable, Literal
from pydantic import Field, model_validator

from .ast_chunker_helpers import Pg18ByteaTurboVecPayloadV1, pack_turbovec_mrl128_bytes
from .structural_observation_v1 import StrictModel

PROTO_WIRE_VARINT = 0
PROTO_WIRE_FIXED64 = 1
PROTO_WIRE_BYTES = 2
PROTO_WIRE_FIXED32 = 5


def _lod_block_bytes_v1(envelope: Any) -> bytes:
    return b"".join((
        _strip_pg_bytea_hex(envelope.field_15_lod0_sign_bitset_16b_hex),
        _strip_pg_bytea_hex(envelope.field_16_lod1_turbovec_2bit_32b_hex),
        _strip_pg_bytea_hex(envelope.field_17_lod2_turbovec_4bit_64b_hex),
        struct.pack(
            "<IHHff",
            envelope.field_11_candidate_ordinal,
            envelope.field_13_som_bmu_id,
            envelope.field_12_kmeans_cluster_id,
            envelope.field_18_quant_minimum,
            envelope.field_19_scale_4bit,
        ),
    ))


class LodTexturePacketEnvelopeV1(StrictModel):
    """Canonical 20-field ($1..$20) PostgreSQL 18 / Protobuf wire mapping for
    progressive LOD texture streaming into ATen/CUDA tiles.
    """

    schema_id: Literal["atlas.lod-texture-packet-envelope.v1"] = Field(
        default="atlas.lod-texture-packet-envelope.v1", alias="schema", serialization_alias="schema"
    )
    # $1..$5: Canonical Identity & Lineage
    field_1_packet_uuid: str = Field(min_length=36, max_length=36)
    field_2_tree_node_id: str = Field(min_length=1)
    field_3_source_ref: str = Field(min_length=1)
    field_4_source_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    field_5_workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    # $6..$10: Feature Spine, Language & RFC Routing
    field_6_feature_id: str = Field(min_length=1)
    field_7_feature_label: str = Field(min_length=1)
    field_8_language_id: str = Field(min_length=1)
    field_9_rfc_id: str = Field(min_length=1)
    field_10_symbol_name: str = Field(min_length=1)
    # $11..$14: Topology & CandidateOrdinal Routing
    field_11_candidate_ordinal: int = Field(strict=True, ge=0, le=0xFFFFFFFF)
    field_12_kmeans_cluster_id: int = Field(strict=True, ge=0, le=0xFFFF)
    field_13_som_bmu_id: int = Field(strict=True, ge=0, lt=400)
    field_14_tile_index: int = Field(strict=True, ge=0, le=0xFFFFFFFF)
    # $15..$20: Progressive LOD 0/1/2/3 Binary Blob Payloads (PG18 bytea / bit(128))
    field_15_lod0_sign_bitset_16b_hex: str = Field(pattern=r"^\\x[a-f0-9]{32}$")
    field_16_lod1_turbovec_2bit_32b_hex: str = Field(pattern=r"^\\x[a-f0-9]{64}$")
    field_17_lod2_turbovec_4bit_64b_hex: str = Field(pattern=r"^\\x[a-f0-9]{128}$")
    field_18_quant_minimum: float = Field(allow_inf_nan=False)
    field_19_scale_4bit: float = Field(allow_inf_nan=False, ge=0)
    field_20_lod_block_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")

    @model_validator(mode="after")
    def validate_packet_and_lod_digest(self) -> "LodTexturePacketEnvelopeV1":
        try:
            packet_uuid = uuid.UUID(self.field_1_packet_uuid)
        except ValueError as error:
            raise ValueError("PACKET_UUID_INVALID") from error
        if str(packet_uuid) != self.field_1_packet_uuid or packet_uuid.version not in {4, 7}:
            raise ValueError("PACKET_UUID_MUST_BE_CANONICAL_V4_OR_V7")
        actual_digest = f"sha256:{hashlib.sha256(_lod_block_bytes_v1(self)).hexdigest()}"
        if self.field_20_lod_block_sha256 != actual_digest:
            raise ValueError("LOD_PACKET_BLOCK_DIGEST_MISMATCH")
        return self


def _strip_pg_bytea_hex(hex_str: str) -> bytes:
    cleaned = hex_str[2:] if hex_str.startswith("\\x") else hex_str
    return bytes.fromhex(cleaned)


def bitset128_hamming_similarity(sign_hex_a: str, sign_hex_b: str) -> float:
    """LOD 0: Computes hardware POPCOUNT Hamming similarity across two 128-bit sign bitsets
    packed as 16-byte PG18 bytea hex strings using two 64-bit unsigned integer XOR words.
    """
    raw_a = _strip_pg_bytea_hex(sign_hex_a)
    raw_b = _strip_pg_bytea_hex(sign_hex_b)
    if len(raw_a) != 16 or len(raw_b) != 16:
        raise ValueError("SIGN_BITSET_128_MUST_BE_16_BYTES")
    a0, a1 = struct.unpack(">QQ", raw_a)
    b0, b1 = struct.unpack(">QQ", raw_b)
    hamming_distance = (a0 ^ b0).bit_count() + (a1 ^ b1).bit_count()
    return 1.0 - (hamming_distance / 128.0)


def bitset128_jaccard_similarity(sign_hex_a: str, sign_hex_b: str) -> float:
    """LOD 0: Computes bitwise POPCOUNT Jaccard similarity (|A & B| / |A | B|) across
    two 16-byte 128-bit sign bitsets, matching C++ `atlas::native::bitset128_jaccard_similarity`.
    """
    raw_a = _strip_pg_bytea_hex(sign_hex_a)
    raw_b = _strip_pg_bytea_hex(sign_hex_b)
    if len(raw_a) != 16 or len(raw_b) != 16:
        raise ValueError("SIGN_BITSET_128_MUST_BE_16_BYTES")
    a0, a1 = struct.unpack(">QQ", raw_a)
    b0, b1 = struct.unpack(">QQ", raw_b)
    union_bits = (a0 | b0).bit_count() + (a1 | b1).bit_count()
    if union_bits == 0:
        return 0.0
    inter_bits = (a0 & b0).bit_count() + (a1 & b1).bit_count()
    return float(inter_bits) / float(union_bits)


def unpack_turbovec_2bit_bitshift(bytea_hex: str, minimum: float, maximum: float) -> list[float]:
    """LOD 1: Unpacks a 32-byte 2-bit TurboVec PG18 bytea blob into 128 floats using
    exact high-bit-first bitshifts ((byte >> 6) & 0x03, (byte >> 4) & 0x03, (byte >> 2) & 0x03, byte & 0x03).
    """
    raw = _strip_pg_bytea_hex(bytea_hex)
    if len(raw) != 32:
        raise ValueError("TURBOVEC_2BIT_BLOB_MUST_BE_32_BYTES")
    step = (maximum - minimum) / 3.0 if maximum != minimum else 0.0
    out: list[float] = []
    for byte_val in raw:
        out.append(minimum + ((byte_val >> 6) & 0x03) * step)
        out.append(minimum + ((byte_val >> 4) & 0x03) * step)
        out.append(minimum + ((byte_val >> 2) & 0x03) * step)
        out.append(minimum + (byte_val & 0x03) * step)
    return out


def unpack_turbovec_4bit_bitshift(bytea_hex: str, minimum: float, maximum: float) -> list[float]:
    """LOD 2: Unpacks a 64-byte 4-bit TurboVec PG18 bytea blob into 128 floats using
    exact high-bit-first bitshifts ((byte >> 4) & 0x0F, byte & 0x0F).
    """
    raw = _strip_pg_bytea_hex(bytea_hex)
    if len(raw) != 64:
        raise ValueError("TURBOVEC_4BIT_BLOB_MUST_BE_64_BYTES")
    step = (maximum - minimum) / 15.0 if maximum != minimum else 0.0
    out: list[float] = []
    for byte_val in raw:
        out.append(minimum + ((byte_val >> 4) & 0x0F) * step)
        out.append(minimum + (byte_val & 0x0F) * step)
    return out


def asymmetric_dot_4bit(query_128: list[float], bytea_hex: str, minimum: float, scale_4bit: float) -> float:
    """Score a 128-value query against the C++ high-nibble-first 4-bit encoding."""
    raw = _strip_pg_bytea_hex(bytea_hex)
    if len(query_128) < 128 or len(raw) != 64:
        raise ValueError("TURBOVEC_4BIT_INPUT_SHAPE_INVALID")
    if not math.isfinite(minimum) or not math.isfinite(scale_4bit) or scale_4bit < 0:
        raise ValueError("TURBOVEC_4BIT_SCALE_INVALID")
    score = 0.0
    for byte_index, byte_val in enumerate(raw):
        query_index = byte_index * 2
        query_high = float(query_128[query_index])
        query_low = float(query_128[query_index + 1])
        if not math.isfinite(query_high) or not math.isfinite(query_low):
            raise ValueError("TURBOVEC_4BIT_QUERY_NONFINITE")
        value_high = minimum + ((byte_val >> 4) & 0x0F) * scale_4bit
        value_low = minimum + (byte_val & 0x0F) * scale_4bit
        score += query_high * value_high + query_low * value_low
    return score


def _encode_varint(value: int) -> bytes:
    if value < 0:
        raise ValueError("PROTO_VARINT_MUST_BE_NONNEGATIVE")
    out = bytearray()
    while value >= 0x80:
        out.append((value & 0x7F) | 0x80)
        value >>= 7
    out.append(value & 0x7F)
    return bytes(out)


def _decode_varint(buf: bytes, offset: int) -> tuple[int, int]:
    start = offset
    result = 0
    for index in range(10):
        if offset >= len(buf):
            raise ValueError("TRUNCATED_PROTO_VARINT")
        byte_val = buf[offset]
        offset += 1
        if index == 9 and byte_val > 1:
            raise ValueError("PROTO_VARINT_UINT64_OVERFLOW")
        shift = index * 7
        result |= (byte_val & 0x7F) << shift
        if not (byte_val & 0x80):
            if buf[start:offset] != _encode_varint(result):
                raise ValueError("NON_CANONICAL_PROTO_VARINT")
            return result, offset
    raise ValueError("PROTO_VARINT_UINT64_OVERFLOW")


def encode_lod_packet_protobuf_fields_1_to_20(env: LodTexturePacketEnvelopeV1) -> bytes:
    """Encodes all 20 positional fields ($1..$20) into a deterministic Protobuf binary wire stream."""
    out = bytearray()

    def put_str(field_num: int, text: str) -> None:
        raw = text.encode("utf-8")
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_BYTES))
        out.extend(_encode_varint(len(raw)))
        out.extend(raw)

    def put_bytes(field_num: int, raw: bytes) -> None:
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_BYTES))
        out.extend(_encode_varint(len(raw)))
        out.extend(raw)

    def put_uint(field_num: int, val: int) -> None:
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_VARINT))
        out.extend(_encode_varint(val))

    def put_f32(field_num: int, val: float) -> None:
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_FIXED32))
        out.extend(struct.pack("<f", float(val)))

    put_str(1, env.field_1_packet_uuid)
    put_str(2, env.field_2_tree_node_id)
    put_str(3, env.field_3_source_ref)
    put_str(4, env.field_4_source_revision)
    put_str(5, env.field_5_workspace_revision)
    put_str(6, env.field_6_feature_id)
    put_str(7, env.field_7_feature_label)
    put_str(8, env.field_8_language_id)
    put_str(9, env.field_9_rfc_id)
    put_str(10, env.field_10_symbol_name)
    put_uint(11, env.field_11_candidate_ordinal)
    put_uint(12, env.field_12_kmeans_cluster_id)
    put_uint(13, env.field_13_som_bmu_id)
    put_uint(14, env.field_14_tile_index)
    put_bytes(15, _strip_pg_bytea_hex(env.field_15_lod0_sign_bitset_16b_hex))
    put_bytes(16, _strip_pg_bytea_hex(env.field_16_lod1_turbovec_2bit_32b_hex))
    put_bytes(17, _strip_pg_bytea_hex(env.field_17_lod2_turbovec_4bit_64b_hex))
    put_f32(18, env.field_18_quant_minimum)
    if env.field_20_lod_block_sha256 != f"sha256:{hashlib.sha256(_lod_block_bytes_v1(env)).hexdigest()}":
        raise ValueError("LOD_PACKET_BLOCK_DIGEST_MISMATCH")
    put_f32(19, env.field_19_scale_4bit)
    put_str(20, env.field_20_lod_block_sha256)
    return bytes(out)


def decode_lod_packet_protobuf_fields_1_to_20(wire_bytes: bytes) -> LodTexturePacketEnvelopeV1:
    """Decodes a binary Protobuf wire stream ($1..$20) back into a validated LodTexturePacketEnvelopeV1."""
    if not isinstance(wire_bytes, bytes) or len(wire_bytes) > 4096:
        raise ValueError("LOD_PACKET_PROTOBUF_SIZE_INVALID")
    offset = 0
    fields: dict[int, Any] = {}
    expected_wire_types = {
        **{field_num: PROTO_WIRE_BYTES for field_num in range(1, 11)},
        **{field_num: PROTO_WIRE_VARINT for field_num in range(11, 15)},
        15: PROTO_WIRE_BYTES,
        16: PROTO_WIRE_BYTES,
        17: PROTO_WIRE_BYTES,
        18: PROTO_WIRE_FIXED32,
        19: PROTO_WIRE_FIXED32,
        20: PROTO_WIRE_BYTES,
    }
    while offset < len(wire_bytes):
        tag, offset = _decode_varint(wire_bytes, offset)
        field_num = tag >> 3
        wire_type = tag & 0x07
        if field_num not in expected_wire_types:
            raise ValueError("LOD_PACKET_PROTO_FIELD_UNSUPPORTED")
        if wire_type != expected_wire_types[field_num]:
            raise ValueError("LOD_PACKET_PROTO_WIRE_TYPE_MISMATCH")
        if field_num in fields:
            raise ValueError("LOD_PACKET_PROTO_DUPLICATE_FIELD")
        if wire_type == PROTO_WIRE_VARINT:
            val, offset = _decode_varint(wire_bytes, offset)
            fields[field_num] = val
        elif wire_type == PROTO_WIRE_BYTES:
            length, offset = _decode_varint(wire_bytes, offset)
            if length > len(wire_bytes) - offset:
                raise ValueError("TRUNCATED_PROTO_BYTES_FIELD")
            expected_lengths = {15: 16, 16: 32, 17: 64}
            if field_num in expected_lengths and length != expected_lengths[field_num]:
                raise ValueError("LOD_PACKET_PROTO_PAYLOAD_LENGTH_INVALID")
            if length > 2048:
                raise ValueError("LOD_PACKET_PROTO_FIELD_TOO_LARGE")
            fields[field_num] = wire_bytes[offset:offset + length]
            offset += length
        elif wire_type == PROTO_WIRE_FIXED32:
            if len(wire_bytes) - offset < 4:
                raise ValueError("TRUNCATED_PROTO_FIXED32_FIELD")
            (val_f32,) = struct.unpack("<f", wire_bytes[offset : offset + 4])
            fields[field_num] = float(val_f32)
            offset += 4
        else:
            raise ValueError(f"UNSUPPORTED_PROTO_WIRE_TYPE:{wire_type}")

    if set(fields) != set(expected_wire_types):
        raise ValueError("LOD_PACKET_PROTO_REQUIRED_FIELD_MISSING")

    return LodTexturePacketEnvelopeV1(
        field_1_packet_uuid=fields[1].decode("utf-8"),
        field_2_tree_node_id=fields[2].decode("utf-8"),
        field_3_source_ref=fields[3].decode("utf-8"),
        field_4_source_revision=fields[4].decode("utf-8"),
        field_5_workspace_revision=fields[5].decode("utf-8"),
        field_6_feature_id=fields[6].decode("utf-8"),
        field_7_feature_label=fields[7].decode("utf-8"),
        field_8_language_id=fields[8].decode("utf-8"),
        field_9_rfc_id=fields[9].decode("utf-8"),
        field_10_symbol_name=fields[10].decode("utf-8"),
        field_11_candidate_ordinal=int(fields[11]),
        field_12_kmeans_cluster_id=int(fields[12]),
        field_13_som_bmu_id=int(fields[13]),
        field_14_tile_index=int(fields[14]),
        field_15_lod0_sign_bitset_16b_hex="\\x" + fields[15].hex(),
        field_16_lod1_turbovec_2bit_32b_hex="\\x" + fields[16].hex(),
        field_17_lod2_turbovec_4bit_64b_hex="\\x" + fields[17].hex(),
        field_18_quant_minimum=float(fields[18]),
        field_19_scale_4bit=float(fields[19]),
        field_20_lod_block_sha256=fields[20].decode("utf-8"),
    )


def assemble_lod_texture_block_128b(
    *,
    mrl128_values: Iterable[float],
    candidate_ordinal: int,
    som_bmu_id: int,
    kmeans_cluster_id: int,
) -> tuple[bytes, Pg18ByteaTurboVecPayloadV1, Pg18ByteaTurboVecPayloadV1]:
    """Assembles a single 128-byte CUDA cacheline-aligned LOD texture block:
      - Bytes   0..15  (16B): LOD 0 128-bit sign bitset
      - Bytes  16..47  (32B): LOD 1 2-bit MRL-128 packed vector
      - Bytes  48..111 (64B): LOD 2 4-bit MRL-128 packed vector
      - Bytes 112..127 (16B): Header (<IHHff: candidate_ordinal, som_bmu_id, kmeans_cluster_id, min_val, scale_4bit)
    The returned immutable bytes can be wrapped by a consumer that manages its lifetime.
    """
    packed4 = pack_turbovec_mrl128_bytes(mrl128_values, bits_per_value=4)
    packed2 = pack_turbovec_mrl128_bytes(mrl128_values, bits_per_value=2)

    lod0_16b = _strip_pg_bytea_hex(packed4.sign_bitset_128_hex)
    lod1_32b = _strip_pg_bytea_hex(packed2.bytea_hex)
    lod2_64b = _strip_pg_bytea_hex(packed4.bytea_hex)
    scale_4bit = (packed4.maximum - packed4.minimum) / 15.0 if packed4.maximum != packed4.minimum else 0.0

    header_16b = struct.pack(
        "<IHHff",
        int(candidate_ordinal),
        int(som_bmu_id),
        int(kmeans_cluster_id),
        float(packed4.minimum),
        float(scale_4bit),
    )
    block_128b = lod0_16b + lod1_32b + lod2_64b + header_16b
    assert len(block_128b) == 128
    return block_128b, packed2, packed4


def stream_lod_blocks_to_pytorch_blob(blocks: list[bytes]) -> Any:
    """Streams N 128-byte LOD texture blocks into a contiguous [N, 128] uint8 ATen tensor
    by coalescing blocks once into a staging buffer, then viewing that buffer through
    `torch.frombuffer` or NumPy without another copy.
    """
    if not blocks:
        raise ValueError("LOD_BLOCKS_MUST_NOT_BE_EMPTY")
    for b in blocks:
        if len(b) != 128:
            raise ValueError("EACH_LOD_TEXTURE_BLOCK_MUST_BE_128_BYTES")
    contiguous = bytearray().join(blocks)
    try:
        import torch  # type: ignore
    except ImportError:
        try:
            import numpy as np
        except ImportError as error:
            raise RuntimeError("TORCH_OR_NUMPY_REQUIRED_FOR_LOD_TENSOR") from error
        return np.frombuffer(contiguous, dtype=np.uint8).reshape(len(blocks), 128)
    return torch.frombuffer(contiguous, dtype=torch.uint8).reshape(len(blocks), 128)


class TensorTileDescriptorV1(StrictModel):
    """Python wire-parity counterpart to C++ `atlas::native::TensorTileDescriptorV1`
    and `proto/active/tensor_tile_v1.proto` (`atlas.tensor.v1.TensorTileV1`).
    """

    schema_version: Literal["atlas.tensor-tile.v1"] = "atlas.tensor-tile.v1"
    workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    source_snapshot_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    ordinal_map_digest: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    representation_revision: str = Field(min_length=1)
    logical_dimension: Literal[128] = 128
    quantization: Literal[1, 2, 3, 4] = 2
    layout: Literal[1, 2, 3, 4] = 2
    payload_hex: str = Field(pattern=r"^\\x[a-f0-9]+$")
    payload_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    candidate_ordinal: int = Field(ge=0)
    proposal_only: Literal[True] = True


def encode_tensor_tile_v1(tile: TensorTileDescriptorV1) -> bytes:
    """Produces byte-for-byte identical Protobuf wire bytes to C++ `atlas::native::encode_tensor_tile_v1`."""
    expected_len = {1: 16, 2: 32, 3: 64, 4: 128}.get(tile.layout, 0)
    raw_payload = _strip_pg_bytea_hex(tile.payload_hex)
    if len(raw_payload) != expected_len or tile.quantization != tile.layout:
        raise ValueError("TENSOR_TILE_V1_DESCRIPTOR_INVALID")
    expected_digest = f"sha256:{hashlib.sha256(raw_payload).hexdigest()}"
    if tile.payload_sha256 != expected_digest:
        raise ValueError("TENSOR_TILE_PAYLOAD_DIGEST_MISMATCH")

    out = bytearray()

    def put_str(field_num: int, val: str) -> None:
        if not val:
            return
        raw = val.encode("utf-8")
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_BYTES))
        out.extend(_encode_varint(len(raw)))
        out.extend(raw)

    def put_uint(field_num: int, val: int) -> None:
        if val == 0:
            return
        out.extend(_encode_varint((field_num << 3) | PROTO_WIRE_VARINT))
        out.extend(_encode_varint(val))

    put_str(1, tile.schema_version)
    put_str(2, tile.workspace_revision)
    put_str(3, tile.source_snapshot_digest)
    put_str(4, tile.ordinal_map_digest)
    put_str(5, tile.representation_revision)
    put_uint(6, tile.logical_dimension)
    put_uint(7, tile.quantization)
    put_uint(8, tile.layout)
    out.extend(_encode_varint((9 << 3) | PROTO_WIRE_BYTES))
    out.extend(_encode_varint(len(raw_payload)))
    out.extend(raw_payload)
    put_str(10, tile.payload_sha256)
    put_uint(11, tile.candidate_ordinal)
    put_uint(12, 1 if tile.proposal_only else 0)
    return bytes(out)

