// simd-bridge/cpp/spatial_packet_synthesizer.cpp
#include <stdint.h>
#include <stddef.h>
#include <vector>
#include <algorithm>
#include <cstring>

#pragma pack(push, 1)
struct AlignedKeyframeChunk64B {
    uint32_t morton_code;       // 0..3: 30-bit Morton index for radix sorting
    uint16_t slot_index;        // 4..5: Slot in the 256-element N64 arena
    uint16_t cluster_id;        // 6..7: k-Means Top-K assignment
    float position[3];          // 8..19: 12B X, Y, Z coordinates
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

    // Alignment verification: ensure base pointer is 64-byte aligned for AVX-512 loads
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

} // extern "C"
