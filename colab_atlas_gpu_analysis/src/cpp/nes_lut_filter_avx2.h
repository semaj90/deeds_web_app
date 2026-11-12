/**
 * simd-bridge/cpp/nes_lut_filter_avx2.h
 *
 * NLUT-07 (CPU-AVX2-01) AVX2 LUT Domain Lane Filtering Challenger & Scalar Oracle:
 * - Scalar reference oracle: zero-dependency, bit-exact baseline
 * - AVX2 SIMD challenger: 32-byte chunk processing with _mm256_cmpeq_epi8 / _mm256_shuffle_epi8
 * - Exact numerical/index parity across frozen cohorts (0, 1, 31, 32, 33, 64, 100, 6,527)
 * - Explicit fail-closed behavior on 0x00 (unresolved) and > 0x0A (out-of-bounds)
 * - Verified CPU runtime feature detection with automatic scalar fallback
 *
 * STRICTLY ZERO DEPENDENCIES ON LIBTORCH / PYTORCH / CUDA.
 */

#ifndef NES_LUT_FILTER_AVX2_H
#define NES_LUT_FILTER_AVX2_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#if defined(_WIN32)
  #define NES_LUT_API extern "C" __declspec(dllexport)
#else
  #define NES_LUT_API extern "C" __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define NES_LUT_UNRESOLVED_BYTE 0x00
#define NES_LUT_MIN_DOMAIN_BYTE 0x01
#define NES_LUT_MAX_DOMAIN_BYTE 0x0A

typedef enum NesLutFilterStatus {
    NES_LUT_FILTER_OK = 0,
    NES_LUT_FILTER_ERR_NULL_POINTER = -1,
    NES_LUT_FILTER_ERR_INVALID_DOMAIN = -2,
    NES_LUT_FILTER_ERR_BUFFER_TOO_SMALL = -3,
    NES_LUT_FILTER_ERR_UNSUPPORTED_HARDWARE = -4
} NesLutFilterStatus;

/**
 * Returns true if the host CPU supports AVX2 and BMI2 instructions.
 */
NES_LUT_API bool nes_lut_cpu_supports_avx2(void);

/**
 * Scalar Oracle: Filters lut_bytes for an exact target domain byte.
 * Target must be in [0x01..0x0A]; 0x00 and >0x0A fail closed and match 0 items.
 *
 * @param lut_bytes Array of N uint8_t domain bytes.
 * @param count Total number of items in cohort.
 * @param target_domain Target domain byte to match (1..10).
 * @param out_indices Buffer to receive matched item indices.
 * @param max_out Capacity of out_indices buffer.
 * @param out_matched Pointer receiving count of matched items.
 */
NES_LUT_API NesLutFilterStatus nes_lut_filter_scalar(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
);

/**
 * AVX2 Challenger: Vectorized 32-byte chunk filtering.
 * Remainder bytes (count % 32) are safely processed via scalar fallback.
 * Must yield bit-identical out_indices to nes_lut_filter_scalar.
 */
NES_LUT_API NesLutFilterStatus nes_lut_filter_avx2(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
);

/**
 * Scalar Oracle (Multi-Domain Mask): Filters lut_bytes against a 16-bit bitmask.
 * Bit d (1 <= d <= 10) in domain_mask selects domain d. Bit 0 is strictly ignored.
 */
NES_LUT_API NesLutFilterStatus nes_lut_filter_mask_scalar(
    const uint8_t* lut_bytes,
    size_t count,
    uint16_t domain_mask,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
);

/**
 * AVX2 Challenger (Multi-Domain Mask): Vectorized 16-entry LUT shuffle per 128-bit lane.
 * Remainder bytes (count % 32) are safely processed via scalar fallback.
 */
NES_LUT_API NesLutFilterStatus nes_lut_filter_mask_avx2(
    const uint8_t* lut_bytes,
    size_t count,
    uint16_t domain_mask,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched
);

/**
 * Adaptive Dispatcher:
 * If force_scalar is true or AVX2 is not supported by CPU, runs scalar oracle.
 * Otherwise runs AVX2 challenger.
 */
NES_LUT_API NesLutFilterStatus nes_lut_filter_dispatch(
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain,
    bool force_scalar,
    uint32_t* out_indices,
    size_t max_out,
    size_t* out_matched,
    bool* out_used_avx2
);

#ifdef __cplusplus
}
#endif

#endif /* NES_LUT_FILTER_AVX2_H */
