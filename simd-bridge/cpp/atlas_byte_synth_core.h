#pragma once

#include <stdint.h>
#include <stddef.h>

#if defined(_WIN32)
  #define ATLAS_API extern "C" __declspec(dllexport)
#else
  #define ATLAS_API extern "C" __attribute__((visibility("default")))
#endif

#pragma pack(push, 1)
struct AtlasLowRankRecordV2_64B {
    uint32_t morton_code;       // 0..3: 30-bit Morton radix code
    uint32_t task_ordinal;      // 4..7: unique task index in frozen cohort
    uint16_t cluster_id;        // 8..9: cluster or community ID
    uint16_t reserved_zero;     // 10..11: must be exactly zero
    float position[3];          // 12..23: 12B latent64[0:3] coordinates
    double final_score;         // 24..31: float64 final score
    float features[8];          // 32..63: 32B feature columns 0..7
};
#pragma pack(pop)

static_assert(sizeof(AtlasLowRankRecordV2_64B) == 64, "AtlasLowRankRecordV2_64B must be exactly 64 bytes");

ATLAS_API void atlas_radix_sort_v2_records(
    const AtlasLowRankRecordV2_64B* in_records,
    AtlasLowRankRecordV2_64B* out_records,
    size_t count
);

ATLAS_API size_t atlas_synthesize_lsb0_bitset(
    const AtlasLowRankRecordV2_64B* records,
    size_t count,
    double score_threshold,
    uint8_t* out_bitset_bytes
);

ATLAS_API void atlas_encode_hex(
    const uint8_t* src,
    size_t len,
    char* out_hex
);

ATLAS_API size_t atlas_encode_crockford_base32(
    const uint8_t* src,
    size_t len,
    char* out_b32
);

ATLAS_API size_t atlas_encode_base64(
    const uint8_t* src,
    size_t len,
    char* out_b64
);
