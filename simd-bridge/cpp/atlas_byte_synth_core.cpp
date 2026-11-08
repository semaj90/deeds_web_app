/**
 * simd-bridge/cpp/atlas_byte_synth_core.cpp
 *
 * Implementation of canonical C-ABI Zero-Dependency Byte Synthesizer.
 * C++20 / CPU-only / Zero LibTorch linkage.
 */

#include "atlas_byte_synth_core.h"

#include <cstring>
#include <vector>
#include <cstddef>

// -----------------------------------------------------------------------------
// Compile-Time Layout & Offset Invariants
// -----------------------------------------------------------------------------
static_assert(sizeof(AtlasLowRankRecordV2_64B) == 64, "AtlasLowRankRecordV2_64B must be exactly 64 bytes");
static_assert(offsetof(AtlasLowRankRecordV2_64B, morton_code) == 0, "morton_code offset must be 0");
static_assert(offsetof(AtlasLowRankRecordV2_64B, task_ordinal) == 4, "task_ordinal offset must be 4");
static_assert(offsetof(AtlasLowRankRecordV2_64B, cluster_id) == 8, "cluster_id offset must be 8");
static_assert(offsetof(AtlasLowRankRecordV2_64B, reserved_zero) == 10, "reserved_zero offset must be 10");
static_assert(offsetof(AtlasLowRankRecordV2_64B, position) == 12, "position offset must be 12");
static_assert(offsetof(AtlasLowRankRecordV2_64B, final_score) == 24, "final_score offset must be 24");
static_assert(offsetof(AtlasLowRankRecordV2_64B, features) == 32, "features offset must be 32");

// -----------------------------------------------------------------------------
// Version
// -----------------------------------------------------------------------------
ATLAS_API uint32_t atlas_byte_synth_abi_version(void) {
    return 2001; // v2.1
}

// -----------------------------------------------------------------------------
// 1. Morton Permutation Generation (Non-Destructive Radix Sort, O(N) Linear Time)
// -----------------------------------------------------------------------------
ATLAS_API AtlasStatus atlas_morton_permutation_v2(
    const AtlasLowRankRecordV2_64B* in_records,
    size_t count,
    uint32_t* out_permutation,
    size_t permutation_capacity
) {
    if (!in_records || !out_permutation) return ATLAS_ERR_NULL_POINTER;
    if (permutation_capacity < count) return ATLAS_ERR_BUFFER_TOO_SMALL;
    if (count == 0) return ATLAS_OK;

    try {
        std::vector<uint32_t> temp(count);
        for (size_t i = 0; i < count; ++i) {
            out_permutation[i] = static_cast<uint32_t>(i);
        }

        uint32_t* src = out_permutation;
        uint32_t* dst = temp.data();

        // 4 passes of 8-bit LSD radix sort
        for (int shift = 0; shift < 32; shift += 8) {
            size_t buckets[256] = {0};

            for (size_t i = 0; i < count; ++i) {
                uint32_t orig_idx = src[i];
                uint8_t byte_val = static_cast<uint8_t>((in_records[orig_idx].morton_code >> shift) & 0xFFu);
                buckets[byte_val]++;
            }

            size_t offsets[256];
            size_t running = 0;
            for (int b = 0; b < 256; ++b) {
                offsets[b] = running;
                running += buckets[b];
            }

            for (size_t i = 0; i < count; ++i) {
                uint32_t orig_idx = src[i];
                uint8_t byte_val = static_cast<uint8_t>((in_records[orig_idx].morton_code >> shift) & 0xFFu);
                dst[offsets[byte_val]++] = orig_idx;
            }

            uint32_t* swap_ptr = src;
            src = dst;
            dst = swap_ptr;
        }

        // After 4 passes (even count), src points to out_permutation.
        return ATLAS_OK;
    } catch (...) {
        return ATLAS_ERR_INTERNAL;
    }
}

// -----------------------------------------------------------------------------
// 2. Full Record Radix Sort (In-Place or Dedicated Reorder)
// -----------------------------------------------------------------------------
ATLAS_API AtlasStatus atlas_radix_sort_v2_records(
    const AtlasLowRankRecordV2_64B* in_records,
    AtlasLowRankRecordV2_64B* out_records,
    size_t count,
    size_t out_capacity_records
) {
    if (!in_records || !out_records) return ATLAS_ERR_NULL_POINTER;
    if (out_capacity_records < count) return ATLAS_ERR_BUFFER_TOO_SMALL;
    if (count == 0) return ATLAS_OK;

    try {
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

        return ATLAS_OK;
    } catch (...) {
        return ATLAS_ERR_INTERNAL;
    }
}

