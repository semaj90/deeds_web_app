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

} // namespace atlas::native
