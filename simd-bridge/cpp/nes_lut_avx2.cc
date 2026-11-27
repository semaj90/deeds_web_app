// Isolated AVX2 translation unit for NES LUT bitmask filtering (NLUT-07 / CPU-AVX2-01).
// Compiled with per-file /arch:AVX2 (MSVC) or -mavx2 (GCC/Clang); runtime CPUID/XGETBV
// probing lives in baseline-compiled binding.cc to guarantee zero VEX instructions before probe.

#include "nes_lut_filter.h"

extern "C" bool nes_lut_match_mask_avx2_tu(
    const std::uint8_t* lut,
    std::size_t n,
    const std::uint8_t* allowed,
    std::size_t k,
    std::uint32_t* out) {
#if defined(__AVX2__)
  return nes_lut::match_mask_avx2(lut, n, allowed, k, out);
#else
  return nes_lut::match_mask_scalar(lut, n, allowed, k, out);
#endif
}
