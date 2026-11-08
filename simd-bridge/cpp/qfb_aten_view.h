// simd-bridge/cpp/qfb_aten_view.h
#pragma once
#include <cstdint>
#include <cstddef>

#pragma pack(push, 1)
struct alignas(64) AlignedQuantizedPacketV1 {
    uint32_t magic;              // 0..3:   0x41514642 ("AQFB")
    uint16_t version;            // 4..5:   1
    uint8_t  bits_per_value;     // 6:      2, 3, or 4
    uint8_t  rotation_variant;   // 7:      0=none, 1=isoquant_fast, 2=isoquant_full
    uint16_t dims;               // 8..9:   128, 256, 512
    uint16_t occupancy_group_id; // 10..11: 0..25 (for 6,527 rows @ 256 rows/group)
    uint32_t row_count;          // 12..15: <= 256 per occupancy packet
    float    qL[4];              // 16..31: 16B Unit quaternion Left (w, x, y, z)
    float    qR[4];              // 32..47: 16B Unit quaternion Right (w, x, y, z)
    float    poly_coeffs[3];     // 48..59: 12B Compander polynomial / scale LUT params
    uint8_t  nes_domain_lut;     // 60:     NES Domain taxonomy LUT byte
    uint8_t  lod_tier;           // 61:     0=HOT, 1=WARM, 2=COLD
    uint16_t reserved_pad;       // 62..63: Pads header to exactly 64 bytes
};
#pragma pack(pop)

static_assert(sizeof(AlignedQuantizedPacketV1) == 64, "Header must be 1 cache line (64B)");