// -----------------------------------------------------------------------------
// 3. LSB0 Occupancy Bitset Synthesizer
// -----------------------------------------------------------------------------
ATLAS_API AtlasStatus atlas_synthesize_lsb0_bitset(
    const AtlasLowRankRecordV2_64B* records,
    size_t count,
    double score_threshold,
    uint8_t* out_bitset_bytes,
    size_t out_capacity_bytes,
    size_t* out_bits_set
) {
    if (!records || !out_bitset_bytes) return ATLAS_ERR_NULL_POINTER;
    size_t needed_bytes = (count + 7) >> 3;
    if (out_capacity_bytes < needed_bytes) return ATLAS_ERR_BUFFER_TOO_SMALL;

    std::memset(out_bitset_bytes, 0, needed_bytes);
    size_t bits_set = 0;

    for (size_t i = 0; i < count; ++i) {
        if (records[i].final_score > score_threshold) {
            out_bitset_bytes[i >> 3] |= static_cast<uint8_t>(1u << (i & 7u));
            bits_set++;
        }
    }
    if (out_bits_set) *out_bits_set = bits_set;
    return ATLAS_OK;
}

// -----------------------------------------------------------------------------
// 4. Wire Encoders (Hex, Crockford Base32, RFC 4648 Base64)
// -----------------------------------------------------------------------------
static constexpr char HEX_LUT[17] = "0123456789abcdef";
static constexpr char CROCKFORD_B32_LUT[33] = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
static constexpr char B64_LUT[65] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

ATLAS_API AtlasStatus atlas_encode_hex(
    const uint8_t* src,
    size_t len,
    char* out_hex,
    size_t out_capacity
) {
    if (!src || !out_hex) return ATLAS_ERR_NULL_POINTER;
    if (out_capacity < len * 2) return ATLAS_ERR_BUFFER_TOO_SMALL;

    for (size_t i = 0; i < len; ++i) {
        out_hex[i * 2 + 0] = HEX_LUT[(src[i] >> 4) & 0x0Fu];
        out_hex[i * 2 + 1] = HEX_LUT[src[i] & 0x0Fu];
    }
    return ATLAS_OK;
}

ATLAS_API AtlasStatus atlas_encode_crockford_base32(
    const uint8_t* src,
    size_t len,
    char* out_b32,
    size_t out_capacity,
    size_t* out_written
) {
    if (!src || !out_b32) return ATLAS_ERR_NULL_POINTER;
    size_t max_out_len = (len * 8 + 4) / 5;
    if (out_capacity < max_out_len) return ATLAS_ERR_BUFFER_TOO_SMALL;

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
    if (out_written) *out_written = out_idx;
    return ATLAS_OK;
}

// -----------------------------------------------------------------------------
// 5. Canonical 128-bit ULID Encoder & Decoder
// -----------------------------------------------------------------------------
ATLAS_API AtlasStatus atlas_encode_ulid128(
    const uint8_t src[16],
    char out_ulid[26]
) {
    if (!src || !out_ulid) return ATLAS_ERR_NULL_POINTER;

    // 16 bytes = 128 bits.
    // In canonical ULID Crockford Base32: 26 characters representing 130 bits,
    // with the top 2 bits zero-padded.
    // Char 0: 3 bits from src[0] >> 5 -> strictly in '0'..'7'.
    out_ulid[0] = CROCKFORD_B32_LUT[(src[0] >> 5) & 0x07u];
    out_ulid[1] = CROCKFORD_B32_LUT[src[0] & 0x1Fu];

    // Three blocks of 5 bytes -> 8 chars each (15 bytes -> 24 chars)
    for (int block = 0; block < 3; ++block) {
        const uint8_t* b = &src[1 + block * 5];
        char* c = &out_ulid[2 + block * 8];

        c[0] = CROCKFORD_B32_LUT[(b[0] >> 3) & 0x1Fu];
        c[1] = CROCKFORD_B32_LUT[((b[0] << 2) | (b[1] >> 6)) & 0x1Fu];
        c[2] = CROCKFORD_B32_LUT[(b[1] >> 1) & 0x1Fu];
        c[3] = CROCKFORD_B32_LUT[((b[1] << 4) | (b[2] >> 4)) & 0x1Fu];
        c[4] = CROCKFORD_B32_LUT[((b[2] << 1) | (b[3] >> 7)) & 0x1Fu];
        c[5] = CROCKFORD_B32_LUT[(b[3] >> 2) & 0x1Fu];
        c[6] = CROCKFORD_B32_LUT[((b[3] << 3) | (b[4] >> 5)) & 0x1Fu];
        c[7] = CROCKFORD_B32_LUT[b[4] & 0x1Fu];
    }

    return ATLAS_OK;
}

