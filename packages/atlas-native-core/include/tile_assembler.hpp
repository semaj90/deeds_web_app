#pragma once
/**
 * @file tile_assembler.hpp
 * @brief Proposal-layout helpers for 128-byte LOD tile records and generic
 *        protobuf wire framing. This does not create ATen tensors or CUDA textures.
 */

#include "radix_sort.hpp"
#include "sha256.hpp"
#include "turbovec_pack.hpp"
#include <array>
#include <bit>
#include <cstdint>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace atlas::native {

constexpr std::size_t CUTILE_WARP_TILE_SIZE = 32;

// Protobuf wire types for zero-overhead binary framing ($1..$20)
enum class ProtoWireType : std::uint8_t {
    VARINT = 0,
    FIXED64 = 1,
    LENGTH_DELIMITED = 2,
    FIXED32 = 5
};

constexpr std::uint32_t make_proto_tag(std::uint32_t field_number, ProtoWireType wire_type) noexcept {
    return (field_number << 3u) | static_cast<std::uint32_t>(wire_type);
}

inline void append_varint(std::vector<std::uint8_t>& buf, std::uint64_t value) {
    while (value >= 0x80ULL) {
        buf.push_back(static_cast<std::uint8_t>((value & 0x7FULL) | 0x80ULL));
        value >>= 7u;
    }
    buf.push_back(static_cast<std::uint8_t>(value & 0x7FULL));
}

inline void append_tag(std::vector<std::uint8_t>& buf, std::uint32_t field_num, ProtoWireType wt) {
    append_varint(buf, make_proto_tag(field_num, wt));
}

inline void append_bytes_field(
    std::vector<std::uint8_t>& buf,
    std::uint32_t field_num,
    const void* data,
    std::size_t len
) {
    append_tag(buf, field_num, ProtoWireType::LENGTH_DELIMITED);
    append_varint(buf, len);
    const auto* ptr = static_cast<const std::uint8_t*>(data);
    buf.insert(buf.end(), ptr, ptr + len);
}

inline void append_fixed32_float(std::vector<std::uint8_t>& buf, std::uint32_t field_num, float val) {
    append_tag(buf, field_num, ProtoWireType::FIXED32);
    std::uint32_t bits = 0;
    std::memcpy(&bits, &val, sizeof(float));
    for (unsigned shift = 0; shift < 32; shift += 8) {
        buf.push_back(static_cast<std::uint8_t>((bits >> shift) & 0xFFu));
    }
}

inline void append_uint32_field(std::vector<std::uint8_t>& buf, std::uint32_t field_num, std::uint32_t value) {
    if (value == 0) return;
    append_tag(buf, field_num, ProtoWireType::VARINT);
    append_varint(buf, value);
}

inline void append_bool_field(std::vector<std::uint8_t>& buf, std::uint32_t field_num, bool value) {
    if (!value) return;
    append_tag(buf, field_num, ProtoWireType::VARINT);
    append_varint(buf, 1);
}

inline void append_string_field(std::vector<std::uint8_t>& buf, std::uint32_t field_num, const std::string& value) {
    if (!value.empty()) append_bytes_field(buf, field_num, value.data(), value.size());
}

enum class TensorTileQuantizationV1 : std::uint32_t {
    SIGN_BITSET_1 = 1,
    INT2_AFFINE = 2,
    INT4_AFFINE = 3,
    MIXED_LOD = 4
};

enum class TensorTileLayoutV1 : std::uint32_t {
    SIGN_BITSET_128 = 1,
    TURBOVEC_INT2_128 = 2,
    TURBOVEC_INT4_128 = 3,
    LOD_TILE_128B = 4
};

struct TensorTileDescriptorV1 {
    std::string workspace_revision;
    std::string source_snapshot_digest;
    std::string ordinal_map_digest;
    std::string representation_revision;
    TensorTileQuantizationV1 quantization{TensorTileQuantizationV1::INT2_AFFINE};
    TensorTileLayoutV1 layout{TensorTileLayoutV1::TURBOVEC_INT2_128};
    std::vector<std::uint8_t> payload;
    std::string payload_sha256;
    std::uint32_t candidate_ordinal{0};
};

