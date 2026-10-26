#pragma once

#include <array>
#include <bit>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace atlas::native {

constexpr std::size_t PGVECTOR_768_DIM = 768;
constexpr std::size_t PGVECTOR_768_BINARY_BYTES = 4 + PGVECTOR_768_DIM * sizeof(float);

inline bool unpack_pgvector_768(
    const std::uint8_t* raw,
    std::size_t length,
    float* output
) noexcept {
    if (!raw || !output || length != 3076) return false;
    const unsigned dim = (static_cast<unsigned>(raw[0]) << 8) | raw[1];
    if (dim != 768 || raw[2] != 0 || raw[3] != 0) return false;
    for (std::size_t i = 0; i < 768; ++i) {
        const auto* p = raw + 4 + 4 * i;
        const std::uint32_t bits = (static_cast<std::uint32_t>(p[0]) << 24)
                                | (static_cast<std::uint32_t>(p[1]) << 16)
                                | (static_cast<std::uint32_t>(p[2]) << 8)
                                | static_cast<std::uint32_t>(p[3]);
        const float value = std::bit_cast<float>(bits);
        if (!std::isfinite(value)) return false;
        output[i] = value;
    }
    return true;
}

inline bool unpack_pgvector_binary_768(
    const std::uint8_t* raw,
    std::size_t byte_length,
    float* output_768
) noexcept {
    return unpack_pgvector_768(raw, byte_length, output_768);
}

} // namespace atlas::native

