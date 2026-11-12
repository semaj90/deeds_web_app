// scripts/spatial/quantized_feature_block_cpp_check.cpp
// C++ column for verify-quantized-feature-block-cross-language.mjs (Milestone 3A).
// Uses the REAL simd-bridge/cpp/quantized_feature_block.h. Same LCG test codes as the verifier's makeTestCodes().
// Output (one line per config): "<dim> <bits> <packed_hex> <roundtrip 0|1>" then "OOR <0|1>".
// Round-trip note: atlas::unpack_code always reads in_bytes[byte_index + 1]; for the last code that is one byte past the
// packed payload (masked off, but an out-of-bounds read). This check pads the buffer by one zero byte to stay defined.
#include "quantized_feature_block.h"
#include <cstdio>
#include <vector>

int main() {
    const int dims[] = {64, 128, 256, 512};
    const int bitsList[] = {2, 3, 4};
    for (int dim : dims) {
        for (int b : bitsList) {
            std::vector<uint8_t> codes(dim);
            uint32_t state = 0x12345678u;
            const uint8_t mask = static_cast<uint8_t>((1 << b) - 1);
            for (int i = 0; i < dim; ++i) {
                state = state * 1664525u + 1013904223u;
                codes[i] = static_cast<uint8_t>(state & mask);
            }
            const atlas::BitWidth bw = static_cast<atlas::BitWidth>(b);
            const size_t n = atlas::packed_byte_length(dim, bw);
            std::vector<uint8_t> packed(n + 1, 0);  // +1 pad: see header note above
            atlas::pack_codes(codes.data(), dim, bw, packed.data());
            int roundtrip = 1;
            for (int i = 0; i < dim; ++i) {
                if (atlas::unpack_code(packed.data(), static_cast<size_t>(i), bw) != codes[i]) { roundtrip = 0; break; }
            }
            std::printf("%d %d ", dim, b);
            for (size_t i = 0; i < n; ++i) std::printf("%02x", packed[i]);
            std::printf(" %d\n", roundtrip);
        }
    }
    bool threw = false;
    try { uint8_t c = 4, o[1]; atlas::pack_codes(&c, 1, atlas::BITS_2, o); } catch (...) { threw = true; }
    std::printf("OOR %d\n", threw ? 1 : 0);
    return 0;
}
