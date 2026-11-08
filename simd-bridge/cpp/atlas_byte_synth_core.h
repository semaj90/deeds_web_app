/**
 * simd-bridge/cpp/atlas_byte_synth_core.h
 *
 * Canonical C-ABI Zero-Dependency Byte Synthesis & Wire Encoding Core:
 * - 64-byte low-rank v2 record layout (<IIH2x3fd8f)
 * - 4-pass 8-bit LSD radix sort morton permutation (non-destructive)
 * - LSB0 occupancy bitset synthesis
 * - Fast Hex, Crockford Base32, RFC 4648 Base64 wire encoders
 * - Canonical 128-bit ULID encoder & decoder (exact 26-char Crockford, first char 0..7)
 *
 * STRICTLY ZERO DEPENDENCIES ON LIBTORCH / PYTORCH / CUDA / N-API.
 */

#ifndef ATLAS_BYTE_SYNTH_CORE_H
#define ATLAS_BYTE_SYNTH_CORE_H

#include <stdint.h>
#include <stddef.h>

#if defined(_WIN32)
  #define ATLAS_API extern "C" __declspec(dllexport)
#else
  #define ATLAS_API extern "C" __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef enum AtlasStatus {
    ATLAS_OK = 0,
    ATLAS_ERR_INVALID_ARGUMENT = -1,
    ATLAS_ERR_BUFFER_TOO_SMALL = -2,
    ATLAS_ERR_OVERFLOW = -3,
    ATLAS_ERR_NULL_POINTER = -4,
    ATLAS_ERR_INVALID_ULID = -5,
    ATLAS_ERR_INTERNAL = -6
} AtlasStatus;

#pragma pack(push, 1)
typedef struct AtlasLowRankRecordV2_64B {
    uint32_t morton_code;       /* 0..3: 30-bit Morton radix code */
    uint32_t task_ordinal;      /* 4..7: unique task index in frozen cohort */
    uint16_t cluster_id;        /* 8..9: cluster or community ID */
    uint16_t reserved_zero;     /* 10..11: must be exactly zero */
    float position[3];          /* 12..23: 12B latent64[0:3] coordinates */
    double final_score;         /* 24..31: float64 final score */
    float features[8];          /* 32..63: 32B feature columns 0..7 */
} AtlasLowRankRecordV2_64B;
#pragma pack(pop)

/* Returns ABI version: major * 1000 + minor */
ATLAS_API uint32_t atlas_byte_synth_abi_version(void);

/*
 * Generates a Morton-sorted permutation of records WITHOUT reordering
 * the canonical 64-byte records in place.
 * out_permutation[i] receives the original index (0..count-1) of the record
 * that belongs at sorted rank i.
 * Stable sort: preserves original index order for duplicate Morton keys.
 */
ATLAS_API AtlasStatus atlas_morton_permutation_v2(
    const AtlasLowRankRecordV2_64B* in_records,
    size_t count,
    uint32_t* out_permutation,
    size_t permutation_capacity
);

/*
 * Sorts complete 64-byte records by morton_code into out_records.
 * Preserves stable tie ordering.
 */
ATLAS_API AtlasStatus atlas_radix_sort_v2_records(
    const AtlasLowRankRecordV2_64B* in_records,
    AtlasLowRankRecordV2_64B* out_records,
    size_t count,
    size_t out_capacity_records
);

/*
 * Synthesizes LSB0 occupancy bitset (bit i set if records[i].final_score > threshold).
 * out_bitset_bytes must have capacity >= ceil(count / 8.0).
 * Returns number of bits set via out_bits_set.
 */
ATLAS_API AtlasStatus atlas_synthesize_lsb0_bitset(
    const AtlasLowRankRecordV2_64B* records,
    size_t count,
    double score_threshold,
    uint8_t* out_bitset_bytes,
    size_t out_capacity_bytes,
    size_t* out_bits_set
);

/*
 * Encodes byte stream as lowercase hex string (no null terminator written).
 * out_capacity must be >= len * 2.
 */
ATLAS_API AtlasStatus atlas_encode_hex(
    const uint8_t* src,
    size_t len,
    char* out_hex,
    size_t out_capacity
);

/*
 * Encodes arbitrary byte stream into Crockford Base32.
 * out_written receives the number of characters written.
 */
ATLAS_API AtlasStatus atlas_encode_crockford_base32(
    const uint8_t* src,
    size_t len,
    char* out_b32,
    size_t out_capacity,
    size_t* out_written
);

/*
 * Encodes exactly 16 bytes (128 bits) into a canonical 26-character ULID string.
 * Uses Crockford Base32 with 2 leading zero bits (first char strictly in '0'..'7').
 * 16 bytes of 0xFF -> "7ZZZZZZZZZZZZZZZZZZZZZZZZZ"
 * 16 bytes of 0x00 -> "00000000000000000000000000"
 */
ATLAS_API AtlasStatus atlas_encode_ulid128(
    const uint8_t src[16],
    char out_ulid[26]
);

/*
 * Decodes a canonical 26-character ULID string into exactly 16 bytes (128 bits).
 * Case-insensitive; accepts Crockford aliases (I, L -> 1; O -> 0).
 * Rejects strings with length != 26 or first character not in '0'..'7'.
 */
ATLAS_API AtlasStatus atlas_decode_ulid128(
    const char in_ulid[26],
    uint8_t out_bytes[16]
);

/*
 * Standard RFC 4648 Base64 encoder with '=' padding.
 * out_written receives the number of characters written.
 */
ATLAS_API AtlasStatus atlas_encode_base64(
    const uint8_t* src,
    size_t len,
    char* out_b64,
    size_t out_capacity,
    size_t* out_written
);

#ifdef __cplusplus
}
#endif

#endif /* ATLAS_BYTE_SYNTH_CORE_H */
