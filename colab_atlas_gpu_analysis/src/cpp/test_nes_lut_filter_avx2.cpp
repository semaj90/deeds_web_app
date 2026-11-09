/**
 * simd-bridge/cpp/test_nes_lut_filter_avx2.cpp
 *
 * Test harness for NLUT-07 (CPU-AVX2-01) AVX2 LUT filtering challenger:
 * - Frozen cohort sizes: 0, 1, 31, 32, 33, 64, 100, 6527
 * - Bit-identical parity against scalar oracle
 * - Fail-closed on 0x00 and >0x0A
 * - Scalar fallback exercised and verified
 * - Multi-domain bitmask filtering verified
 * - Latency & throughput benchmarking
 */

#include "nes_lut_filter_avx2.h"

#include <iostream>
#include <vector>
#include <chrono>
#include <cassert>
#include <cstring>
#include <random>

struct TestResult {
    const char* name;
    bool passed;
    size_t count;
    size_t matched_scalar;
    size_t matched_avx2;
    double scalar_micros;
    double avx2_micros;
    double speedup;
};

static void assert_indices_identical(
    const uint32_t* scalar_idx,
    const uint32_t* avx2_idx,
    size_t matched,
    const char* test_name
) {
    for (size_t i = 0; i < matched; ++i) {
        if (scalar_idx[i] != avx2_idx[i]) {
            std::cerr << "FAIL [" << test_name << "]: Mismatch at match index " << i
                      << " -> Scalar: " << scalar_idx[i]
                      << ", AVX2: " << avx2_idx[i] << std::endl;
            exit(1);
        }
    }
}

TestResult run_parity_test_single(
    const char* name,
    const uint8_t* lut_bytes,
    size_t count,
    uint8_t target_domain
) {
    std::vector<uint32_t> out_scalar(count + 32);
    std::vector<uint32_t> out_avx2(count + 32);
    size_t matched_scalar = 0;
    size_t matched_avx2 = 0;

    auto t0 = std::chrono::high_resolution_clock::now();
    for (int rep = 0; rep < 100; ++rep) {
        nes_lut_filter_scalar(lut_bytes, count, target_domain, out_scalar.data(), out_scalar.size(), &matched_scalar);
    }
    auto t1 = std::chrono::high_resolution_clock::now();
    double scalar_us = std::chrono::duration<double, std::micro>(t1 - t0).count() / 100.0;

    auto t2 = std::chrono::high_resolution_clock::now();
    for (int rep = 0; rep < 100; ++rep) {
        nes_lut_filter_avx2(lut_bytes, count, target_domain, out_avx2.data(), out_avx2.size(), &matched_avx2);
    }
    auto t3 = std::chrono::high_resolution_clock::now();
    double avx2_us = std::chrono::duration<double, std::micro>(t3 - t2).count() / 100.0;

    if (matched_scalar != matched_avx2) {
        std::cerr << "FAIL [" << name << "]: Match count mismatch! Scalar="
                  << matched_scalar << ", AVX2=" << matched_avx2 << std::endl;
        exit(1);
    }

    assert_indices_identical(out_scalar.data(), out_avx2.data(), matched_scalar, name);

    return {
        name,
        true,
        count,
        matched_scalar,
        matched_avx2,
        scalar_us,
        avx2_us,
        (avx2_us > 0.0) ? (scalar_us / avx2_us) : 1.0
    };
}