// Reverse Crockford decode table: map ASCII char to 0..31 (-1 if invalid)
static int8_t decode_crockford_char(char ch) {
    if (ch >= '0' && ch <= '9') return static_cast<int8_t>(ch - '0');
    if (ch >= 'A' && ch <= 'Z') {
        switch (ch) {
            case 'I': case 'L': return 1;
            case 'O': return 0;
            default: break;
        }
        // Crockford alphabet skips I, L, O, U:
        // A..H = 10..17, J..K = 18..19, M..N = 20..21, P..T = 22..26, V..Z = 27..31
        if (ch >= 'A' && ch <= 'H') return static_cast<int8_t>(10 + (ch - 'A'));
        if (ch >= 'J' && ch <= 'K') return static_cast<int8_t>(18 + (ch - 'J'));
        if (ch >= 'M' && ch <= 'N') return static_cast<int8_t>(20 + (ch - 'M'));
        if (ch >= 'P' && ch <= 'T') return static_cast<int8_t>(22 + (ch - 'P'));
        if (ch >= 'V' && ch <= 'Z') return static_cast<int8_t>(27 + (ch - 'V'));
        return -1; // 'U' is invalid
    }
    if (ch >= 'a' && ch <= 'z') {
        return decode_crockford_char(static_cast<char>(ch - ('a' - 'A')));
    }
    return -1;
}

ATLAS_API AtlasStatus atlas_decode_ulid128(
    const char in_ulid[26],
    uint8_t out_bytes[16]
) {
    if (!in_ulid || !out_bytes) return ATLAS_ERR_NULL_POINTER;

    int8_t vals[26];
    for (int i = 0; i < 26; ++i) {
        vals[i] = decode_crockford_char(in_ulid[i]);
        if (vals[i] < 0) return ATLAS_ERR_INVALID_ULID;
    }

    // First character cannot exceed 7 (since it holds only 3 bits)
    if (vals[0] > 7) return ATLAS_ERR_INVALID_ULID;

    // Byte 0
    out_bytes[0] = static_cast<uint8_t>(((vals[0] & 0x07) << 5) | (vals[1] & 0x1F));

    // Three 5-byte blocks
    for (int block = 0; block < 3; ++block) {
        uint8_t* b = &out_bytes[1 + block * 5];
        const int8_t* c = &vals[2 + block * 8];

        b[0] = static_cast<uint8_t>((c[0] << 3) | (c[1] >> 2));
        b[1] = static_cast<uint8_t>((c[1] << 6) | (c[2] << 1) | (c[3] >> 4));
        b[2] = static_cast<uint8_t>((c[3] << 4) | (c[4] >> 1));
        b[3] = static_cast<uint8_t>((c[4] << 7) | (c[5] << 2) | (c[6] >> 3));
        b[4] = static_cast<uint8_t>((c[6] << 5) | c[7]);
    }

    return ATLAS_OK;
}

// -----------------------------------------------------------------------------
// 6. RFC 4648 Base64 Encoder
// -----------------------------------------------------------------------------
ATLAS_API AtlasStatus atlas_encode_base64(
    const uint8_t* src,
    size_t len,
    char* out_b64,
    size_t out_capacity,
    size_t* out_written
) {
    if (!src || !out_b64) return ATLAS_ERR_NULL_POINTER;
    size_t required = ((len + 2) / 3) * 4;
    if (out_capacity < required) return ATLAS_ERR_BUFFER_TOO_SMALL;

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
    if (out_written) *out_written = j;
    return ATLAS_OK;
}
