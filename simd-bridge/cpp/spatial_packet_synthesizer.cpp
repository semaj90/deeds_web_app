// simd-bridge/cpp/spatial_packet_synthesizer.cpp
#include <stdint.h>
#include <stddef.h>
#include <vector>
#include <algorithm>
#include <cstring>
#include "qfb_aten_view.h"

#pragma pack(push, 1)
struct AlignedKeyframeChunk64B {
    uint32_t morton_code;       // 0..3:   30-bit Morton index for radix sorting
    uint16_t slot_index;        // 4..5:   Slot in the 256-element N64 arena
    uint16_t cluster_id;        // 6..7:   k-Means Top-K assignment
    float position[3];          // 8..19:  12B X, Y, Z coordinates
    float rot_6d[6];            // 20..43: 24B Continuous 6D rotation
    float scale[3];             // 44..55: 12B Scale
    uint32_t flags;             // 56..59: Provenance & classification
    uint32_t reserved;          // 60..63: 64-byte padding alignment
};
#pragma pack(pop)

static_assert(sizeof(AlignedKeyframeChunk64B) == 64, "Chunk must be exactly 64 bytes");

enum SpatialSynthesizerStatus : int32_t {
    SPATIAL_SYNTH_SUCCESS = 0,
    SPATIAL_SYNTH_ERR_NULL_POINTER = -1,
    SPATIAL_SYNTH_ERR_INVALID_COUNT = -2,
    SPATIAL_SYNTH_ERR_BUFFER_OVERFLOW = -3,
    SPATIAL_SYNTH_ERR_UNALIGNED_BUFFER = -4,
};

/**
 * 64-Bit Composite Radix Key:
 * Key_64 = Actionable_1b (bit 63)
 *        | LOD_Tier_2b (bits 62..61)
 *        | Engram_Score_15b (bits 60..46)
 *        | Morton_Code_30b (bits 45..16)
 *        | Cohort_Ordinal_16b (bits 15..0)
 */
inline uint64_t build_composite_radix_key(
    bool actionable,
    uint8_t lod_tier,
    uint16_t engram_score_15b,
    uint32_t morton_code_30b,
    uint16_t cohort_ordinal_16b
) {
    return (static_cast<uint64_t>(actionable ? 1ULL : 0ULL) << 63)
         | ((static_cast<uint64_t>(lod_tier & 0x03)) << 61)
         | ((static_cast<uint64_t>(engram_score_15b & 0x7FFF)) << 46)
         | ((static_cast<uint64_t>(morton_code_30b & 0x3FFFFFFF)) << 16)
         | (static_cast<uint64_t>(cohort_ordinal_16b));
}

struct SortEntry {
    uint64_t key;
    AlignedKeyframeChunk64B chunk;
};

/**
 * 8-Pass (8-bit radix) Least-Significant-Digit (LSD) Radix Sort over 64-bit keys.
 * Sorts descending (highest actionable, highest LOD, highest engram score first).
 */
static void lsd_radix_sort_descending_64(std::vector<SortEntry>& items) {
    const size_t n = items.size();
    if (n <= 1) return;

    std::vector<SortEntry> temp(n);
    std::vector<SortEntry>* src = &items;
    std::vector<SortEntry>* dst = &temp;

    // 8 passes for 64-bit key (8 bits per pass)
    for (int pass = 0; pass < 8; ++pass) {
        const int shift = pass * 8;
        size_t count[256] = {0};

        // Count frequencies of the byte
        for (size_t i = 0; i < n; ++i) {
            uint8_t byte_val = static_cast<uint8_t>(((*src)[i].key >> shift) & 0xFF);
            count[byte_val]++;
        }

        // For descending order, higher byte values appear at lower output indices
        size_t offset[256];
        offset[255] = 0;
        for (int b = 254; b >= 0; --b) {
            offset[b] = offset[b + 1] + count[b + 1];
        }

        // Scatter into destination
        for (size_t i = 0; i < n; ++i) {
            uint8_t byte_val = static_cast<uint8_t>(((*src)[i].key >> shift) & 0xFF);
            (*dst)[offset[byte_val]++] = (*src)[i];
        }

        std::swap(src, dst);
    }

    // If result ended up in temp, copy back to items
    if (src != &items) {
        items = temp;
    }
}

