// NES LUT byte filter (NLUT-07): scalar reference + AVX2 challenger.
// CPU only. Mask layout matches python/atlas_compute/nes_lut_filter_v1.py:
// bit i of out[i >> 5] (LSB-first) is 1 iff lut[i] is in allowed[0..k).
// Each full 32-byte block is exactly one output word, so the AVX2 path emits the same words.
// Fail-closed: invalid arguments return false and write nothing.
#pragma once

#include <cstddef>
#include <cstdint>

#if defined(__AVX2__)
#include <immintrin.h>
#endif

namespace nes_lut {

constexpr std::size_t kMaxAllowed = 16;

inline bool valid_allowed(const std::uint8_t* allowed, std::size_t k) {
    if (allowed == nullptr || k == 0 || k > kMaxAllowed) return false;
    for (std::size_t a = 0; a < k; ++a) {
        for (std::size_t b = a + 1; b < k; ++b) {
            if (allowed[a] == allowed[b]) return false;
        }
    }
    return true;
}

// Scalar oracle. out must hold (n + 31) / 32 words.
inline bool match_mask_scalar(const std::uint8_t* lut, std::size_t n,
                              const std::uint8_t* allowed, std::size_t k,
                              std::uint32_t* out) {
    if (!valid_allowed(allowed, k) || (n > 0 && lut == nullptr) || out == nullptr) return false;
    const std::size_t words = (n + 31) / 32;
    for (std::size_t w = 0; w < words; ++w) out[w] = 0;
    for (std::size_t i = 0; i < n; ++i) {
        for (std::size_t a = 0; a < k; ++a) {
            if (lut[i] == allowed[a]) {
                out[i >> 5] |= (std::uint32_t{1} << (i & 31));
                break;
            }
        }
    }
    return true;
}

#if defined(__AVX2__)
// AVX2 challenger: per full 32-byte block, OR the movemask of cmpeq against each allowed byte.
// Allowed values are unique, so each lane matches at most one comparison and the ORs never collide.
// The tail (n % 32 bytes) runs through the scalar rule.
inline bool match_mask_avx2(const std::uint8_t* lut, std::size_t n,
                            const std::uint8_t* allowed, std::size_t k,
                            std::uint32_t* out) {
    if (!valid_allowed(allowed, k) || (n > 0 && lut == nullptr) || out == nullptr) return false;
    const std::size_t full = n / 32;
    __m256i needles[kMaxAllowed];
    for (std::size_t a = 0; a < k; ++a) needles[a] = _mm256_set1_epi8(static_cast<char>(allowed[a]));
    for (std::size_t blk = 0; blk < full; ++blk) {
        const __m256i v = _mm256_loadu_si256(reinterpret_cast<const __m256i*>(lut + blk * 32));
        std::uint32_t bits = 0;
        for (std::size_t a = 0; a < k; ++a) {
            bits |= static_cast<std::uint32_t>(_mm256_movemask_epi8(_mm256_cmpeq_epi8(v, needles[a])));
        }
        out[blk] = bits;
    }
    const std::size_t tail_start = full * 32;
    if (tail_start < n) {
        std::uint32_t bits = 0;
        for (std::size_t i = tail_start; i < n; ++i) {
            for (std::size_t a = 0; a < k; ++a) {
                if (lut[i] == allowed[a]) {
                    bits |= (std::uint32_t{1} << (i - tail_start));
                    break;
                }
            }
        }
        out[full] = bits;
    }
    return true;
}
#endif

}  // namespace nes_lut
