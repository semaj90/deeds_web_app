#include "memory_registry.hpp"
#include "simd_executors.hpp"
#include "pgvector_binary.hpp"

#include <cassert>
#include <iostream>
#include <vector>

int main() {
    std::cout << "[REG-01/02/03] Running Memory Registry & SIMD Suite...\n";

    // 1. REG-01: Descriptor Contract & Revision Validation
    atlas::memory::MemoryRegistry registry(4 * 1024 * 1024); // 4 MiB slab arena

    atlas::memory::AtlasMemoryEntryV1 invalid_entry{};
    invalid_entry.canonical_id = "chunk:test:invalid";
    // Missing revisions -> must be rejected
    assert(!registry.register_entry(invalid_entry));

    atlas::memory::AtlasMemoryEntryV1 valid_entry{};
    valid_entry.canonical_id = "chunk:test:001";
    valid_entry.packet_key = "packet:001";
    valid_entry.source_revision = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    valid_entry.workspace_revision = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    valid_entry.representation_revision = "repr.turbovec.v1";
    valid_entry.byte_length = 128;
    valid_entry.alignment = 64;

    assert(registry.register_entry(valid_entry));
    assert(registry.entry_count() == 1);

    auto retrieved = registry.get_entry("chunk:test:001");
    assert(retrieved.has_value());
    assert(retrieved->packet_key == "packet:001");
    std::cout << "  PASS: REG-01 Descriptor registration & revision refusal verified.\n";

    // 2. REG-02: 64-byte Cacheline Aligned Slab Allocator
    auto* p1 = registry.arena().allocate(128);
    assert(p1 != nullptr);
    assert(reinterpret_cast<std::uintptr_t>(p1) % 64 == 0); // 64-byte aligned!

    auto* p2 = registry.arena().allocate(64);
    assert(p2 != nullptr);
    assert(reinterpret_cast<std::uintptr_t>(p2) % 64 == 0);
    assert(p2 >= p1 + 128);

    assert(registry.arena().active_leases() == 2);
    assert(registry.arena().allocated() >= 192);
    std::cout << "  PASS: REG-02 Cacheline alignment (64B) & lease counting verified.\n";

    // 3. REG-03: SIMD 128-bit Hamming, Jaccard, and NES LUT Oracles
    atlas::simd::Bitset128 query{0x0F0F0F0F0F0F0F0FULL, 0xAAAAAAAAAAAAAAAAULL};
    atlas::simd::Bitset128 target{0x0F0F0F0F0F0F0F0FULL, 0x5555555555555555ULL};

    const auto fast_dist = atlas::simd::hamming_distance_128_fast(query, target);
    const auto oracle_dist = atlas::simd::hamming_distance_128_scalar(
        reinterpret_cast<const std::uint8_t*>(&query),
        reinterpret_cast<const std::uint8_t*>(&target)
    );
    assert(fast_dist == oracle_dist);
    assert(fast_dist == 64); // Exactly 64 bits differ in the high word

    const auto fast_jaccard = atlas::simd::jaccard_similarity_128_fast(query, target);
    const auto oracle_jaccard = atlas::simd::jaccard_similarity_128_scalar(
        reinterpret_cast<const std::uint8_t*>(&query),
        reinterpret_cast<const std::uint8_t*>(&target)
    );
    assert(std::abs(fast_jaccard - oracle_jaccard) < 1e-6f);

    // NES LUT scoring test
    std::array<float, 256> lut_table{};
    for (std::size_t i = 0; i < 256; ++i) lut_table[i] = static_cast<float>(i) * 0.25f;
    std::array<std::uint8_t, 32> packed_tile{};
    packed_tile.fill(4); // 4 * 0.25 = 1.0 per byte -> 32.0 total
    const float lut_score = atlas::simd::score_nes_lut_scalar(packed_tile.data(), lut_table.data(), packed_tile.size());
    assert(std::abs(lut_score - 32.0f) < 1e-6f);
    std::cout << "  PASS: REG-03 Bit-exact oracle parity for Hamming, Jaccard, and NES LUT verified.\n";

    // Batch Benchmark (32,768 candidates)
    constexpr std::size_t BATCH_SIZE = 32768;
    std::vector<atlas::simd::Bitset128> candidates(BATCH_SIZE);
    for (std::size_t i = 0; i < BATCH_SIZE; ++i) {
        candidates[i].lo = query.lo ^ static_cast<std::uint64_t>(i);
        candidates[i].hi = query.hi ^ static_cast<std::uint64_t>(i * 3);
    }
    std::vector<std::uint32_t> distances(BATCH_SIZE, 0);

    const auto bench = atlas::simd::benchmark_hamming128_batch(
        &query, candidates.data(), distances.data(), BATCH_SIZE
    );
    assert(bench.oracle_parity);
    std::cout << "  PASS: Batch 32,768 SIMD: " << bench.duration_microseconds << " us ("
              << (bench.candidates_per_second / 1e6) << " M candidates/s, oracle parity: YES).\n";

    std::cout << "[REG-01/02/03] ALL TESTS PASSED SUCCESSFULLY.\n";
    return 0;
}