extern "C" {

/**
 * V1 legacy interface (retained for backward ABI compatibility with bounds safety).
 */
void synthesize_spatial_packet(
    const float* in_positions,    // N x 3
    const float* in_rot6d,        // N x 6
    const float* in_scales,       // N x 3
    const uint32_t* in_morton,    // N
    const uint16_t* in_clusters,  // N
    int num_items,
    uint8_t* out_bytes,           // num_items * 64
    uint64_t out_bitset_mask[4]   // 256 bits = 4 * uint64_t
) {
    if (!in_positions || !in_rot6d || !in_scales || !in_morton || !in_clusters || !out_bytes || !out_bitset_mask || num_items <= 0) {
        return;
    }

    const int clamped_items = (num_items > 256) ? 256 : num_items;
    std::vector<AlignedKeyframeChunk64B> chunks(clamped_items);
    std::memset(out_bitset_mask, 0, 32);

    for (int i = 0; i < clamped_items; ++i) {
        chunks[i].morton_code = in_morton[i];
        chunks[i].slot_index = static_cast<uint16_t>(i);
        chunks[i].cluster_id = in_clusters[i];
        std::memcpy(chunks[i].position, &in_positions[i * 3], 12);
        std::memcpy(chunks[i].rot_6d, &in_rot6d[i * 6], 24);
        std::memcpy(chunks[i].scale, &in_scales[i * 3], 12);
        chunks[i].flags = 1; // Verified legacy fallback
        chunks[i].reserved = 0;

        int word_idx = i / 64;
        int bit_idx = i % 64;
        out_bitset_mask[word_idx] |= (1ULL << bit_idx);
    }

    // Deterministic Morton code sorting with slot_index tie-breaker
    std::sort(chunks.begin(), chunks.end(), [](const AlignedKeyframeChunk64B& a, const AlignedKeyframeChunk64B& b) {
        if (a.morton_code != b.morton_code) {
            return a.morton_code < b.morton_code;
        }
        return a.slot_index < b.slot_index;
    });

    std::memcpy(out_bytes, chunks.data(), clamped_items * sizeof(AlignedKeyframeChunk64B));
}

/**
 * V2 production interface:
 * - Returns explicit SpatialSynthesizerStatus error code.
 * - Enforces 64-byte alignment check on out_bytes.
 * - Accepts caller-provided provenance flags.
 * - Supports arbitrary item counts partitioned into 256-slot occupancy arenas (26 buckets for 6,527 tasks).
 * - Deterministic tie-breaking on (morton_code, slot_index).
 */
int32_t synthesize_spatial_packet_v2(
    const float* in_positions,      // N x 3
    const float* in_rot6d,          // N x 6
    const float* in_scales,         // N x 3
    const uint32_t* in_morton,      // N
    const uint16_t* in_clusters,    // N
    const uint32_t* in_flags,       // N (optional caller flags; if null, defaults to 1)
    int32_t num_items,
    uint8_t* out_bytes,             // Must be 64-byte aligned and capacity >= num_items * 64
    size_t out_capacity_bytes,
    uint64_t* out_arena_masks,      // Array of uint64_t[4] (one 256-bit mask per 256 items)
    size_t num_arena_masks
) {
    if (!in_positions || !in_rot6d || !in_scales || !in_morton || !in_clusters || !out_bytes) {
        return SPATIAL_SYNTH_ERR_NULL_POINTER;
    }
    if (num_items <= 0) {
        return SPATIAL_SYNTH_ERR_INVALID_COUNT;
    }

    const size_t required_bytes = static_cast<size_t>(num_items) * sizeof(AlignedKeyframeChunk64B);
    if (out_capacity_bytes < required_bytes) {
        return SPATIAL_SYNTH_ERR_BUFFER_OVERFLOW;
    }

    // Alignment verification: ensure base pointer is 64-byte aligned
    if (reinterpret_cast<uintptr_t>(out_bytes) % 64 != 0) {
        return SPATIAL_SYNTH_ERR_UNALIGNED_BUFFER;
    }

    const size_t arenas_needed = (static_cast<size_t>(num_items) + 255) / 256;
    if (out_arena_masks && num_arena_masks >= arenas_needed) {
        std::memset(out_arena_masks, 0, arenas_needed * 4 * sizeof(uint64_t));
    }

    std::vector<AlignedKeyframeChunk64B> chunks(num_items);

    for (int32_t i = 0; i < num_items; ++i) {
        chunks[i].morton_code = in_morton[i];
        chunks[i].slot_index = static_cast<uint16_t>(i % 256);
        chunks[i].cluster_id = in_clusters[i];
        std::memcpy(chunks[i].position, &in_positions[i * 3], 12);
        std::memcpy(chunks[i].rot_6d, &in_rot6d[i * 6], 24);
        std::memcpy(chunks[i].scale, &in_scales[i * 3], 12);
        chunks[i].flags = in_flags ? in_flags[i] : 1;
        chunks[i].reserved = 0;

        if (out_arena_masks && num_arena_masks >= arenas_needed) {
            const size_t arena_idx = i / 256;
            const size_t slot_in_arena = i % 256;
            const size_t word_idx = arena_idx * 4 + (slot_in_arena / 64);
            const size_t bit_idx = slot_in_arena % 64;
            out_arena_masks[word_idx] |= (1ULL << bit_idx);
        }
    }

    // Deterministic sorting with stable tie-breaker
    std::sort(chunks.begin(), chunks.end(), [](const AlignedKeyframeChunk64B& a, const AlignedKeyframeChunk64B& b) {
        if (a.morton_code != b.morton_code) {
            return a.morton_code < b.morton_code;
        }
        return a.slot_index < b.slot_index;
    });

    std::memcpy(out_bytes, chunks.data(), required_bytes);
    return SPATIAL_SYNTH_SUCCESS;
}

/**
 * V3 production interface:
 * - 64-bit composite Radix Key: Actionable_1b | LOD_Tier_2b | Engram_Score_15b | Morton_30b | Cohort_Ordinal_16b.
 * - Linear-time 8-pass LSD Radix Sort across all 26 occupancy arenas (26 * 256 = 6,656 >= 6,527).
 * - Enforces 64-byte alignment and emits arena occupancy bitset masks.
 */
int32_t synthesize_spatial_packet_v3_radix(
    const float* in_positions,          // N x 3
    const float* in_rot6d,              // N x 6
    const float* in_scales,             // N x 3
    const uint32_t* in_morton,          // N
    const uint16_t* in_clusters,        // N
    const uint8_t* in_actionable_bits,  // N (1 if unmet_deps == 0, 0 otherwise; null -> all 1)
    const uint8_t* in_lod_tiers,        // N (0=HOT, 1=WARM, 2=COLD; null -> 0)
    const uint16_t* in_engram_scores,   // N (15-bit score; null -> 0)
    const uint16_t* in_cohort_ordinals, // N (0..6526; null -> i % 65536)
    int32_t num_items,
    uint8_t* out_bytes,                 // Must be 64-byte aligned and capacity >= num_items * 64
    size_t out_capacity_bytes,
    uint64_t* out_arena_masks,          // Array of uint64_t[4] (one 256-bit mask per 256 items)
    size_t num_arena_masks
) {
    if (!in_positions || !in_rot6d || !in_scales || !in_morton || !in_clusters || !out_bytes) {
        return SPATIAL_SYNTH_ERR_NULL_POINTER;
    }
    if (num_items <= 0) {
        return SPATIAL_SYNTH_ERR_INVALID_COUNT;
    }

    const size_t required_bytes = static_cast<size_t>(num_items) * sizeof(AlignedKeyframeChunk64B);
    if (out_capacity_bytes < required_bytes) {
        return SPATIAL_SYNTH_ERR_BUFFER_OVERFLOW;
    }

    if (reinterpret_cast<uintptr_t>(out_bytes) % 64 != 0) {
        return SPATIAL_SYNTH_ERR_UNALIGNED_BUFFER;
    }

    const size_t arenas_needed = (static_cast<size_t>(num_items) + 255) / 256;
    if (out_arena_masks && num_arena_masks >= arenas_needed) {
        std::memset(out_arena_masks, 0, arenas_needed * 4 * sizeof(uint64_t));
    }

    std::vector<SortEntry> entries(num_items);

    for (int32_t i = 0; i < num_items; ++i) {
        bool actionable = in_actionable_bits ? (in_actionable_bits[i] != 0) : true;
        uint8_t lod = in_lod_tiers ? (in_lod_tiers[i] & 0x03) : 0;
        uint16_t engram = in_engram_scores ? (in_engram_scores[i] & 0x7FFF) : 0;
        uint32_t morton = in_morton[i] & 0x3FFFFFFF;
        uint16_t ordinal = in_cohort_ordinals ? in_cohort_ordinals[i] : static_cast<uint16_t>(i & 0xFFFF);

        entries[i].key = build_composite_radix_key(actionable, lod, engram, morton, ordinal);

        AlignedKeyframeChunk64B& ch = entries[i].chunk;
        ch.morton_code = in_morton[i];
        ch.slot_index = static_cast<uint16_t>(i % 256);
        ch.cluster_id = in_clusters[i];
        std::memcpy(ch.position, &in_positions[i * 3], 12);
        std::memcpy(ch.rot_6d, &in_rot6d[i * 6], 24);
        std::memcpy(ch.scale, &in_scales[i * 3], 12);
        ch.flags = (actionable ? 0x01 : 0x00) | (static_cast<uint32_t>(lod) << 1);
        ch.reserved = 0;

        if (out_arena_masks && num_arena_masks >= arenas_needed) {
            const size_t arena_idx = i / 256;
            const size_t slot_in_arena = i % 256;
            const size_t word_idx = arena_idx * 4 + (slot_in_arena / 64);
            const size_t bit_idx = slot_in_arena % 64;
            out_arena_masks[word_idx] |= (1ULL << bit_idx);
        }
    }

    // High-performance 8-pass LSD Radix Sort across 64-bit keys
    lsd_radix_sort_descending_64(entries);

    // Copy sorted chunks to aligned output buffer
    uint8_t* write_ptr = out_bytes;
    for (int32_t i = 0; i < num_items; ++i) {
        std::memcpy(write_ptr, &entries[i].chunk, sizeof(AlignedKeyframeChunk64B));
        write_ptr += sizeof(AlignedKeyframeChunk64B);
    }

    return SPATIAL_SYNTH_SUCCESS;
}

} // extern "C"
