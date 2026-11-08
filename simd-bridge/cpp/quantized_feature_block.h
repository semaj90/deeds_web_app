// simd-bridge/cpp/quantized_feature_block.h
#pragma once
#include <stdint.h>
#include <stddef.h>
#include <vector>
#include <stdexcept>

namespace atlas {

enum BitWidth : uint8_t {
    BITS_2 = 2,
    BITS_3 = 3,
    BITS_4 = 4
};

inline size_t packed_byte_length(size_t num_codes, BitWidth bits) {
    return (num_codes * bits + 7) / 8;
}

inline void pack_codes(const uint8_t* in_codes, size_t num_codes, BitWidth bits, uint8_t* out_bytes) {
    const uint8_t mask = (1 << bits) - 1;
    const size_t total_bytes = packed_byte_length(num_codes, bits);
    for (size_t b = 0; b < total_bytes; ++b) {
        out_bytes[b] = 0;
    }

    for (size_t i = 0; i < num_codes; ++i) {
        const uint8_t val = in_codes[i];
        if (val > mask) {
            throw std::out_of_range("QUANT_CODE_OUT_OF_RANGE");
        }

        const size_t bit_offset = i * bits;
        const size_t byte_index = bit_offset >> 3;
        const size_t shift = bit_offset & 7;

        out_bytes[byte_index] |= static_cast<uint8_t>((val << shift) & 0xFF);

        if (shift + bits > 8) {
            out_bytes[byte_index + 1] |= static_cast<uint8_t>(val >> (8 - shift));
        }
    }
}

inline uint8_t unpack_code(const uint8_t* in_bytes, size_t index, BitWidth bits) {
    const size_t bit_offset = index * bits;
    const size_t byte_index = bit_offset >> 3;
    const size_t shift = bit_offset & 7;

    const uint16_t b0 = in_bytes[byte_index];
    const uint16_t b1 = in_bytes[byte_index + 1];
    const uint16_t word = b0 | (b1 << 8);

    const uint8_t mask = (1 << bits) - 1;
    return static_cast<uint8_t>((word >> shift) & mask);
}

} // namespace atlas
