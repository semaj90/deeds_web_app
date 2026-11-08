// simd-bridge/cpp/atlas_byte_synth_core.cpp
#include "atlas_byte_synth_core.h"

#include <cstring>
#include <vector>

// -----------------------------------------------------------------------------
// 1. 4-Pass 8-Bit LSD Radix Sort (O(N) Linear Time, Zero LibTorch Dependency)
// -----------------------------------------------------------------------------
ATLAS_API void atlas_radix_sort_v2_records(
    const AtlasLowRankRecordV2_64B* in_records,
    AtlasLowRankRecordV2_64B* out_records,
    size_t count
) {
    if (!in_records || !out_records || count == 0) return;

    std::vector<AtlasLowRankRecordV2_64B> temp(count);
    std::memcpy(out_records, in_records, count * sizeof(AtlasLowRankRecordV2_64B));

    AtlasLowRankRecordV2_64B* src = out_records;
    AtlasLowRankRecordV2_64B* dst = temp.data();

    for (int shift = 0; shift < 32; shift += 8) {
        size_t buckets[256] = {0};

        for (size_t i = 0; i < count; ++i) {
            uint8_t byte_val = static_cast<uint8_t>((src[i].morton_code >> shift) & 0xFFu);
            buckets[byte_val]++;
        }

        size_t offsets[256];
        size_t running = 0;
        for (int b = 0; b < 256; ++b) {
            offsets[b] = running;
            running += buckets[b];
        }

        for (size_t i = 0; i < count; ++i) {
            uint8_t byte_val = static_cast<uint8_t>((src[i].morton_code >> shift) & 0xFFu);
            dst[offsets[byte_val]++] = src[i];
        }

        AtlasLowRankRecordV2_64B* swap_ptr = src;
        src = dst;
        dst = swap_ptr;
    }

    // After 4 passes (even number), src points back to out_records.
}

// -----------------------------------------------------------------------------
// 2. LSB0 Occupancy Bitset Synthesizer (BYTEA / BLOB Ready)
// -----------------------------------------------------------------------------
ATLAS_API size_t atlas_synthesize_lsb0_bitset(
    const AtlasLowRankRecordV2_64B* records,
    size_t count,
    double score_threshold,
    uint8_t* out_bitset_bytes // Caller allocates ceil(count / 8.0) bytes
) {
    if (!records || !out_bitset_bytes || count == 0) return 0;

    size_t byte_len = (count + 7) >> 3;
    std::memset(out_bitset_bytes, 0, byte_len);
    size_t bits_set = 0;

    for (size_t i = 0; i < count; ++i) {
        if (records[i].final_score > score_threshold) {
            out_bitset_bytes[i >> 3] |= static_cast<uint8_t>(1u << (i & 7u));
            bits_set++;
        }
    }
    return bits_set;
}

// -----------------------------------------------------------------------------
// 3. Fast Hex, Crockford Base32 (ULID), and Standard Base64 Wire Encoders
// -----------------------------------------------------------------------------
static constexpr char HEX_LUT[17] = "0123456789abcdef";
static constexpr char CROCKFORD_B32_LUT[33] = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
static constexpr char B64_LUT[65] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

ATLAS_API void atlas_encode_hex(const uint8_t* src, size_t len, char* out_hex) {
    if (!src || !out_hex) return;
    for (size_t i = 0; i < len; ++i) {
        out_hex[i * 2 + 0] = HEX_LUT[(src[i] >> 4) & 0x0Fu];
        out_hex[i * 2 + 1] = HEX_LUT[src[i] & 0x0Fu];
    }
}

// Encodes 5-bit groups into Crockford Base32 for deterministic ULIDs / Packet Keys
ATLAS_API size_t atlas_encode_crockford_base32(const uint8_t* src, size_t len, char* out_b32) {
    if (!src || !out_b32 || len == 0) return 0;
    uint32_t buffer = 0;
    int bits_left = 0;
    size_t out_idx = 0;

    for (size_t i = 0; i < len; ++i) {
        buffer = (buffer << 8) | src[i];
        bits_left += 8;
        while (bits_left >= 5) {
            out_b32[out_idx++] = CROCKFORD_B32_LUT[(buffer >> (bits_left - 5)) & 0x1Fu];
            bits_left -= 5;
        }
    }
    if (bits_left > 0) {
        out_b32[out_idx++] = CROCKFORD_B32_LUT[(buffer << (5 - bits_left)) & 0x1Fu];
    }
    return out_idx;
}

// Standard RFC 4648 Base64 encoder for gRPC-JSON / BYTEA transport
ATLAS_API size_t atlas_encode_base64(const uint8_t* src, size_t len, char* out_b64) {
    if (!src || !out_b64 || len == 0) return 0;
    size_t i = 0, j = 0;
    for (; i + 2 < len; i += 3) {
        uint32_t triple = (static_cast<uint32_t>(src[i]) << 16) |
                          (static_cast<uint32_t>(src[i + 1]) << 8) |
                           static_cast<uint32_t>(src[i + 2]);
        out_b64[j++] = B64_LUT[(triple >> 18) & 0x3Fu];
        out_b64[j++] = B64_LUT[(triple >> 12) & 0x3Fu];
        out_b64[j++] = B64_LUT[(triple >> 6) & 0x3Fu];
        out_b64[j++] = B64_LUT[triple & 0x3Fu];
    }
    if (i < len) {
        uint32_t rem = static_cast<uint32_t>(src[i]) << 16;
        if (i + 1 < len) rem |= static_cast<uint32_t>(src[i + 1]) << 8;
        out_b64[j++] = B64_LUT[(rem >> 18) & 0x3Fu];
        out_b64[j++] = B64_LUT[(rem >> 12) & 0x3Fu];
        out_b64[j++] = (i + 1 < len) ? B64_LUT[(rem >> 6) & 0x3Fu] : '=';
        out_b64[j++] = '=';
    }
    return j;
}
