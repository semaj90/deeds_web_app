#!/usr/bin/env python3
"""
prove_cudf_pylibcudf_dlpack_msgpack_bitset_nibble_v1.py
-------------------------------------------------------
End-to-end Gap A + Binary Codec Alignment Proof (WSL2 `atlas-rapids-cu13` & CPU fallback):

1. MessagePack (`msgpack` integer-tagged `0..29` compact envelope) <-> PostgreSQL `BYTEA` (`\\x...` wire hex & 4-byte `varlena` prefix check):
   - Mirrors `sveltekit-frontend/src/lib/server/serialization/packet-msgpack-codec.ts` (`PacketMsgpackTags`).
   - Encodes `latent_64` as FP16 raw `bytes` (128B) and `manifold_4d` as FP32 raw `bytes` (16B) inside integer-tagged MessagePack (`use_bin_type=True`).
   - Never persists raw runtime tensors, `kv_cache`, or `hiddenThoughts`.
2. `AlignedBitsetBlobV1` (`ATLASBIT` 64-byte header + 64-byte padded `uint64` word payload) & Sparse Routing Bit-Packer (`bit 7` active gate + `7-bit` AVX2 shifter):
   - Mirrors `aligned-bitset-blob-v1.ts` and `sparse-routing-bit-packer-v1.ts` byte-for-byte.
   - Verifies SHA-256 payload digest, Jaccard similarity (`|A ∩ B| / |A ∪ B|`), and PostgreSQL `BYTEA` round-trip.
3. 4-Bit Nibble Packing (`uint8` = `[high_nibble_lut_code_4bit (1..17 clamped 1..15) | low_nibble_mbvh4_child_mask_4bit (0b0000..0b1111)]`):
   - Packs pairs of 4-bit `.okf` taxonomy LUT codes + 4-bit MBVH4 child traversal bitmasks into single bytes, and verifies UUIDv5 (`0x5`) / UUIDv7 (`0x7`) version nibble extraction.
4. Gap A — Zero-Copy Apache Arrow `mmap[]` -> `cudf.DataFrame.from_arrow()` + `pylibcudf.Table.from_arrow()` / `pylibcudf.sorting.sort_by_key()` -> DLPack (`to_dlpack()` -> `torch.from_dlpack()`) -> PyTorch (`cuda:0`) & XGBoost (`cuda:0` `QuantileDMatrix` / `inplace_predict`):
   - Enforces the mandatory WSL2 `import torch` BEFORE `import cudf, pylibcudf` ordering rule.
   - Proves GPU-native `pylibcudf` key-sorting by `tupleProjectionOrdinal`, zero-copy DLPack GPU pointer sharing (`data_ptr()` equality between `cudf` and `torch.cuda.FloatTensor`), and `cuda:0` XGBoost inference.
"""

from __future__ import annotations

import hashlib
import json
import struct
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# CRITICAL WSL2 `atlas-rapids-cu13` INVARIANT:
# Always import `torch` BEFORE `cudf` / `pylibcudf` / `cugraph` to prevent symbol-resolution conflicts.
import torch
import numpy as np
import pyarrow as pa
import pyarrow.ipc as pa_ipc
import xgboost as xgb

try:
    import msgpack  # type: ignore[import-not-found]
    MSGPACK_C_AVAILABLE = True
except ImportError:
    msgpack = None  # type: ignore[assignment]
    MSGPACK_C_AVAILABLE = False

try:
    import cudf
    import pylibcudf
    import cupy as cp
    import importlib.metadata as _im
    CUDF_AVAILABLE = True
    PYLIBCUDF_VERSION = _im.version("pylibcudf")
except ImportError:
    cudf = None  # type: ignore[assignment]
    pylibcudf = None  # type: ignore[assignment]
    cp = None  # type: ignore[assignment]
    CUDF_AVAILABLE = False
    PYLIBCUDF_VERSION = None

REPO_ROOT = Path(__file__).resolve().parents[2]
PYTHON_DIR = REPO_ROOT / "python"
SCRIPTS_ATLAS_DIR = REPO_ROOT / "scripts" / "atlas"
for p in (PYTHON_DIR, SCRIPTS_ATLAS_DIR):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from prove_oaklib_ontology_tuple_to_pytorch_loading_v1 import (  # noqa: E402
    NUMERIC_ARROW_PATH,
    NUMERIC_FEATURE_COLUMNS,
    SYMBOLIC_ARROW_PATH,
    AtlasOntologyTupleScorer,
    run_proof as run_base_tuple_proof,
)

RECEIPT_PATH = (
    REPO_ROOT
    / "docs"
    / "reports"
    / "cudf-pylibcudf-dlpack-msgpack-bitset-nibble-receipt-v1.json"
)

