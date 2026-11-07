// atlas-native-core/src/spatial_packet_synthesizer.cpp
#include <stdint.h>
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

extern "C" {
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
    std::vector<AlignedKeyframeChunk64B> chunks(num_items);
    std::memset(out_bitset_mask, 0, 32);
    for (int i = 0; i < num_items && i < 256; ++i) {
        chunks[i].morton_code = in_morton[i];
        chunks[i].slot_index = static_cast<uint16_t>(i);
        chunks[i].cluster_id = in_clusters[i];
        std::memcpy(chunks[i].position, &in_positions[i * 3], 12);
        std::memcpy(chunks[i].rot_6d, &in_rot6d[i * 6], 24);
        std::memcpy(chunks[i].scale, &in_scales[i * 3], 12);
        chunks[i].flags = 1; // Verified
        chunks[i].reserved = 0;

        // Set occupancy bit in the 256-bit set
        int word_idx = i / 64;
        int bit_idx = i % 64;
        out_bitset_mask[word_idx] |= (1ULL << bit_idx);
    }
    // Radix / Morton code sorting for spatial cache coherence
    std::sort(chunks.begin(), chunks.end(), [](const AlignedKeyframeChunk64B& a, const AlignedKeyframeChunk64B& b) {
        return a.morton_code < b.morton_code;
    });
    std::memcpy(out_bytes, chunks.data(), num_items * sizeof(AlignedKeyframeChunk64B));
}
}