inline bool is_sha256_reference(const std::string& value) noexcept {
    if (value.size() != 71 || value.compare(0, 7, "sha256:") != 0) return false;
    return std::all_of(value.begin() + 7, value.end(), [](unsigned char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    });
}

inline std::vector<std::uint8_t> encode_tensor_tile_v1(const TensorTileDescriptorV1& tile) {
    std::size_t expected_bytes = 0;
    switch (tile.layout) {
        case TensorTileLayoutV1::SIGN_BITSET_128: expected_bytes = 16; break;
        case TensorTileLayoutV1::TURBOVEC_INT2_128: expected_bytes = 32; break;
        case TensorTileLayoutV1::TURBOVEC_INT4_128: expected_bytes = 64; break;
        case TensorTileLayoutV1::LOD_TILE_128B: expected_bytes = 128; break;
        default: throw std::invalid_argument("TENSOR_TILE_LAYOUT_UNSUPPORTED");
    }
    if (!is_sha256_reference(tile.workspace_revision) ||
        !is_sha256_reference(tile.source_snapshot_digest) ||
        !is_sha256_reference(tile.ordinal_map_digest) ||
        !is_sha256_reference(tile.payload_sha256) ||
        tile.representation_revision.empty() || tile.payload.size() != expected_bytes) {
        throw std::invalid_argument("TENSOR_TILE_V1_DESCRIPTOR_INVALID");
    }
    if ((tile.layout == TensorTileLayoutV1::SIGN_BITSET_128 && tile.quantization != TensorTileQuantizationV1::SIGN_BITSET_1) ||
        (tile.layout == TensorTileLayoutV1::TURBOVEC_INT2_128 && tile.quantization != TensorTileQuantizationV1::INT2_AFFINE) ||
        (tile.layout == TensorTileLayoutV1::TURBOVEC_INT4_128 && tile.quantization != TensorTileQuantizationV1::INT4_AFFINE) ||
        (tile.layout == TensorTileLayoutV1::LOD_TILE_128B && tile.quantization != TensorTileQuantizationV1::MIXED_LOD)) {
        throw std::invalid_argument("TENSOR_TILE_QUANTIZATION_LAYOUT_MISMATCH");
    }
    if (tile.payload_sha256 != "sha256:" + sha256_hex(tile.payload.data(), tile.payload.size())) {
        throw std::invalid_argument("TENSOR_TILE_PAYLOAD_DIGEST_MISMATCH");
    }

    std::vector<std::uint8_t> encoded;
    append_string_field(encoded, 1, "atlas.tensor-tile.v1");
    append_string_field(encoded, 2, tile.workspace_revision);
    append_string_field(encoded, 3, tile.source_snapshot_digest);
    append_string_field(encoded, 4, tile.ordinal_map_digest);
    append_string_field(encoded, 5, tile.representation_revision);
    append_uint32_field(encoded, 6, 128);
    append_uint32_field(encoded, 7, static_cast<std::uint32_t>(tile.quantization));
    append_uint32_field(encoded, 8, static_cast<std::uint32_t>(tile.layout));
    append_bytes_field(encoded, 9, tile.payload.data(), tile.payload.size());
    append_string_field(encoded, 10, tile.payload_sha256);
    append_uint32_field(encoded, 11, tile.candidate_ordinal);
    append_bool_field(encoded, 12, true);
    return encoded;
}

/**
 * 128-byte LOD texture-layout entry; blocks are 64-byte aligned in C++ containers.
 * This CPU-side layout is not proof of a torch::from_blob or CUDA texture handoff:
 *   - Bytes   0..15  (16B): LOD 0 128-bit sign bitset
 *   - Bytes  16..47  (32B): LOD 1 2-bit MRL-128 packed vector
 *   - Bytes  48..111 (64B): LOD 2 4-bit MRL-128 packed vector
 *   - Bytes 112..127 (16B): Metadata header (candidate_ordinal, som_bmu_id, kmeans_cluster_id, min_val, scale_4bit)
 */