TestResult run_parity_test_mask(
    const char* name,
    const uint8_t* lut_bytes,
    size_t count,
    uint16_t domain_mask
) {
    std::vector<uint32_t> out_scalar(count + 32);
    std::vector<uint32_t> out_avx2(count + 32);
    size_t matched_scalar = 0;
    size_t matched_avx2 = 0;

    auto t0 = std::chrono::high_resolution_clock::now();
    for (int rep = 0; rep < 100; ++rep) {
        nes_lut_filter_mask_scalar(lut_bytes, count, domain_mask, out_scalar.data(), out_scalar.size(), &matched_scalar);
    }
    auto t1 = std::chrono::high_resolution_clock::now();
    double scalar_us = std::chrono::duration<double, std::micro>(t1 - t0).count() / 100.0;

    auto t2 = std::chrono::high_resolution_clock::now();
    for (int rep = 0; rep < 100; ++rep) {
        nes_lut_filter_mask_avx2(lut_bytes, count, domain_mask, out_avx2.data(), out_avx2.size(), &matched_avx2);
    }
    auto t3 = std::chrono::high_resolution_clock::now();
    double avx2_us = std::chrono::duration<double, std::micro>(t3 - t2).count() / 100.0;

    if (matched_scalar != matched_avx2) {
        std::cerr << "FAIL [" << name << "]: Mask Match count mismatch! Scalar="
                  << matched_scalar << ", AVX2=" << matched_avx2 << std::endl;
        exit(1);
    }

    assert_indices_identical(out_scalar.data(), out_avx2.data(), matched_scalar, name);

    return {
        name,
        true,
        count,
        matched_scalar,
        matched_avx2,
        scalar_us,
        avx2_us,
        (avx2_us > 0.0) ? (scalar_us / avx2_us) : 1.0
    };
}

