#include "gpu_feature_tile.hpp"

#include <cassert>
#include <chrono>
#include <iostream>
#include <vector>

int main() {
    std::cout << "[GPU-TILE-SMOKE] Testing AtlasFeatureRow (24B) & SIMT Filter Kernel...\n";

    // 1. Verify ABI layout
    assert(sizeof(atlas::gpu::AtlasFeatureRow) == 24);
    assert(alignof(atlas::gpu::AtlasFeatureRow) == 4);

    atlas::gpu::AtlasFeatureRow sample{};
    sample.candidate_ordinal = 42;
    sample.domain_id = 2; // e.g. ui
    sample.symbol_kind_id = 5; // e.g. component
    atlas::gpu::set_feature_mask_64(sample, 0x0000000100000005ULL); // bits 0, 2, and 32
    sample.relation_offset = 1200;
    sample.relation_count = 8;
    sample.diagnostic_flags = 0;

    assert(atlas::gpu::get_feature_mask_64(sample) == 0x0000000100000005ULL);
    std::cout << "  PASS: 24-byte layout, pack pragma, and 64-bit bitmask verified.\n";

    // 2. Generate 16,384 synthetic candidate rows
    constexpr std::size_t N = 16384;
    std::vector<atlas::gpu::AtlasFeatureRow> rows(N);

    for (std::size_t i = 0; i < N; ++i) {
        auto& r = rows[i];
        r.candidate_ordinal = static_cast<std::uint32_t>(i);
        r.domain_id = static_cast<std::uint16_t>((i % 9) + 1); // domains 1..9
        r.symbol_kind_id = static_cast<std::uint16_t>((i % 16) + 1);

        // Assign feature mask patterns
        std::uint64_t mask = 0;
        if (i % 2 == 0) mask |= (1ULL << 0); // svelte.runes.state
        if (i % 3 == 0) mask |= (1ULL << 1); // svelte.component.props
        if (i % 5 == 0) mask |= (1ULL << 32); // extended feature
        atlas::gpu::set_feature_mask_64(r, mask);

        r.relation_offset = static_cast<std::uint32_t>(i * 4);
        r.relation_count = static_cast<std::uint16_t>(i % 10);
        r.diagnostic_flags = static_cast<std::uint16_t>(i % 3 == 0 ? 1 : 0);
    }

    // 3. Filter by domain 2 (ui) and required feature bit 0
    std::vector<std::uint32_t> matched_ordinals(N, 0);
    const auto t0 = std::chrono::high_resolution_clock::now();

    const std::size_t count = atlas::gpu::filter_feature_rows_simt(
        rows.data(),
        rows.size(),
        2, // required domain 2
        (1ULL << 0), // required bit 0
        matched_ordinals.data(),
        N
    );

    const auto t1 = std::chrono::high_resolution_clock::now();
    const double us = std::chrono::duration<double, std::micro>(t1 - t0).count();

    std::cout << "  PASS: Filtered " << N << " rows -> " << count << " matches in " << us << " us ("
              << (static_cast<double>(N) / us * 1e6 / 1e6) << " M rows/sec).\n";

    // 4. Verify against scalar oracle
    std::size_t oracle_count = 0;
    for (std::size_t i = 0; i < N; ++i) {
        const auto& r = rows[i];
        if (r.domain_id == 2 && (atlas::gpu::get_feature_mask_64(r) & (1ULL << 0)) == (1ULL << 0)) {
            assert(oracle_count < count);
            assert(matched_ordinals[oracle_count] == r.candidate_ordinal);
            oracle_count++;
        }
    }
    assert(oracle_count == count);
    std::cout << "  PASS: 100% bit-exact agreement with scalar oracle.\n";

    std::cout << "[GPU-TILE-SMOKE] ALL TESTS PASSED SUCCESSFULLY.\n";
    return 0;
}