struct alignas(64) LodTextureBlock128B {
    std::uint8_t lod0_sign_bitset[16];
    std::uint8_t lod1_turbovec_2bit[32];
    std::uint8_t lod2_turbovec_4bit[64];
    std::uint32_t candidate_ordinal;
    std::uint16_t som_bmu_id;
    std::uint16_t kmeans_cluster_id;
    float min_val;
    float scale_4bit;
};
static_assert(sizeof(LodTextureBlock128B) == 128, "LodTextureBlock128B must be exactly 128 bytes");

struct CandidateTileRecord {
    std::uint32_t candidate_ordinal{0};
    std::uint32_t tile_index{0};
    std::uint16_t kmeans_cluster_id{0};
    std::uint16_t som_bmu_id{0};
    std::uint32_t start_byte{0};
    std::uint32_t end_byte{0};
    PackedTurboVecBlob packed_vector{};
};

inline LodTextureBlock128B materialize_lod_texture_block(const CandidateTileRecord& record) {
    if (!record.packed_vector.valid) throw std::invalid_argument("TURBOVEC_PACKED_VECTOR_INVALID");
    LodTextureBlock128B block{};
    std::memcpy(block.lod0_sign_bitset, record.packed_vector.sign_bitset_128.data(), sizeof(block.lod0_sign_bitset));
    std::memcpy(block.lod1_turbovec_2bit, record.packed_vector.data_2bit.data(), sizeof(block.lod1_turbovec_2bit));
    std::memcpy(block.lod2_turbovec_4bit, record.packed_vector.data_4bit.data(), sizeof(block.lod2_turbovec_4bit));
    block.candidate_ordinal = record.candidate_ordinal;
    block.som_bmu_id = record.som_bmu_id;
    block.kmeans_cluster_id = record.kmeans_cluster_id;
    block.min_val = record.packed_vector.min_val;
    block.scale_4bit = record.packed_vector.scale_4bit;
    return block;
}

inline void serialize_lod_texture_block_v1(
    const CandidateTileRecord& record,
    std::uint8_t* bytes,
    std::size_t byte_length
) {
    static_assert(sizeof(float) == sizeof(std::uint32_t) && std::numeric_limits<float>::is_iec559);
    if (bytes == nullptr || byte_length != sizeof(LodTextureBlock128B)) {
        throw std::invalid_argument("LOD_TEXTURE_BLOCK_OUTPUT_INVALID");
    }
    const auto block = materialize_lod_texture_block(record);
    std::memcpy(bytes, block.lod0_sign_bitset, sizeof(block.lod0_sign_bitset));
    std::memcpy(bytes + 16, block.lod1_turbovec_2bit, sizeof(block.lod1_turbovec_2bit));
    std::memcpy(bytes + 48, block.lod2_turbovec_4bit, sizeof(block.lod2_turbovec_4bit));

    const auto put_u32_le = [bytes](std::size_t offset, std::uint32_t value) {
        for (unsigned shift = 0; shift < 32; shift += 8) {
            bytes[offset + shift / 8] = static_cast<std::uint8_t>((value >> shift) & 0xffu);
        }
    };
    const auto put_u16_le = [bytes](std::size_t offset, std::uint16_t value) {
        bytes[offset] = static_cast<std::uint8_t>(value & 0xffu);
        bytes[offset + 1] = static_cast<std::uint8_t>((value >> 8u) & 0xffu);
    };
    put_u32_le(112, block.candidate_ordinal);
    put_u16_le(116, block.som_bmu_id);
    put_u16_le(118, block.kmeans_cluster_id);
    put_u32_le(120, std::bit_cast<std::uint32_t>(block.min_val));
    put_u32_le(124, std::bit_cast<std::uint32_t>(block.scale_4bit));
}