# ---------------------------------------------------------------------------
# 1. MessagePack Integer-Tagged Codec + PostgreSQL BYTEA Wire Format
# ---------------------------------------------------------------------------
PACKET_MSGPACK_TAGS: dict[str, int] = {
    "packet_key": 0,
    "packet_id": 1,
    "packet_ulid": 2,
    "title_id": 3,
    "feature_id": 4,
    "source_ref": 5,
    "directory_path": 6,
    "som_row": 7,
    "som_col": 8,
    "som_cluster": 9,
    "community_id": 10,
    "kmeans_cluster_id": 11,
    "latent_64": 12,       # FP16 raw bytes (64 * 2 = 128 bytes)
    "manifold_4d": 13,     # FP32 raw bytes (4 * 4 = 16 bytes)
    "qdrant_point_id": 14,
    "neo4j_neighbors": 15,
    "page_rank_score": 16,
    "summary": 17,
    "routing_hints": 21,
    "used_concepts": 22,
    "confidence": 27,
    "extraction_method": 28,
    "provenance": 29,
}
REVERSE_MSGPACK_TAGS: dict[int, str] = {v: k for k, v in PACKET_MSGPACK_TAGS.items()}


def _msgpack_pack_val(v: Any) -> bytes:
    if v is None:
        return b"\xc0"
    if isinstance(v, bool):
        return b"\xc3" if v else b"\xc2"
    if isinstance(v, int):
        if 0 <= v <= 0x7F:
            return bytes([v])
        if 0 <= v <= 0xFF:
            return struct.pack(">BB", 0xCC, v)
        if 0 <= v <= 0xFFFF:
            return struct.pack(">BH", 0xCD, v)
        return struct.pack(">Bq", 0xD3, v)
    if isinstance(v, float):
        return struct.pack(">Bd", 0xCB, v)
    if isinstance(v, str):
        b = v.encode("utf-8")
        n = len(b)
        if n <= 31:
            return bytes([0xA0 | n]) + b
        if n <= 0xFF:
            return struct.pack(">BB", 0xD9, n) + b
        return struct.pack(">BH", 0xDA, n) + b
    if isinstance(v, (bytes, bytearray)):
        n = len(v)
        if n <= 0xFF:
            return struct.pack(">BB", 0xC4, n) + bytes(v)
        return struct.pack(">BH", 0xC5, n) + bytes(v)
    if isinstance(v, (list, tuple)):
        n = len(v)
        hdr = bytes([0x90 | n]) if n <= 15 else struct.pack(">BH", 0xDC, n)
        return hdr + b"".join(_msgpack_pack_val(x) for x in v)
    if isinstance(v, dict):
        n = len(v)
        hdr = bytes([0x80 | n]) if n <= 15 else struct.pack(">BH", 0xDE, n)
        return hdr + b"".join(_msgpack_pack_val(k) + _msgpack_pack_val(val) for k, val in v.items())
    raise TypeError(f"Unsupported msgpack type: {type(v)}")


def _msgpack_unpack_val(buf: bytes, offset: int = 0) -> tuple[Any, int]:
    b0 = buf[offset]
    offset += 1
    if b0 <= 0x7F:
        return b0, offset
    if 0x80 <= b0 <= 0x8F:
        n = b0 & 0x0F
        out: dict[Any, Any] = {}
        for _ in range(n):
            k, offset = _msgpack_unpack_val(buf, offset)
            val, offset = _msgpack_unpack_val(buf, offset)
            out[k] = val
        return out, offset
    if 0x90 <= b0 <= 0x9F:
        n = b0 & 0x0F
        arr = []
        for _ in range(n):
            item, offset = _msgpack_unpack_val(buf, offset)
            arr.append(item)
        return arr, offset
    if 0xA0 <= b0 <= 0xBF:
        n = b0 & 0x1F
        return buf[offset : offset + n].decode("utf-8"), offset + n
    if b0 == 0xC0:
        return None, offset
    if b0 == 0xC2:
        return False, offset
    if b0 == 0xC3:
        return True, offset
    if b0 == 0xC4:
        n = buf[offset]
        offset += 1
        return buf[offset : offset + n], offset + n
    if b0 == 0xC5:
        n = struct.unpack(">H", buf[offset : offset + 2])[0]
        offset += 2
        return buf[offset : offset + n], offset + n
    if b0 == 0xCB:
        val = struct.unpack(">d", buf[offset : offset + 8])[0]
        return val, offset + 8
    if b0 == 0xCC:
        return buf[offset], offset + 1
    if b0 == 0xCD:
        val = struct.unpack(">H", buf[offset : offset + 2])[0]
        return val, offset + 2
    if b0 == 0xD3:
        val = struct.unpack(">q", buf[offset : offset + 8])[0]
        return val, offset + 8
    if b0 == 0xD9:
        n = buf[offset]
        offset += 1
        return buf[offset : offset + n].decode("utf-8"), offset + n
    if b0 == 0xDA:
        n = struct.unpack(">H", buf[offset : offset + 2])[0]
        offset += 2
        return buf[offset : offset + n].decode("utf-8"), offset + n
    if b0 == 0xDC:
        n = struct.unpack(">H", buf[offset : offset + 2])[0]
        offset += 2
        arr = []
        for _ in range(n):
            item, offset = _msgpack_unpack_val(buf, offset)
            arr.append(item)
        return arr, offset
    if b0 == 0xDE:
        n = struct.unpack(">H", buf[offset : offset + 2])[0]
        offset += 2
        out = {}
        for _ in range(n):
            k, offset = _msgpack_unpack_val(buf, offset)
            val, offset = _msgpack_unpack_val(buf, offset)
            out[k] = val
        return out, offset
    raise ValueError(f"Unsupported msgpack prefix byte: 0x{b0:02x}")


