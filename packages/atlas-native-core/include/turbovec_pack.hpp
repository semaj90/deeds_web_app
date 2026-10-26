#pragma once
/**
 * @file turbovec_pack.hpp
 * @brief TurboVec 128-d MRL prefix 4-bit (64B) and 2-bit (32B) bit-packer,
 *        128-bit PostgreSQL 18 bitset generator, hardware POPCOUNT Hamming distance,
 *        bitshift 2-bit/4-bit asymmetric dot-product, and RTX vector interpolation.
 */

#include <algorithm>
#include <array>
#include <bit>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

namespace atlas::native {

constexpr std::size_t TURBOVEC_MRL_DIM = 128;
constexpr std::size_t TURBOVEC_4BIT_BYTES = 64; // 128 * 4 bits / 8 (LOD 2)
constexpr std::size_t TURBOVEC_2BIT_BYTES = 32; // 128 * 2 bits / 8 (LOD 1)
constexpr std::size_t PG18_BITSET_BYTES = 16;   // component-sign prefilter (LOD 0), not ATLASBIT

struct PackedTurboVecBlob {
    float scale_4bit{1.0f};
    float scale_2bit{1.0f};
    float min_val{0.0f};
    float max_val{0.0f};
    std::array<std::uint8_t, PG18_BITSET_BYTES> sign_bitset_128{}; // LOD 0: 16B
    std::array<std::uint8_t, TURBOVEC_2BIT_BYTES> data_2bit{};     // LOD 1: 32B
    std::array<std::uint8_t, TURBOVEC_4BIT_BYTES> data_4bit{};     // LOD 2: 64B
    std::array<std::uint64_t, 2> bitset_words64{};                 // 2x64-bit register view
    bool valid{false};
};

struct PackedTurboVecMetadata {
    float scale_4bit{1.0f};
    float scale_2bit{1.0f};
    float min_val{0.0f};
    float max_val{0.0f};
    std::array<std::uint64_t, 2> bitset_words64{};
    bool valid{false};
};

/**
 * L2-normalizes the first 128 dimensions of a 768-d EmbeddingGemma vector
 * and packs into:
 *   - LOD 0: 128-bit sign bitset (16B + 2x uint64_t words for POPCOUNT)
 *   - LOD 1: 2-bit (32B) MRL-128 blob
 *   - LOD 2: 4-bit (64B) MRL-128 blob
 */
inline bool pack_turbovec_mrl128_into(
    const float* vec,
    std::size_t dim,
    std::uint8_t* sign_bitset_16b,
    std::uint8_t* data_2bit_32b,
    std::uint8_t* data_4bit_64b,
    PackedTurboVecMetadata& metadata
) noexcept {
    metadata = {};
    if (!vec || dim < TURBOVEC_MRL_DIM || !sign_bitset_16b || !data_2bit_32b || !data_4bit_64b) return false;
    std::fill_n(sign_bitset_16b, PG18_BITSET_BYTES, 0);
    std::fill_n(data_2bit_32b, TURBOVEC_2BIT_BYTES, 0);
    std::fill_n(data_4bit_64b, TURBOVEC_4BIT_BYTES, 0);

    std::array<float, TURBOVEC_MRL_DIM> norm_prefix{};
    float sum_sq = 0.0f;
    for (std::size_t i = 0; i < TURBOVEC_MRL_DIM; ++i) {
        if (!std::isfinite(vec[i])) return false;
        sum_sq += vec[i] * vec[i];
    }
    if (!std::isfinite(sum_sq)) return false;
    const float inv_norm = (sum_sq > 1e-12f) ? (1.0f / std::sqrt(sum_sq)) : 1.0f;

    float min_v = 1e9f;
    float max_v = -1e9f;
    for (std::size_t i = 0; i < TURBOVEC_MRL_DIM; ++i) {
        const float v = vec[i] * inv_norm;
        norm_prefix[i] = v;
        if (v < min_v) min_v = v;
        if (v > max_v) max_v = v;
        // LOD 0: 128-bit sign bitset via bitshift
        if (v >= 0.0f) {
            sign_bitset_16b[i >> 3] |= static_cast<std::uint8_t>(1u << (7u - (i & 7u)));
            metadata.bitset_words64[i >> 6] |= (1ULL << (63u - (i & 63u)));
        }
    }

    const float range = std::max(max_v - min_v, 1e-8f);
    metadata.min_val = min_v;
    metadata.max_val = max_v;
    metadata.scale_4bit = range / 15.0f;
    metadata.scale_2bit = range / 3.0f;

    // LOD 2: Pack 4-bit (2 dims per byte = 64 bytes)
    for (std::size_t i = 0; i < TURBOVEC_MRL_DIM; i += 2) {
        const float u0 = std::clamp((norm_prefix[i] - min_v) / range, 0.0f, 1.0f);
        const float u1 = std::clamp((norm_prefix[i + 1] - min_v) / range, 0.0f, 1.0f);
        const std::uint8_t q0 = static_cast<std::uint8_t>(std::lround(u0 * 15.0f)) & 0x0Fu;
        const std::uint8_t q1 = static_cast<std::uint8_t>(std::lround(u1 * 15.0f)) & 0x0Fu;
        data_4bit_64b[i >> 1] = static_cast<std::uint8_t>((q0 << 4u) | q1);
    }

    // LOD 1: Pack 2-bit (4 dims per byte = 32 bytes)
    for (std::size_t i = 0; i < TURBOVEC_MRL_DIM; i += 4) {
        std::uint8_t byte_val = 0;
        for (std::size_t sub = 0; sub < 4; ++sub) {
            const float u = std::clamp((norm_prefix[i + sub] - min_v) / range, 0.0f, 1.0f);
            const std::uint8_t q2 = static_cast<std::uint8_t>(std::lround(u * 3.0f)) & 0x03u;
            byte_val |= static_cast<std::uint8_t>(q2 << (6u - sub * 2u));
        }
        data_2bit_32b[i >> 2] = byte_val;
    }

    metadata.valid = true;
    return true;
}

inline PackedTurboVecBlob pack_turbovec_mrl128(const float* vec, std::size_t dim) noexcept {
    PackedTurboVecBlob out{};
    PackedTurboVecMetadata metadata{};
    out.valid = pack_turbovec_mrl128_into(
        vec, dim, out.sign_bitset_128.data(), out.data_2bit.data(), out.data_4bit.data(), metadata);
    if (out.valid) {
        out.scale_4bit = metadata.scale_4bit;
        out.scale_2bit = metadata.scale_2bit;
        out.min_val = metadata.min_val;
        out.max_val = metadata.max_val;
        out.bitset_words64 = metadata.bitset_words64;
    }
    return out;
}

inline std::uint8_t unpack_4bit_value(const std::uint8_t* packed, std::size_t index) noexcept {
    if (!packed || index >= TURBOVEC_MRL_DIM) return 0;
    const std::uint8_t value = packed[index >> 1];
    return (index & 1U) == 0U ? static_cast<std::uint8_t>((value >> 4u) & 0x0Fu)
                              : static_cast<std::uint8_t>(value & 0x0Fu);
}

inline std::uint8_t unpack_2bit_value(const std::uint8_t* packed, std::size_t index) noexcept {
    if (!packed || index >= TURBOVEC_MRL_DIM) return 0;
    return static_cast<std::uint8_t>((packed[index >> 2] >> (6u - ((index & 3u) * 2u))) & 0x03u);
}

inline bool get_sign_bit_128(const std::uint8_t* packed, std::size_t index) noexcept {
    if (!packed || index >= TURBOVEC_MRL_DIM) return false;
    return (packed[index >> 3] & static_cast<std::uint8_t>(1u << (7u - (index & 7u)))) != 0;
}

inline std::string sign_bitset_128_as_bit_string(const std::uint8_t* packed) {
    if (!packed) return {};
    std::string result;
    result.reserve(TURBOVEC_MRL_DIM);
    for (std::size_t index = 0; index < TURBOVEC_MRL_DIM; ++index) {
        result.push_back(get_sign_bit_128(packed, index) ? '1' : '0');
    }
    return result;
}

/**
 * LOD 0: Hardware POPCOUNT Hamming similarity on 128-bit sign bitsets (2x uint64_t XOR).
 * Returns normalized angular similarity in [0.0, 1.0].
 */
inline float bitset128_hamming_similarity(
    const std::uint64_t* a_words2,
    const std::uint64_t* b_words2
) noexcept {
    if (!a_words2 || !b_words2) return 0.0f;
    const int diff0 = std::popcount(a_words2[0] ^ b_words2[0]);
    const int diff1 = std::popcount(a_words2[1] ^ b_words2[1]);
    return 1.0f - (static_cast<float>(diff0 + diff1) / 128.0f);
}

inline std::uint32_t bitset128_intersection_count(
    const std::uint8_t* a,
    const std::uint8_t* b
) noexcept {
    if (!a || !b) return 0;
    std::uint32_t count = 0;
    for (std::size_t i = 0; i < PG18_BITSET_BYTES; ++i) {
        count += static_cast<std::uint32_t>(std::popcount(static_cast<unsigned int>(a[i] & b[i])));
    }
    return count;
}

inline std::uint32_t bitset128_union_count(
    const std::uint8_t* a,
    const std::uint8_t* b
) noexcept {
    if (!a || !b) return 0;
    std::uint32_t count = 0;
    for (std::size_t i = 0; i < PG18_BITSET_BYTES; ++i) {
        count += static_cast<std::uint32_t>(std::popcount(static_cast<unsigned int>(a[i] | b[i])));
    }
    return count;
}

inline float bitset128_jaccard_similarity(
    const std::uint8_t* a,
    const std::uint8_t* b
) noexcept {
    const auto union_count = bitset128_union_count(a, b);
    if ((!a || !b) || union_count == 0) return 0.0f;
    return static_cast<float>(bitset128_intersection_count(a, b)) / static_cast<float>(union_count);
}

/**
 * LOD 1: Asymmetric dot-product between uncompressed 128-d query prefix
 * and a 32-byte 2-bit packed TurboVec blob using bitshifts (>> 6, 4, 2, 0).
 */
inline float asymmetric_dot_2bit(
    const float* query_128,
    const std::uint8_t* packed_32b,
    float min_val,
    float scale_2bit
) noexcept {
    if (!query_128 || !packed_32b || !std::isfinite(min_val) || !std::isfinite(scale_2bit) || scale_2bit < 0.0f) {
        return std::numeric_limits<float>::quiet_NaN();
    }
    float acc = 0.0f;
    for (std::size_t b = 0; b < TURBOVEC_2BIT_BYTES; ++b) {
        const std::uint8_t byte_val = packed_32b[b];
        const std::size_t base = b << 2;
        const float v0 = min_val + static_cast<float>((byte_val >> 6u) & 0x03u) * scale_2bit;
        const float v1 = min_val + static_cast<float>((byte_val >> 4u) & 0x03u) * scale_2bit;
        const float v2 = min_val + static_cast<float>((byte_val >> 2u) & 0x03u) * scale_2bit;
        const float v3 = min_val + static_cast<float>(byte_val & 0x03u) * scale_2bit;
        const float q0 = query_128[base], q1 = query_128[base + 1];
        const float q2 = query_128[base + 2], q3 = query_128[base + 3];
        if (!std::isfinite(q0) || !std::isfinite(q1) || !std::isfinite(q2) || !std::isfinite(q3)) {
            return std::numeric_limits<float>::quiet_NaN();
        }
        acc += q0 * v0 + q1 * v1 + q2 * v2 + q3 * v3;
    }
    return acc;
}

/**
 * LOD 2: Asymmetric dot-product between uncompressed 128-d query prefix
 * and a 64-byte 4-bit packed TurboVec blob using bitshifts (>> 4, 0).
 */
inline float asymmetric_dot_4bit(
    const float* query_128,
    const std::uint8_t* packed_64b,
    float min_val,
    float scale_4bit
) noexcept {
    if (!query_128 || !packed_64b || !std::isfinite(min_val) || !std::isfinite(scale_4bit) || scale_4bit < 0.0f) {
        return std::numeric_limits<float>::quiet_NaN();
    }
    float acc = 0.0f;
    for (std::size_t b = 0; b < TURBOVEC_4BIT_BYTES; ++b) {
        const std::uint8_t byte_val = packed_64b[b];
        const std::size_t base = b << 1;
        const float v0 = min_val + static_cast<float>((byte_val >> 4u) & 0x0Fu) * scale_4bit;
        const float v1 = min_val + static_cast<float>(byte_val & 0x0Fu) * scale_4bit;
        const float q0 = query_128[base], q1 = query_128[base + 1];
        if (!std::isfinite(q0) || !std::isfinite(q1)) return std::numeric_limits<float>::quiet_NaN();
        acc += q0 * v0 + q1 * v1;
    }
    return acc;
}

/**
 * Normalized LERP (NLERP) interpolation between two embeddings for SOM manifold bridging.
 */
inline float sum_sq_guard(float norm_sq) noexcept;

inline std::vector<float> interpolate_nlerp(
    const float* a,
    const float* b,
    std::size_t dim,
    float alpha
) {
    std::vector<float> out(dim, 0.0f);
    float norm_sq = 0.0f;
    const float w_a = 1.0f - alpha;
    for (std::size_t i = 0; i < dim; ++i) {
        const float v = w_a * a[i] + alpha * b[i];
        out[i] = v;
        norm_sq += v * v;
    }
    const float inv = (sum_sq_guard(norm_sq));
    for (std::size_t i = 0; i < dim; ++i) {
        out[i] *= inv;
    }
    return out;
}

inline float sum_sq_guard(float norm_sq) noexcept {
    return (norm_sq > 1e-12f) ? (1.0f / std::sqrt(norm_sq)) : 1.0f;
}

} // namespace atlas::native