inline std::array<std::uint8_t, sizeof(LodTextureBlock128B)> serialize_lod_texture_block_v1(
    const CandidateTileRecord& record
) {
    std::array<std::uint8_t, sizeof(LodTextureBlock128B)> bytes{};
    serialize_lod_texture_block_v1(record, bytes.data(), bytes.size());
    return bytes;
}

struct KernelSwapDescriptor {
    std::string kernel_id;
    std::string corpus_snapshot_id;
    std::string representation_id;
    std::uint32_t tile_count{0};
    std::uint32_t candidate_count{0};
    std::uint64_t residency_bytes{0};
    std::string artifact_checksum;
};

/**
 * Sorts candidate records by (kmeans_cluster_id, som_bmu_id, candidate_ordinal)
 * via LSD Radix Sort and assigns contiguous cuTile indices (32 candidates per warp tile).
 */
inline KernelSwapDescriptor assemble_som_aligned_tiles(
    std::vector<CandidateTileRecord>& records,
    const std::string& kernel_id,
    const std::string& corpus_snapshot_id,
    const std::string& representation_id,
    const std::string& artifact_checksum
) {
    std::vector<SomTileSortEntry> keys(records.size());
    for (std::size_t i = 0; i < records.size(); ++i) {
        keys[i].kmeans_cluster_id = records[i].kmeans_cluster_id;
        keys[i].som_bmu_id = records[i].som_bmu_id;
        keys[i].candidate_ordinal = records[i].candidate_ordinal;
        keys[i].source_index = static_cast<std::uint32_t>(i);
        keys[i].composite_key = pack_som_radix_key(
            records[i].kmeans_cluster_id,
            records[i].som_bmu_id,
            records[i].candidate_ordinal
        );
    }

    radix_sort_som_tiles(keys);

    std::vector<CandidateTileRecord> sorted(records.size());
    for (std::size_t i = 0; i < keys.size(); ++i) {
        sorted[i] = records[keys[i].source_index];
        sorted[i].tile_index = static_cast<std::uint32_t>(i / CUTILE_WARP_TILE_SIZE);
    }
    records.swap(sorted);

    const std::uint32_t tile_count = static_cast<std::uint32_t>(
        (records.size() + CUTILE_WARP_TILE_SIZE - 1) / CUTILE_WARP_TILE_SIZE
    );

    return KernelSwapDescriptor{
        kernel_id,
        corpus_snapshot_id,
        representation_id,
        tile_count,
        static_cast<std::uint32_t>(records.size()),
        static_cast<std::uint64_t>(records.size() * sizeof(LodTextureBlock128B)),
        artifact_checksum
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// TensorHandleV1: 4x4x6 Spatial Tile Feature Buffer Codec (64B Header + 96B Body = 160B)
// ═══════════════════════════════════════════════════════════════════════════

constexpr std::uint32_t TENSOR_HANDLE_V1_MAGIC_LE = 0x54485631u; // "THV1"
constexpr std::uint32_t TENSOR_HANDLE_V1_ENDIAN_LE = 0x01020304u;
constexpr std::size_t TENSOR_HANDLE_V1_HEADER_BYTES = 64;
constexpr std::size_t TENSOR_HANDLE_V1_DIM_X = 4;
constexpr std::size_t TENSOR_HANDLE_V1_DIM_Y = 4;
constexpr std::size_t TENSOR_HANDLE_V1_CHANNELS = 6;
constexpr std::size_t TENSOR_HANDLE_V1_ELEMENT_COUNT =
    TENSOR_HANDLE_V1_DIM_X * TENSOR_HANDLE_V1_DIM_Y * TENSOR_HANDLE_V1_CHANNELS; // 96
constexpr std::size_t TENSOR_HANDLE_V1_INT4_PAYLOAD_BYTES = TENSOR_HANDLE_V1_ELEMENT_COUNT / 2; // 48B
constexpr std::size_t TENSOR_HANDLE_V1_AFFINE_PARAM_BYTES = TENSOR_HANDLE_V1_CHANNELS * 2 * sizeof(float); // 48B
constexpr std::size_t TENSOR_HANDLE_V1_TOTAL_BYTES =
    TENSOR_HANDLE_V1_HEADER_BYTES + TENSOR_HANDLE_V1_INT4_PAYLOAD_BYTES + TENSOR_HANDLE_V1_AFFINE_PARAM_BYTES; // 160B

/**
 * Safer 7-State Residency FSM for TensorHandleV1:
 *   ABSENT -> HOST_STAGED -> GPU_PENDING -> GPU_READY -> IN_USE -> EVICTABLE -> EVICTED
 */
enum class SafeTileResidencyStateV1 : std::uint8_t {
    ABSENT = 0,
    HOST_STAGED = 1,
    GPU_PENDING = 2,
    GPU_READY = 3,
    IN_USE = 4,
    EVICTABLE = 5,
    EVICTED = 6
};

inline SafeTileResidencyStateV1 transition_safe_tile_residency_v1(
    SafeTileResidencyStateV1 current,
    SafeTileResidencyStateV1 target,
    bool transfer_completed,
    std::uint32_t active_consumers,
    bool revision_matched
) {
    if (!revision_matched) {
        return SafeTileResidencyStateV1::ABSENT;
    }
    switch (current) {
        case SafeTileResidencyStateV1::ABSENT:
            if (target == SafeTileResidencyStateV1::HOST_STAGED) return target;
            break;
        case SafeTileResidencyStateV1::HOST_STAGED:
            if (target == SafeTileResidencyStateV1::GPU_PENDING || target == SafeTileResidencyStateV1::EVICTED) return target;
            break;
        case SafeTileResidencyStateV1::GPU_PENDING:
            if (target == SafeTileResidencyStateV1::GPU_READY) {
                if (!transfer_completed) throw std::invalid_argument("SAFE_RESIDENCY_GPU_READY_REQUIRES_TRANSFER_COMPLETE");
                return target;
            }
            break;
        case SafeTileResidencyStateV1::GPU_READY:
            if (target == SafeTileResidencyStateV1::IN_USE || target == SafeTileResidencyStateV1::EVICTABLE) return target;
            break;
        case SafeTileResidencyStateV1::IN_USE:
            if (target == SafeTileResidencyStateV1::GPU_READY) return target;
            if (target == SafeTileResidencyStateV1::EVICTABLE) {
                if (active_consumers > 0) throw std::invalid_argument("SAFE_RESIDENCY_EVICTABLE_REQUIRES_ZERO_CONSUMERS");
                return target;
            }
            break;
        case SafeTileResidencyStateV1::EVICTABLE:
            if (target == SafeTileResidencyStateV1::IN_USE) return target;
            if (target == SafeTileResidencyStateV1::EVICTED) {
                if (active_consumers > 0) throw std::invalid_argument("SAFE_RESIDENCY_EVICT_REQUIRES_ZERO_CONSUMERS");
                return target;
            }
            break;
        case SafeTileResidencyStateV1::EVICTED:
            if (target == SafeTileResidencyStateV1::HOST_STAGED || target == SafeTileResidencyStateV1::ABSENT) return target;
            break;
    }
    throw std::invalid_argument("SAFE_RESIDENCY_TRANSITION_FORBIDDEN");
}

/**
 * Encodes a 96-float (4x4x6) spatial feature tile into a 160-byte aligned binary TensorHandleV1 blob:
 *   - Bytes   0..3   (4B): Magic 0x54485631 ("THV1" LE)
 *   - Bytes   4..7   (4B): Endian Tag 0x01020304 (LE)
 *   - Bytes   8..11  (4B): candidate_ordinal (uint32 LE)
 *   - Bytes  12..13  (2B): kmeans_cluster_id (uint16 LE)
 *   - Bytes  14..15  (2B): som_bmu_id (uint16 LE, 0..399)
 *   - Bytes  16..23  (8B): workspace_revision_prefix64 (uint64 LE)
 *   - Bytes  24..31  (8B): source_revision_prefix64 (uint64 LE)
 *   - Bytes  32..55 (24B): Mode-7 / 2D Affine Transform (a, b, tx, c, d, ty as 6 x float32 LE)
 *   - Byte   56      (1B): SafeTileResidencyStateV1 (uint8)
 *   - Byte   57      (1B): shape_code (0x46 = 4x4x6)
 *   - Bytes  58..59  (2B): active_consumers (uint16 LE)
 *   - Bytes  60..63  (4B): payload_crc_prefix32 (first 4 bytes of SHA-256 over bytes 64..159)
 *   - Bytes  64..111 (48B): 6 channels x (min_c: float32 LE, scale_c: float32 LE)
 *   - Bytes 112..159 (48B): 96 x 4-bit quantized nibbles (2 nibbles per byte: low=even idx, high=odd idx)
 */
inline std::array<std::uint8_t, TENSOR_HANDLE_V1_TOTAL_BYTES> encode_tensor_handle_4x4x6_v1(
    const float* values_96,
    std::uint32_t candidate_ordinal,
    std::uint16_t kmeans_cluster_id,
    std::uint16_t som_bmu_id,
    std::uint64_t workspace_revision_prefix64,
    std::uint64_t source_revision_prefix64,
    const std::array<float, 6>& affine_2x3,
    SafeTileResidencyStateV1 residency_state = SafeTileResidencyStateV1::HOST_STAGED,
    std::uint16_t active_consumers = 0
) {
    if (values_96 == nullptr) throw std::invalid_argument("TENSOR_HANDLE_V1_NULL_VALUES");
    if (som_bmu_id >= 400) throw std::invalid_argument("TENSOR_HANDLE_V1_SOM_BMU_OUT_OF_RANGE");
    for (std::size_t i = 0; i < TENSOR_HANDLE_V1_ELEMENT_COUNT; ++i) {
        if (!std::isfinite(values_96[i])) throw std::invalid_argument("TENSOR_HANDLE_V1_NONFINITE_VALUE");
    }
    for (float a : affine_2x3) {
        if (!std::isfinite(a)) throw std::invalid_argument("TENSOR_HANDLE_V1_NONFINITE_AFFINE");
    }

    std::array<std::uint8_t, TENSOR_HANDLE_V1_TOTAL_BYTES> buf{};
    const auto put_u16 = [&buf](std::size_t off, std::uint16_t v) {
        buf[off] = static_cast<std::uint8_t>(v & 0xFFu);
        buf[off + 1] = static_cast<std::uint8_t>((v >> 8u) & 0xFFu);
    };
    const auto put_u32 = [&buf](std::size_t off, std::uint32_t v) {
        for (unsigned s = 0; s < 32; s += 8) buf[off + s / 8] = static_cast<std::uint8_t>((v >> s) & 0xFFu);
    };
    const auto put_u64 = [&buf](std::size_t off, std::uint64_t v) {
        for (unsigned s = 0; s < 64; s += 8) buf[off + s / 8] = static_cast<std::uint8_t>((v >> s) & 0xFFULL);
    };
    const auto put_f32 = [&put_u32](std::size_t off, float v) {
        put_u32(off, std::bit_cast<std::uint32_t>(v));
    };

    // Per-channel affine quantization (6 channels, 16 spatial cells per channel)
    std::array<float, TENSOR_HANDLE_V1_CHANNELS> ch_min{};
    std::array<float, TENSOR_HANDLE_V1_CHANNELS> ch_scale{};
    ch_min.fill(1e9f);
    std::array<float, TENSOR_HANDLE_V1_CHANNELS> ch_max{};
    ch_max.fill(-1e9f);

    for (std::size_t cell = 0; cell < 16; ++cell) {
        for (std::size_t ch = 0; ch < TENSOR_HANDLE_V1_CHANNELS; ++ch) {
            const float v = values_96[cell * TENSOR_HANDLE_V1_CHANNELS + ch];
            if (v < ch_min[ch]) ch_min[ch] = v;
            if (v > ch_max[ch]) ch_max[ch] = v;
        }
    }
    for (std::size_t ch = 0; ch < TENSOR_HANDLE_V1_CHANNELS; ++ch) {
        const float range = std::max(ch_max[ch] - ch_min[ch], 1e-8f);
        ch_scale[ch] = range / 15.0f;
        put_f32(64 + ch * 8, ch_min[ch]);
        put_f32(64 + ch * 8 + 4, ch_scale[ch]);
    }

    // Pack 96 nibbles into bytes 112..159 (low nibble = even index, high nibble = odd index)
    for (std::size_t idx = 0; idx < TENSOR_HANDLE_V1_ELEMENT_COUNT; idx += 2) {
        const std::size_t ch0 = idx % TENSOR_HANDLE_V1_CHANNELS;
        const std::size_t ch1 = (idx + 1) % TENSOR_HANDLE_V1_CHANNELS;
        const float n0 = std::clamp((values_96[idx] - ch_min[ch0]) / (ch_scale[ch0] * 15.0f), 0.0f, 1.0f);
        const float n1 = std::clamp((values_96[idx + 1] - ch_min[ch1]) / (ch_scale[ch1] * 15.0f), 0.0f, 1.0f);
        const auto q0 = static_cast<std::uint8_t>(std::lround(n0 * 15.0f)) & 0x0Fu;
        const auto q1 = static_cast<std::uint8_t>(std::lround(n1 * 15.0f)) & 0x0Fu;
        buf[112 + idx / 2] = static_cast<std::uint8_t>(q0 | (q1 << 4u));
    }

    const std::string body_sha = sha256_hex(buf.data() + 64, 96);
    std::uint32_t crc_prefix = 0;
    for (unsigned i = 0; i < 4; ++i) {
        const auto hi = body_sha[i * 2];
        const auto lo = body_sha[i * 2 + 1];
        const auto nib = [](char c) -> std::uint8_t {
            return (c >= '0' && c <= '9') ? static_cast<std::uint8_t>(c - '0') : static_cast<std::uint8_t>(10 + (c - 'a'));
        };
        crc_prefix |= (static_cast<std::uint32_t>((nib(hi) << 4u) | nib(lo)) << (i * 8));
    }

    put_u32(0, TENSOR_HANDLE_V1_MAGIC_LE);
    put_u32(4, TENSOR_HANDLE_V1_ENDIAN_LE);
    put_u32(8, candidate_ordinal);
    put_u16(12, kmeans_cluster_id);
    put_u16(14, som_bmu_id);
    put_u64(16, workspace_revision_prefix64);
    put_u64(24, source_revision_prefix64);
    for (std::size_t a_idx = 0; a_idx < 6; ++a_idx) {
        put_f32(32 + a_idx * 4, affine_2x3[a_idx]);
    }
    buf[56] = static_cast<std::uint8_t>(residency_state);
    buf[57] = 0x46u; // 4x4x6 shape code
    put_u16(58, active_consumers);
    put_u32(60, crc_prefix);
    return buf;
}

inline std::array<float, TENSOR_HANDLE_V1_ELEMENT_COUNT> decode_tensor_handle_4x4x6_v1(
    const std::uint8_t* bytes,
    std::size_t byte_length,
    std::uint64_t expected_workspace_revision_prefix64
) {
    if (bytes == nullptr || byte_length != TENSOR_HANDLE_V1_TOTAL_BYTES) {
        throw std::invalid_argument("TENSOR_HANDLE_V1_BYTE_LENGTH_INVALID");
    }
    const auto get_u32 = [bytes](std::size_t off) -> std::uint32_t {
        return static_cast<std::uint32_t>(bytes[off]) |
               (static_cast<std::uint32_t>(bytes[off + 1]) << 8u) |
               (static_cast<std::uint32_t>(bytes[off + 2]) << 16u) |
               (static_cast<std::uint32_t>(bytes[off + 3]) << 24u);
    };
    const auto get_u64 = [bytes](std::size_t off) -> std::uint64_t {
        std::uint64_t v = 0;
        for (unsigned s = 0; s < 64; s += 8) {
            v |= (static_cast<std::uint64_t>(bytes[off + s / 8]) << s);
        }
        return v;
    };
    const auto get_f32 = [&get_u32](std::size_t off) -> float {
        return std::bit_cast<float>(get_u32(off));
    };

    if (get_u32(0) != TENSOR_HANDLE_V1_MAGIC_LE) throw std::invalid_argument("TENSOR_HANDLE_V1_MAGIC_MISMATCH");
    if (get_u32(4) != TENSOR_HANDLE_V1_ENDIAN_LE) throw std::invalid_argument("TENSOR_HANDLE_V1_ENDIAN_MISMATCH");
    if (bytes[57] != 0x46u) throw std::invalid_argument("TENSOR_HANDLE_V1_SHAPE_CODE_MISMATCH");
    if (get_u64(16) != expected_workspace_revision_prefix64) {
        throw std::invalid_argument("TENSOR_HANDLE_V1_STALE_WORKSPACE_REVISION");
    }

    const std::string body_sha = sha256_hex(bytes + 64, 96);
    std::uint32_t crc_prefix = 0;
    for (unsigned i = 0; i < 4; ++i) {
        const auto hi = body_sha[i * 2];
        const auto lo = body_sha[i * 2 + 1];
        const auto nib = [](char c) -> std::uint8_t {
            return (c >= '0' && c <= '9') ? static_cast<std::uint8_t>(c - '0') : static_cast<std::uint8_t>(10 + (c - 'a'));
        };
        crc_prefix |= (static_cast<std::uint32_t>((nib(hi) << 4u) | nib(lo)) << (i * 8));
    }
    if (get_u32(60) != crc_prefix) throw std::invalid_argument("TENSOR_HANDLE_V1_BODY_CHECKSUM_MISMATCH");

    std::array<float, TENSOR_HANDLE_V1_CHANNELS> ch_min{};
    std::array<float, TENSOR_HANDLE_V1_CHANNELS> ch_scale{};
    for (std::size_t ch = 0; ch < TENSOR_HANDLE_V1_CHANNELS; ++ch) {
        ch_min[ch] = get_f32(64 + ch * 8);
        ch_scale[ch] = get_f32(64 + ch * 8 + 4);
    }

    std::array<float, TENSOR_HANDLE_V1_ELEMENT_COUNT> out{};
    for (std::size_t idx = 0; idx < TENSOR_HANDLE_V1_ELEMENT_COUNT; idx += 2) {
        const std::uint8_t packed = bytes[112 + idx / 2];
        const std::uint8_t q0 = packed & 0x0Fu;
        const std::uint8_t q1 = (packed >> 4u) & 0x0Fu;
        const std::size_t ch0 = idx % TENSOR_HANDLE_V1_CHANNELS;
        const std::size_t ch1 = (idx + 1) % TENSOR_HANDLE_V1_CHANNELS;
        out[idx] = ch_min[ch0] + static_cast<float>(q0) * ch_scale[ch0];
        out[idx + 1] = ch_min[ch1] + static_cast<float>(q1) * ch_scale[ch1];
    }
    return out;
}

/**
 * Applies the Mode-7 / 2D affine transform [a, b, tx, c, d, ty] to a 2D tile coordinate (u, v):
 *   x_world = a * u + b * v + tx
 *   y_world = c * u + d * v + ty
 */
inline std::array<float, 2> project_mode7_affine_2x3_v1(
    const std::array<float, 6>& affine_2x3,
    float u,
    float v
) {
    if (!std::isfinite(u) || !std::isfinite(v)) {
        throw std::invalid_argument("TENSOR_HANDLE_V1_NONFINITE_COORDINATE");
    }
    for (float coeff : affine_2x3) {
        if (!std::isfinite(coeff)) throw std::invalid_argument("TENSOR_HANDLE_V1_NONFINITE_AFFINE");
    }
    const float x = affine_2x3[0] * u + affine_2x3[1] * v + affine_2x3[2];
    const float y = affine_2x3[3] * u + affine_2x3[4] * v + affine_2x3[5];
    return {x, y};
}

} // namespace atlas::native
