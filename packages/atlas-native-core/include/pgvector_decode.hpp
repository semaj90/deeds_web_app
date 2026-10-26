#pragma once

#include <bit>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstring>

namespace atlas::pgvector {

/**
 * Unpacks pgvector's binary network representation (vector_send format) into native float array:
 * 4-byte header:
 *   uint16_t dim (big-endian)
 *   uint16_t unused / reserved (0)
 * followed by dim * 4 bytes of big-endian IEEE-754 float32 values.
 *
 * For dim=768, length must be exactly 4 + 768 * 4 = 3076 bytes.
 * Bytewise assembly ensures strict alignment and aliasing safety across all architectures.
 */
inline bool unpack_pgvector_768(
    const uint8_t* raw,
    size_t length,
    float* output
) noexcept {
    if (!raw || !output || length != 3076) return false;
    const unsigned dim = (static_cast<unsigned>(raw[0]) << 8) | raw[1];
    if (dim != 768 || raw[2] != 0 || raw[3] != 0) return false;
    for (size_t i = 0; i < 768; ++i) {
        const auto* p = raw + 4 + 4 * i;
        const uint32_t bits = (static_cast<uint32_t>(p[0]) << 24)
                            | (static_cast<uint32_t>(p[1]) << 16)
                            | (static_cast<uint32_t>(p[2]) << 8)
                            | static_cast<uint32_t>(p[3]);
        const float value = std::bit_cast<float>(bits);
        if (!std::isfinite(value)) return false;
        output[i] = value;
    }
    return true;
}

} // namespace atlas::pgvector