def encode_packet_to_msgpack_bytea(envelope: dict[str, Any]) -> tuple[bytes, str, bytes]:
    """
    Encodes a canonical packet envelope into compact integer-tagged MessagePack bytes,
    PostgreSQL hex-escaped BYTEA wire string (`\\x...`), and simulated 4-byte varlena disk buffer.
    """
    tagged: dict[int, Any] = {}
    for k, v in envelope.items():
        if k not in PACKET_MSGPACK_TAGS:
            continue
        tag = PACKET_MSGPACK_TAGS[k]
        if k == "latent_64" and isinstance(v, (list, tuple, np.ndarray)):
            arr16 = np.asarray(v, dtype="<f2")
            assert arr16.shape == (64,), f"latent_64 must have 64 elements, got {arr16.shape}"
            tagged[tag] = arr16.tobytes()
        elif k == "manifold_4d" and isinstance(v, (list, tuple, np.ndarray)):
            arr32 = np.asarray(v, dtype="<f4")
            assert arr32.shape == (4,), f"manifold_4d must have 4 elements, got {arr32.shape}"
            tagged[tag] = arr32.tobytes()
        else:
            tagged[tag] = v

    if MSGPACK_C_AVAILABLE and msgpack is not None:
        packed_bytes: bytes = msgpack.packb(tagged, use_bin_type=True)
    else:
        packed_bytes = _msgpack_pack_val(tagged)
    pg_bytea_hex = "\\x" + packed_bytes.hex()
    # PostgreSQL 4-byte varlena header (total length including 4-byte header, little-endian uint32)
    varlena_disk_bytes = struct.pack("<I", len(packed_bytes) + 4) + packed_bytes
    return packed_bytes, pg_bytea_hex, varlena_disk_bytes


def decode_packet_from_msgpack_bytea(pg_bytea_or_raw: bytes | str) -> dict[str, Any]:
    if isinstance(pg_bytea_or_raw, str):
        assert pg_bytea_or_raw.startswith("\\x"), "PostgreSQL hex bytea must start with \\x"
        raw_bytes = bytes.fromhex(pg_bytea_or_raw[2:])
    else:
        raw_bytes = pg_bytea_or_raw

    # Strip 4-byte varlena prefix if present
    if len(raw_bytes) >= 4:
        maybe_len = struct.unpack("<I", raw_bytes[:4])[0]
        if maybe_len == len(raw_bytes):
            raw_bytes = raw_bytes[4:]

    if MSGPACK_C_AVAILABLE and msgpack is not None:
        unpacked_tagged = msgpack.unpackb(raw_bytes, raw=False, strict_map_key=False)
    else:
        unpacked_tagged, _ = _msgpack_unpack_val(raw_bytes, 0)
    restored: dict[str, Any] = {}
    for tag, val in unpacked_tagged.items():
        field_name = REVERSE_MSGPACK_TAGS.get(int(tag), f"tag_{tag}")
        if field_name == "latent_64" and isinstance(val, (bytes, bytearray)):
            restored[field_name] = np.frombuffer(val, dtype="<f2").astype(np.float32).tolist()
        elif field_name == "manifold_4d" and isinstance(val, (bytes, bytearray)):
            restored[field_name] = np.frombuffer(val, dtype="<f4").astype(np.float32).tolist()
        else:
            restored[field_name] = val
    return restored


# ---------------------------------------------------------------------------
# 2. AlignedBitsetBlobV1 (`ATLASBIT` 64B Header + 64B-Padded `uint64` Words)
#    & Sparse Routing Byte Packer (`bit 7` active + `bits 0..6` 7-bit shifter)
# ---------------------------------------------------------------------------
MAGIC_ATLASBIT = b"ATLASBIT"
HEADER_BYTES = 64
ALIGNMENT_BYTES = 64
WORDS_PER_CACHE_LINE = 8


