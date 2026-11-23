// Phase 15.A3: C++ mirror of the 4bpp indexed-palette quantizer owned by
// sveltekit-frontend/src/lib/splat/indexed-palette-texture-v1.ts.
// Must produce byte-identical packed output to the TypeScript reference (parity spec).
// Rules: index 0 is transparent (alpha <= threshold); nearest opaque index over
// palette 1..15 by integer RGB distance 30*dr^2 + 59*dg^2 + 11*db^2 (ties go to the
// lower index); even pixels occupy the low nibble, odd pixels the high nibble.
#ifndef ATLAS_INDEXED_PALETTE_4BPP_H
#define ATLAS_INDEXED_PALETTE_4BPP_H

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <vector>

namespace atlas_indexed_palette {

constexpr std::uint64_t kPixelLimit = 4194304ULL;

// Same RGBA values as INDEXED_PALETTE16_V1 (index order 0..15).
constexpr std::uint8_t kPalette[16][4] = {
    {0, 0, 0, 0},         {18, 19, 22, 255},    {66, 23, 25, 255},   {139, 30, 34, 255},
    {53, 40, 32, 255},    {104, 69, 47, 255},   {136, 130, 119, 255}, {212, 165, 154, 255},
    {247, 245, 238, 255}, {184, 138, 53, 255},  {229, 169, 60, 255}, {242, 139, 56, 255},
    {184, 90, 55, 255},   {91, 123, 147, 255},  {56, 189, 248, 255}, {151, 207, 172, 255},
};

inline std::uint8_t nearest_opaque_index(std::uint8_t r, std::uint8_t g, std::uint8_t b) {
    std::uint8_t best = 1;
    std::int64_t best_distance = INT64_MAX;
    for (std::uint8_t i = 1; i < 16; ++i) {
        const std::int64_t dr = static_cast<std::int64_t>(r) - kPalette[i][0];
        const std::int64_t dg = static_cast<std::int64_t>(g) - kPalette[i][1];
        const std::int64_t db = static_cast<std::int64_t>(b) - kPalette[i][2];
        const std::int64_t distance = 30 * dr * dr + 59 * dg * dg + 11 * db * db;
        if (distance < best_distance) {
            best_distance = distance;
            best = i;
        }
    }
    return best;
}

// Packs width*height RGBA pixels into ceil(pixels/2) bytes. Throws on invalid input.
inline std::vector<std::uint8_t> quantize_rgba_to_4bpp(
    std::uint32_t width,
    std::uint32_t height,
    const std::uint8_t* rgba,
    std::size_t rgba_length,
    std::uint8_t alpha_threshold = 0) {
    if (width == 0 || height == 0) throw std::invalid_argument("INDEXED_DIMENSIONS_INVALID");
    const std::uint64_t pixels = static_cast<std::uint64_t>(width) * height;
    if (pixels > kPixelLimit) throw std::invalid_argument("INDEXED_PIXEL_LIMIT");
    if (rgba == nullptr || rgba_length != pixels * 4) throw std::invalid_argument("INDEXED_RGBA_LENGTH");
    std::vector<std::uint8_t> out((pixels + 1) / 2, 0);
    for (std::uint64_t p = 0; p < pixels; ++p) {
        const std::uint8_t* px = rgba + p * 4;
        const std::uint8_t index = px[3] <= alpha_threshold ? 0 : nearest_opaque_index(px[0], px[1], px[2]);
        out[p >> 1] |= (p & 1) ? static_cast<std::uint8_t>(index << 4) : index;
    }
    return out;
}

}  // namespace atlas_indexed_palette

#endif  // ATLAS_INDEXED_PALETTE_4BPP_H