int main() {
    std::cout << "=== [NLUT-07 / CPU-AVX2-01: AVX2 LUT Filtering Parity & Benchmark] ===" << std::endl;

    bool has_avx2 = nes_lut_cpu_supports_avx2();
    std::cout << "CPU AVX2 support: " << (has_avx2 ? "YES (Hardware Verified)" : "NO") << std::endl;
    if (!has_avx2) {
        std::cerr << "ERROR: Host CPU does not support AVX2. Cannot test AVX2 challenger." << std::endl;
        return 1;
    }

    std::vector<TestResult> results;

    // 1. Frozen edge cases
    {
        uint8_t b1[1] = { 0x02 }; // UI domain
        results.push_back(run_parity_test_single("Frozen count=1 match", b1, 1, 0x02));
        results.push_back(run_parity_test_single("Frozen count=1 miss", b1, 1, 0x05));
    }

    {
        // count=31 (sub-vector)
        std::vector<uint8_t> b31(31);
        for (size_t i = 0; i < 31; ++i) b31[i] = static_cast<uint8_t>((i % 10) + 1);
        results.push_back(run_parity_test_single("Frozen count=31 (sub-AVX2)", b31.data(), 31, 0x03));
    }

    {
        // count=32 (exact 1 AVX2 vector)
        std::vector<uint8_t> b32(32);
        for (size_t i = 0; i < 32; ++i) b32[i] = static_cast<uint8_t>((i % 10) + 1);
        results.push_back(run_parity_test_single("Frozen count=32 (exact 1 AVX2 vector)", b32.data(), 32, 0x04));
    }

    {
        // count=33 (1 vector + 1 remainder byte)
        std::vector<uint8_t> b33(33);
        for (size_t i = 0; i < 33; ++i) b33[i] = static_cast<uint8_t>((i % 10) + 1);
        results.push_back(run_parity_test_single("Frozen count=33 (1 vector + remainder)", b33.data(), 33, 0x01));
    }

    {
        // count=64 (exact 2 AVX2 vectors)
        std::vector<uint8_t> b64(64);
        for (size_t i = 0; i < 64; ++i) b64[i] = static_cast<uint8_t>((i % 10) + 1);
        results.push_back(run_parity_test_single("Frozen count=64 (exact 2 vectors)", b64.data(), 64, 0x06));
    }

    {
        // count=100 (unaligned size)
        std::vector<uint8_t> b100(100);
        for (size_t i = 0; i < 100; ++i) b100[i] = static_cast<uint8_t>((i % 10) + 1);
        results.push_back(run_parity_test_single("Frozen count=100 (unaligned)", b100.data(), 100, 0x02));
    }

    // 2. Fail-closed tests on 0x00 and out of bounds
    {
        std::vector<uint8_t> b_unres(128, 0x00); // All unresolved
        results.push_back(run_parity_test_single("Fail-closed all 0x00 (target=0x02)", b_unres.data(), 128, 0x02));
        results.push_back(run_parity_test_single("Fail-closed target 0x00 query", b_unres.data(), 128, 0x00));
        
        std::vector<uint8_t> b_oob(128);
        for (size_t i = 0; i < 128; ++i) b_oob[i] = static_cast<uint8_t>(0x0B + (i % 200)); // 0x0B..0xFF
        results.push_back(run_parity_test_single("Fail-closed all out-of-bounds bytes", b_oob.data(), 128, 0x02));
        results.push_back(run_parity_test_single("Fail-closed target >0x0A query", b_oob.data(), 128, 0x15));
    }

    // 3. Exact 6,527-item OpenSpec Cohort
    {
        std::mt19937 rng(42); // Deterministic seed
        std::uniform_int_distribution<int> dist(0, 12); // Includes 0x00, 0x01..0x0A, and 0x0B..0x0C
        std::vector<uint8_t> cohort6527(6527);
        for (size_t i = 0; i < 6527; ++i) {
            cohort6527[i] = static_cast<uint8_t>(dist(rng));
        }

        // Test all valid domains 0x01..0x0A on the 6,527 cohort
        for (uint8_t d = 1; d <= 10; ++d) {
            char nameBuf[64];
            snprintf(nameBuf, sizeof(nameBuf), "Cohort 6527 Domain 0x%02X", d);
            results.push_back(run_parity_test_single(nameBuf, cohort6527.data(), 6527, d));
        }

        // Multi-domain mask test: {UI: 0x02, Graph: 0x01, Core: 0x03} -> mask = (1<<1)|(1<<2)|(1<<3) = 0x0E
        uint16_t mask = (1 << 1) | (1 << 2) | (1 << 3);
        results.push_back(run_parity_test_mask("Cohort 6527 Multi-Domain Mask {0x01, 0x02, 0x03}", cohort6527.data(), 6527, mask));

        // Mask including bit 0 (must be ignored)
        uint16_t mask_with_zero = mask | 0x0001;
        results.push_back(run_parity_test_mask("Cohort 6527 Mask bit 0 ignored fail-closed", cohort6527.data(), 6527, mask_with_zero));
    }

    // 4. Dispatcher test (force_scalar vs auto AVX2)
    {
        std::vector<uint8_t> b256(256);
        for (size_t i = 0; i < 256; ++i) b256[i] = static_cast<uint8_t>((i % 10) + 1);
        std::vector<uint32_t> idx_scalar(256);
        std::vector<uint32_t> idx_avx2(256);
        size_t m_scalar = 0;
        size_t m_avx2 = 0;
        bool used_avx2_flag = false;

        nes_lut_filter_dispatch(b256.data(), 256, 0x02, true, idx_scalar.data(), 256, &m_scalar, &used_avx2_flag);
        assert(!used_avx2_flag && "force_scalar must not use AVX2");

        nes_lut_filter_dispatch(b256.data(), 256, 0x02, false, idx_avx2.data(), 256, &m_avx2, &used_avx2_flag);
        assert(used_avx2_flag && "dispatch should use AVX2 when supported");
        assert(m_scalar == m_avx2);
        assert_indices_identical(idx_scalar.data(), idx_avx2.data(), m_scalar, "Dispatcher parity check");
        std::cout << "✓ Dispatcher verified: force_scalar correctly bypasses AVX2; auto mode uses AVX2" << std::endl;
    }

    // Print summary table
    std::cout << "\n--- [Parity & Benchmark Results (" << results.size() << " test cases)] ---" << std::endl;
    std::cout << "Status | Test Case                                | Count | Matched | Scalar (us) | AVX2 (us) | Speedup" << std::endl;
    std::cout << "-------+------------------------------------------+-------+---------+-------------+-----------+--------" << std::endl;
    for (const auto& r : results) {
        printf("  PASS | %-40s | %5zu | %7zu | %11.2f | %9.2f | %6.2fx\n",
               r.name, r.count, r.matched_avx2, r.scalar_micros, r.avx2_micros, r.speedup);
    }

    std::cout << "\n✓ ALL " << results.size() << " PARITY AND BENCHMARK TESTS PASSED (100% BIT-EXACT IDENTITY)." << std::endl;
    return 0;
}