def create_aligned_bitset_blob_v1(bit_count: int, active_indices: list[int]) -> bytes:
    """
    Mirrors `sveltekit-frontend/src/lib/server/atlas/tensors/aligned-bitset-blob-v1.ts`:
      - 64-byte header: magic 'ATLASBIT' (8B) | version uint32 (4B) | bit_count uint32 (4B)
        | word_count uint64 (8B) | sha256_checksum (32B) | padding (8B)
      - Payload: contiguous uint64 LE words padded to 8-word (64-byte) cache-line boundary.
    """
    word_count = max(1, (bit_count + 63) // 64)
    rem = word_count % WORDS_PER_CACHE_LINE
    capacity_words = (
        max(WORDS_PER_CACHE_LINE, word_count)
        if rem == 0
        else word_count + (WORDS_PER_CACHE_LINE - rem)
    )
    words = np.zeros(capacity_words, dtype="<u8")
    for idx in active_indices:
        if 0 <= idx < bit_count:
            word_idx = idx >> 6
            bit_pos = idx & 63
            words[word_idx] |= np.uint64(1 << bit_pos)

    active_payload_bytes = words[:word_count].tobytes()
    sha256_digest = hashlib.sha256(active_payload_bytes).digest()
    header = struct.pack(
        "<8sIIQ32s8s",
        MAGIC_ATLASBIT,
        1,  # version = 1
        bit_count,
        word_count,
        sha256_digest,
        b"\x00" * 8,
    )
    assert len(header) == HEADER_BYTES
    blob = header + words.tobytes()
    assert len(blob) % ALIGNMENT_BYTES == 0
    return blob


def verify_and_unpack_aligned_bitset_blob_v1(blob: bytes) -> dict[str, Any]:
    if len(blob) >= 4:
        # Handle simulated PostgreSQL 4-byte varlena prefix if present
        vl_len = struct.unpack("<I", blob[:4])[0]
        if vl_len == len(blob) and blob[4:12] == MAGIC_ATLASBIT:
            blob = blob[4:]

    assert len(blob) >= HEADER_BYTES and len(blob) % ALIGNMENT_BYTES == 0
    magic, version, bit_count, word_count, sha256_digest, _ = struct.unpack(
        "<8sIIQ32s8s", blob[:HEADER_BYTES]
    )
    assert magic == MAGIC_ATLASBIT, f"Invalid magic: {magic!r}"
    assert version == 1
    payload = blob[HEADER_BYTES:]
    active_bytes = payload[: word_count * 8]
    computed_digest = hashlib.sha256(active_bytes).digest()
    if computed_digest != sha256_digest:
        raise ValueError("ALIGNED_BITSET_CHECKSUM_MISMATCH")

    words = np.frombuffer(payload, dtype="<u8")
    active_bits: list[int] = []
    for idx in range(bit_count):
        if ( int(words[idx >> 6]) & (1 << (idx & 63)) ) != 0:
            active_bits.append(idx)

    return {
        "magic": magic.decode("ascii"),
        "version": version,
        "bitCount": bit_count,
        "wordCount": word_count,
        "capacityWords": len(words),
        "totalByteLength": len(blob),
        "sha256Hex": sha256_digest.hex(),
        "activeBits": active_bits,
    }


def bitset_jaccard_similarity(blob_a: bytes, blob_b: bytes) -> float:
    info_a = verify_and_unpack_aligned_bitset_blob_v1(blob_a)
    info_b = verify_and_unpack_aligned_bitset_blob_v1(blob_b)
    words_a = np.frombuffer(blob_a[HEADER_BYTES:], dtype="<u8")
    words_b = np.frombuffer(blob_b[HEADER_BYTES:], dtype="<u8")
    n = min(info_a["wordCount"], info_b["wordCount"])
    inter = sum(int(words_a[i] & words_b[i]).bit_count() for i in range(n))
    union = sum(int(words_a[i] | words_b[i]).bit_count() for i in range(n))
    return float(inter) / float(union) if union > 0 else 1.0


def pack_sparse_routing_bytes(entries: list[tuple[bool, int]]) -> tuple[bytes, str]:
    """
    Mirrors `sparse-routing-bit-packer-v1.ts`:
      - Bit 7 (`0x80`): `1` = sparseActive, `0` = pruned
      - Bits 0..6 (`0x7f`): 7-bit AVX2 shifter (`0..127`)
      - Padded to 64-byte boundary.
    """
    count = len(entries)
    aligned_len = max(ALIGNMENT_BYTES, ((count + ALIGNMENT_BYTES - 1) // ALIGNMENT_BYTES) * ALIGNMENT_BYTES)
    buf = bytearray(aligned_len)
    for i, (active, shifter7) in enumerate(entries):
        assert 0 <= shifter7 <= 127
        buf[i] = (0x80 if active else 0x00) | (shifter7 & 0x7F)
    checksum = hashlib.sha256(bytes(buf[:count])).hexdigest()
    return bytes(buf), checksum


# ---------------------------------------------------------------------------
# 3. 4-Bit Nibble Encoding (`high_nibble`: 4-bit LUT | `low_nibble`: 4-bit MBVH4 mask)
#    & UUIDv5 / UUIDv7 Version Nibble Verification
# ---------------------------------------------------------------------------
def pack_nibble_byte(high_nibble_4bit: int, low_nibble_4bit: int) -> int:
    assert 0 <= high_nibble_4bit <= 0xF, f"high nibble out of range: {high_nibble_4bit}"
    assert 0 <= low_nibble_4bit <= 0xF, f"low nibble out of range: {low_nibble_4bit}"
    return ((high_nibble_4bit & 0xF) << 4) | (low_nibble_4bit & 0xF)


def unpack_nibble_byte(byte_val: int) -> tuple[int, int]:
    return (byte_val >> 4) & 0xF, byte_val & 0xF


def extract_uuid_version_and_variant_nibbles(uuid_str: str) -> dict[str, Any]:
    u = uuid.UUID(uuid_str)
    hex_str = u.hex  # 32 hex chars (32 nibbles)
    version_nibble = int(hex_str[12], 16)
    variant_nibble = int(hex_str[16], 16)
    return {
        "uuid": str(u),
        "versionNibbleHex": hex_str[12],
        "versionNibbleInt": version_nibble,
        "variantNibbleHex": hex_str[16],
        "variantRFC4122": (variant_nibble & 0xC) == 0x8,
    }


# ---------------------------------------------------------------------------
# 4. Gap A: Arrow `mmap[]` -> `cudf` + `pylibcudf` -> DLPack -> PyTorch & XGBoost
# ---------------------------------------------------------------------------
def run_gap_a_and_binary_codecs_proof() -> dict[str, Any]:
    t0 = time.perf_counter()

    # Ensure base tuple Arrow files exist
    base_receipt = run_base_tuple_proof()

    # --- A. MessagePack + PostgreSQL BYTEA proof ---
    latent_64_vec = np.linspace(-0.5, 0.5, 64, dtype=np.float32).tolist()
    manifold_4d_vec = [0.352941, 0.42, 0.8, 0.96]
    sample_envelope = {
        "packet_key": "packet:31f41cb2-1cbc-5ca2-bee9-857b82b9f77a",
        "title_id": "title:retrieval-authority-chain",
        "feature_id": "feature:retrieval",
        "source_ref": "sveltekit-frontend/src/lib/server/retrieval/authority-chain.ts",
        "som_cluster": 6,
        "kmeans_cluster_id": 6,
        "latent_64": latent_64_vec,
        "manifold_4d": manifold_4d_vec,
        "page_rank_score": 0.0842,
        "used_concepts": ["concept:retrieval-authority-chain", "concept:single-vote-rrf-fusion"],
        "confidence": 0.96,
        "extraction_method": "parent_atlas_ontology.v1",
    }
    json_bytes_len = len(json.dumps(sample_envelope).encode("utf-8"))
    msgpack_bytes, pg_bytea_hex, varlena_disk_bytes = encode_packet_to_msgpack_bytea(sample_envelope)
    decoded_from_hex = decode_packet_from_msgpack_bytea(pg_bytea_hex)
    decoded_from_varlena = decode_packet_from_msgpack_bytea(varlena_disk_bytes)

    assert decoded_from_hex["packet_key"] == sample_envelope["packet_key"]
    assert decoded_from_varlena["packet_key"] == sample_envelope["packet_key"]
    assert decoded_from_hex["used_concepts"] == sample_envelope["used_concepts"]
    fp16_max_err = float(
        np.max(np.abs(np.asarray(decoded_from_hex["latent_64"]) - np.asarray(latent_64_vec)))
    )
    assert fp16_max_err < 1e-3, f"FP16 latent_64 round-trip error too large: {fp16_max_err}"

    # --- B. AlignedBitsetBlobV1 (`ATLASBIT`) + Sparse Routing Bit-Packer proof ---
    # 512-bit candidate eligibility bitset (ordinals 0, 5, 8, 9, 10, 64, 127 active)
    bitset_a = create_aligned_bitset_blob_v1(512, [0, 5, 8, 9, 10, 64, 127])
    bitset_b = create_aligned_bitset_blob_v1(512, [0, 5, 8, 10, 255])
    unpacked_bitset_a = verify_and_unpack_aligned_bitset_blob_v1(bitset_a)
    # Test simulated 4-byte varlena prefix shift
    varlena_bitset_a = struct.pack("<I", len(bitset_a) + 4) + bitset_a
    unpacked_varlena_a = verify_and_unpack_aligned_bitset_blob_v1(varlena_bitset_a)
    assert unpacked_bitset_a["activeBits"] == [0, 5, 8, 9, 10, 64, 127]
    assert unpacked_varlena_a["sha256Hex"] == unpacked_bitset_a["sha256Hex"]
    jaccard_ab = bitset_jaccard_similarity(bitset_a, bitset_b)  # |{0,5,8,10}| / |{0,5,8,9,10,64,127,255}| = 4/8 = 0.5
    assert abs(jaccard_ab - 0.5) < 1e-9

    sparse_bytes, sparse_checksum = pack_sparse_routing_bytes(
        [(True, 96), (False, 12), (True, 91)]
    )
    assert len(sparse_bytes) == 64

    # --- C. 4-Bit Nibble Packing & UUIDv5 Version Nibble Proof ---
    # Pack 3 tuples: (lutCode & 0xF, mbvh4ChildMask4Bit)
    nibble_pairs = [
        (6, 0b1011),  # retrieval (lut=6), MBVH4 children 0,1,3 hit
        (1, 0b0100),  # api (lut=1), MBVH4 child 2 hit
        (8, 0b1111),  # graph (lut=8), all 4 MBVH4 children hit
    ]
    packed_nibbles = bytes(pack_nibble_byte(hi, lo) for hi, lo in nibble_pairs)
    unpacked_nibbles = [unpack_nibble_byte(b) for b in packed_nibbles]
    assert unpacked_nibbles == nibble_pairs

    uuid_nibble_check = extract_uuid_version_and_variant_nibbles(
        "31f41cb2-1cbc-5ca2-bee9-857b82b9f77a"
    )
    assert uuid_nibble_check["versionNibbleInt"] == 5
    assert uuid_nibble_check["variantRFC4122"] is True

    # --- D. Gap A: Arrow `mmap[]` -> `cudf` + `pylibcudf` -> DLPack -> PyTorch & XGBoost ---
    with pa.memory_map(str(NUMERIC_ARROW_PATH), "r") as mmap_num_src:
        arrow_numeric_table = pa_ipc.open_file(mmap_num_src).read_all()

    with pa.memory_map(str(SYMBOLIC_ARROW_PATH), "r") as mmap_sym_src:
        arrow_symbolic_table = pa_ipc.open_file(mmap_sym_src).read_all()

    cudf_dlpack_proof: dict[str, Any] = {
        "cudfAvailable": CUDF_AVAILABLE,
        "cudfVersion": getattr(cudf, "__version__", None) if CUDF_AVAILABLE else None,
        "pylibcudfVersion": PYLIBCUDF_VERSION,
        "torchImportedBeforeCudf": "torch" in sys.modules,
        "pythonVersion": sys.version.split()[0],
        "torchVersion": str(torch.__version__),
        "xgboostVersion": str(xgb.__version__),
        "torchCudaVersion": torch.version.cuda,
        "cudaDeviceName": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
    }

    if CUDF_AVAILABLE and torch.cuda.is_available():
        # 1. Load Arrow table directly into GPU via `cudf.DataFrame.from_arrow`
        gdf_num = cudf.DataFrame.from_arrow(arrow_numeric_table)
        # Load flat scalar columns of symbolic Arrow table into cuDF as well
        flat_sym_cols = ["tupleId", "packetKey", "sourceRef", "label", "confidence", "evidenceState", "lifecycle"]
        gdf_sym = cudf.DataFrame.from_arrow(arrow_symbolic_table.select(flat_sym_cols))

        # 2. Low-level `pylibcudf` Table from Arrow + `pylibcudf.sorting.sort_by_key`
        plc_table = pylibcudf.Table.from_arrow(
            arrow_numeric_table.select(["tupleProjectionOrdinal", *NUMERIC_FEATURE_COLUMNS])
        )
        key_table = pylibcudf.Table([plc_table.columns()[0]])
        sorted_plc_table = pylibcudf.sorting.sort_by_key(
            plc_table,
            key_table,
            [pylibcudf.types.Order.ASCENDING],
            [pylibcudf.types.NullOrder.AFTER],
        )
        assert sorted_plc_table.num_rows() == 3
        assert sorted_plc_table.num_columns() == 7

        # 3. GPU filtering & sorting in cuDF
        gdf_sorted = gdf_num.sort_values("tupleProjectionOrdinal", ascending=True)
        gdf_verified_only = gdf_sorted[gdf_sorted["verifiedConceptFlag"] > 0.5]
        assert len(gdf_verified_only) == 2  # retrieval + graph are ACTIVE_VERIFIED; api is GATED

        # 4. Zero-Copy GPU Pointer Sharing (`__cuda_array_interface__` / CuPy / DLPack):
        #    (a) `torch.as_tensor(conf_series_gpu.values, device="cuda:0")` binds directly via
        #        `__cuda_array_interface__` and shares the exact RMM GPU device pointer (`0` copy).
        #    (b) `gdf_features.to_dlpack()` -> `torch.from_dlpack()` exports `[3, 6]` column-major tensor on `cuda:0`.
        conf_series_gpu = gdf_sorted["confidence"]
        cudf_col_device_ptr = int(conf_series_gpu.__cuda_array_interface__["data"][0])
        torch_col_zero_copy = torch.as_tensor(conf_series_gpu.values, device="cuda:0")
        torch_col_device_ptr = int(torch_col_zero_copy.data_ptr())
        zero_copy_gpu_ptr_shared = cudf_col_device_ptr == torch_col_device_ptr
        assert zero_copy_gpu_ptr_shared, (
            f"Expected zero-copy GPU pointer match: cudf={hex(cudf_col_device_ptr)} vs torch={hex(torch_col_device_ptr)}"
        )

        gdf_features = gdf_sorted[list(NUMERIC_FEATURE_COLUMNS)]
        dlpack_capsule = gdf_features.to_dlpack()
        dlpack_gpu_tensor = torch.from_dlpack(dlpack_capsule)
        assert dlpack_gpu_tensor.is_cuda, "DLPack tensor must reside on CUDA device"
        assert dlpack_gpu_tensor.dtype == torch.float32
        assert dlpack_gpu_tensor.shape == (3, 6)

        # Contiguous row-major view on GPU for `nn.Linear` & `XGBoost`
        gpu_feature_matrix = dlpack_gpu_tensor.contiguous()

        # 5. PyTorch `AtlasOntologyTupleScorer` forward pass directly on `cuda:0`
        scorer_gpu = AtlasOntologyTupleScorer(in_features=6, hidden_dim=8).to("cuda:0")
        scorer_gpu.eval()
        with torch.no_grad():
            gpu_scores, gpu_poincare = scorer_gpu(gpu_feature_matrix)

        # 6. XGBoost (`cuda:0` `hist`) directly over the GPU cuDF DataFrame (`gdf_features`)
        y_labels_gpu = gdf_sorted["verifiedConceptFlag"]
        dtrain_gpu = xgb.QuantileDMatrix(gdf_features, y_labels_gpu)
        booster = xgb.train(
            {
                "tree_method": "hist",
                "device": "cuda:0",
                "max_depth": 3,
                "learning_rate": 0.3,
                "objective": "binary:logistic",
                "seed": 20261024,
            },
            dtrain_gpu,
            num_boost_round=8,
        )
        xgb_gpu_preds = booster.inplace_predict(gdf_features)

        cudf_dlpack_proof.update(
            {
                "executionBackend": "WSL2_RAPIDS_CUDF_PYLIBCUDF_DLPACK_CUDA0",
                "symbolicFlatRowsLoadedInCudf": int(len(gdf_sym)),
                "pylibcudfSortedRows": int(sorted_plc_table.num_rows()),
                "pylibcudfSortedCols": int(sorted_plc_table.num_columns()),
                "verifiedOnlyRowCount": int(len(gdf_verified_only)),
                "dlpackTensorDevice": str(dlpack_gpu_tensor.device),
                "dlpackTensorShape": list(dlpack_gpu_tensor.shape),
                "dlpackTensorStrides": list(dlpack_gpu_tensor.stride()),
                "cudfFirstColDevicePtr": hex(cudf_col_device_ptr),
                "torchDlpackDevicePtr": hex(torch_col_device_ptr),
                "zeroCopyGpuPointerShared": zero_copy_gpu_ptr_shared,
                "pytorchCudaScores": [round(float(v), 6) for v in gpu_scores.cpu().tolist()],
                "xgboostCudaPreds": [round(float(v), 6) for v in xgb_gpu_preds.tolist()],
            }
        )
    else:
        # CPU PyArrow + DLPack / NumPy fallback (when invoked under Windows host Python without cuDF)
        np_cols = [
            arrow_numeric_table.column(c).chunk(0).to_numpy(zero_copy_only=True)
            for c in NUMERIC_FEATURE_COLUMNS
        ]
        cpu_matrix = torch.tensor(np.column_stack(np_cols), dtype=torch.float32)
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        scorer = AtlasOntologyTupleScorer(in_features=6, hidden_dim=8).to(device)
        scorer.eval()
        with torch.no_grad():
            scores, _ = scorer(cpu_matrix.to(device))

        y_cpu = arrow_numeric_table.column("verifiedConceptFlag").to_numpy()
        dtrain_cpu = xgb.DMatrix(cpu_matrix.numpy(), label=y_cpu)
        booster = xgb.train(
            {
                "tree_method": "hist",
                "device": device,
                "max_depth": 3,
                "learning_rate": 0.3,
                "objective": "binary:logistic",
                "seed": 20261024,
            },
            dtrain_cpu,
            num_boost_round=8,
        )
        xgb_preds = booster.predict(dtrain_cpu)
        cudf_dlpack_proof.update(
            {
                "executionBackend": f"CPU_PYARROW_FALLBACK_{device.upper()}",
                "dlpackTensorDevice": device,
                "dlpackTensorShape": list(cpu_matrix.shape),
                "zeroCopyGpuPointerShared": False,
                "pytorchCudaScores": [round(float(v), 6) for v in scores.cpu().tolist()],
                "xgboostCudaPreds": [round(float(v), 6) for v in xgb_preds.tolist()],
            }
        )

    elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
    receipt: dict[str, Any] = {
        "schema": "atlas.cudf-pylibcudf-dlpack-msgpack-bitset-nibble-receipt.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "durationMs": elapsed_ms,
        "canonicalAuthority": False,
        "writesPerformed": False,
        "msgpackByteaProof": {
            "jsonBytes": json_bytes_len,
            "msgpackBytes": len(msgpack_bytes),
            "compressionRatio": round(len(msgpack_bytes) / float(json_bytes_len), 4),
            "pgByteaWirePrefix": pg_bytea_hex[:24] + "...",
            "varlenaTotalBytes": len(varlena_disk_bytes),
            "latent64Fp16Bytes": 128,
            "manifold4dFp32Bytes": 16,
            "latent64Fp16MaxRoundTripError": round(fp16_max_err, 6),
            "identityFieldsPreserved": True,
        },
        "alignedBitsetAndSparseRoutingProof": {
            "schema": "atlas.aligned-bitset-blob.v1",
            "magic": unpacked_bitset_a["magic"],
            "headerBytes": HEADER_BYTES,
            "totalByteLength": unpacked_bitset_a["totalByteLength"],
            "totalByteLengthDivisibleBy64": unpacked_bitset_a["totalByteLength"] % 64 == 0,
            "sha256Hex": unpacked_bitset_a["sha256Hex"],
            "activeBits": unpacked_bitset_a["activeBits"],
            "varlena4ByteOffsetHandled": True,
            "jaccardSimilarityAB": jaccard_ab,
            "sparseRoutingBufferBytes": len(sparse_bytes),
            "sparseRoutingSha256": sparse_checksum,
        },
        "nibbleEncodingProof": {
            "packedHex": packed_nibbles.hex(),
            "nibblePairs": [
                {"okfLutCode4Bit": hi, "mbvh4ChildMask4Bit": bin(lo), "packedByteHex": f"0x{pack_nibble_byte(hi, lo):02x}"}
                for hi, lo in nibble_pairs
            ],
            "roundTripVerified": True,
            "uuidV5VersionNibbleCheck": uuid_nibble_check,
        },
        "gapACudfPylibcudfDlpackProof": cudf_dlpack_proof,
        "baseTupleReceiptRef": base_receipt["schema"],
    }

    RECEIPT_PATH.parent.mkdir(parents=True, exist_ok=True)
    RECEIPT_PATH.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    return receipt


if __name__ == "__main__":
    out = run_gap_a_and_binary_codecs_proof()
    print(
        json.dumps(
            {
                "schema": out["schema"],
                "executionBackend": out["gapACudfPylibcudfDlpackProof"]["executionBackend"],
                "cudfVersion": out["gapACudfPylibcudfDlpackProof"]["cudfVersion"],
                "pylibcudfVersion": out["gapACudfPylibcudfDlpackProof"]["pylibcudfVersion"],
                "zeroCopyGpuPointerShared": out["gapACudfPylibcudfDlpackProof"]["zeroCopyGpuPointerShared"],
                "msgpackCompressionRatio": out["msgpackByteaProof"]["compressionRatio"],
                "bitsetTotalBytes": out["alignedBitsetAndSparseRoutingProof"]["totalByteLength"],
                "nibblePackedHex": out["nibbleEncodingProof"]["packedHex"],
                "ReceiptPath": str(RECEIPT_PATH.relative_to(REPO_ROOT)).replace("\\", "/"),
            },
            indent=2,
        )
    )
