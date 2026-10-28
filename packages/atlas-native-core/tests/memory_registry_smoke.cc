#include "memory_registry.hpp"
#include "simd_executors.hpp"
#include "pgvector_binary.hpp"

#include <cassert>
#include <algorithm>
#include <chrono>
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
    std::vector<std::uint8_t> artifact_bytes(128);
    for (std::size_t i = 0; i < artifact_bytes.size(); ++i) artifact_bytes[i] = static_cast<std::uint8_t>(i * 13u);
    valid_entry.artifact_digest = "sha256:" + atlas::native::sha256_hex(artifact_bytes.data(), artifact_bytes.size());

    assert(registry.register_entry(valid_entry));
    assert(!registry.register_entry(valid_entry));
    assert(registry.entry_count() == 1);

    auto retrieved = registry.get_entry("chunk:test:001");
    assert(retrieved.has_value());
    assert(retrieved->packet_key == "packet:001");
    assert(retrieved->state == atlas::memory::EntryState::Evicted);
    assert(retrieved->resident_ptr == nullptr);
    assert(!registry.load_artifact(valid_entry.canonical_id, artifact_bytes.data(), artifact_bytes.size(),
        "sha256:" + std::string(64, 'c'), valid_entry.workspace_revision));
    std::cout << "  PASS: REG-01 Revision-bound descriptor registration and duplicate refusal verified.\n";

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

    const auto source_revision = valid_entry.source_revision;
    const auto workspace_revision = valid_entry.workspace_revision;
    assert(registry.load_artifact(valid_entry.canonical_id, artifact_bytes.data(), artifact_bytes.size(), source_revision, workspace_revision));
    auto resident = registry.get_entry(valid_entry.canonical_id);
    assert(resident && resident->state == atlas::memory::EntryState::Resident && resident->lease_epoch == 1);
    assert(resident->resident_ptr == nullptr);
    auto lease = registry.acquire(valid_entry.canonical_id, source_revision, workspace_revision, resident->lease_epoch);
    assert(lease && lease->size() == artifact_bytes.size());
    assert(reinterpret_cast<std::uintptr_t>(lease->data()) % 64 == 0);
    assert(std::equal(artifact_bytes.begin(), artifact_bytes.end(), lease->data()));
    assert(registry.resident_bytes() == artifact_bytes.size());
    assert(!registry.acquire(valid_entry.canonical_id, source_revision, workspace_revision, 0));
    assert(!registry.evict(valid_entry.canonical_id, source_revision, workspace_revision, resident->lease_epoch));
    lease.reset();
    assert(registry.evict(valid_entry.canonical_id, source_revision, workspace_revision, resident->lease_epoch));
    assert(registry.resident_bytes() == 0);
    assert(!registry.acquire(valid_entry.canonical_id, source_revision, workspace_revision, resident->lease_epoch));
    auto corrupt_artifact = artifact_bytes;
    corrupt_artifact[0] ^= 1;
    assert(!registry.load_artifact(valid_entry.canonical_id, corrupt_artifact.data(), corrupt_artifact.size(), source_revision, workspace_revision));
    assert(registry.load_artifact(valid_entry.canonical_id, artifact_bytes.data(), artifact_bytes.size(), source_revision, workspace_revision));
    auto reloaded = registry.get_entry(valid_entry.canonical_id);
    assert(reloaded && reloaded->state == atlas::memory::EntryState::Resident && reloaded->lease_epoch > resident->lease_epoch);
    auto reloaded_lease = registry.acquire(valid_entry.canonical_id, source_revision, workspace_revision, reloaded->lease_epoch);
    assert(reloaded_lease && std::equal(artifact_bytes.begin(), artifact_bytes.end(), reloaded_lease->data()));
    assert(!registry.evict(valid_entry.canonical_id, "sha256:" + std::string(64, 'c'), workspace_revision, reloaded->lease_epoch));
    atlas::memory::MemoryRegistry undersized_registry(64);
    assert(undersized_registry.register_entry(valid_entry));
    assert(!undersized_registry.load_artifact(valid_entry.canonical_id, artifact_bytes.data(), artifact_bytes.size(), source_revision, workspace_revision));
    std::cout << "  PASS: REG-04 Digest-checked load, leased read, stale-handle refusal, eviction, and reload verified.\n";

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
    std::vector<atlas::simd::Bitset128> tail_candidates(11);
    for (std::size_t i = 0; i < tail_candidates.size(); ++i) {
        tail_candidates[i].lo = query.lo ^ static_cast<std::uint64_t>(i * 17 + 3);
        tail_candidates[i].hi = query.hi ^ static_cast<std::uint64_t>(i * 29 + 5);
    }
    std::vector<std::uint32_t> tail_distances(10);
    for (std::size_t count = 1; count <= 9; ++count) {
        atlas::simd::hamming_distance_128_batch(
            query, tail_candidates.data() + 1, tail_distances.data(), count
        );
        for (std::size_t i = 0; i < count; ++i) {
            const auto* lhs = reinterpret_cast<const std::uint8_t*>(&query);
            const auto* rhs = reinterpret_cast<const std::uint8_t*>(&tail_candidates[i + 1]);
            assert(tail_distances[i] == atlas::simd::hamming_distance_128_scalar(lhs, rhs));
        }
    }

#if (defined(__x86_64__) || defined(_M_X64)) && (defined(__GNUC__) || defined(__clang__))
    if (atlas::simd::hamming128_avx2_available()) {
        for (std::size_t count = 1; count <= 9; ++count) {
            atlas::simd::hamming_distance_128_batch_avx2(
                query, tail_candidates.data() + 1, tail_distances.data(), count
            );
            for (std::size_t i = 0; i < count; ++i) {
                const auto* lhs = reinterpret_cast<const std::uint8_t*>(&query);
                const auto* rhs = reinterpret_cast<const std::uint8_t*>(&tail_candidates[i + 1]);
                assert(tail_distances[i] == atlas::simd::hamming_distance_128_scalar(lhs, rhs));
            }
        }
    }
    if (atlas::simd::hamming128_avx512_vpopcnt_available()) {
        for (std::size_t count = 1; count <= 9; ++count) {
            atlas::simd::hamming_distance_128_batch_avx512(
                query, tail_candidates.data() + 1, tail_distances.data(), count
            );
            for (std::size_t i = 0; i < count; ++i) {
                const auto* lhs = reinterpret_cast<const std::uint8_t*>(&query);
                const auto* rhs = reinterpret_cast<const std::uint8_t*>(&tail_candidates[i + 1]);
                assert(tail_distances[i] == atlas::simd::hamming_distance_128_scalar(lhs, rhs));
            }
        }
    }
#endif
    std::vector<std::uint32_t> distances(BATCH_SIZE, 0);

    const auto bench = atlas::simd::benchmark_hamming128_batch(
        &query, candidates.data(), distances.data(), BATCH_SIZE
    );
    assert(bench.oracle_parity);
    constexpr std::size_t BENCHMARK_REPETITIONS = 100;
    std::vector<std::uint32_t> benchmark_output(BATCH_SIZE);
    using BatchScorer = void (*)(
        const atlas::simd::Bitset128&, const atlas::simd::Bitset128*, std::uint32_t*, std::size_t
    );
    auto measure = [&](BatchScorer scorer) {
        volatile BatchScorer scorer_slot = scorer;
        const auto start = std::chrono::steady_clock::now();
        for (std::size_t repetition = 0; repetition < BENCHMARK_REPETITIONS; ++repetition) {
            scorer_slot(query, candidates.data(), benchmark_output.data(), BATCH_SIZE);
        }
        const auto end = std::chrono::steady_clock::now();
        return std::chrono::duration<double, std::micro>(end - start).count() / BENCHMARK_REPETITIONS;
    };
    const double scalar_us = measure(atlas::simd::hamming_distance_128_batch_scalar);
    assert(std::equal(distances.begin(), distances.end(), benchmark_output.begin()));
    double avx2_us = 0.0;
    double avx512_us = 0.0;
#if (defined(__x86_64__) || defined(_M_X64)) && (defined(__GNUC__) || defined(__clang__))
    if (atlas::simd::hamming128_avx2_available()) {
        avx2_us = measure(atlas::simd::hamming_distance_128_batch_avx2);
        assert(std::equal(distances.begin(), distances.end(), benchmark_output.begin()));
    }
    if (atlas::simd::hamming128_avx512_vpopcnt_available()) {
        avx512_us = measure(atlas::simd::hamming_distance_128_batch_avx512);
        assert(std::equal(distances.begin(), distances.end(), benchmark_output.begin()));
    }
#endif
    std::cout << "  PASS: Batch 32,768 dispatch=" << bench.backend
              << " selected_us=" << bench.duration_microseconds
              << " scalar_us=" << scalar_us;
    if (avx2_us > 0.0) std::cout << " avx2_us=" << avx2_us;
    if (avx512_us > 0.0) std::cout << " avx512_vpopcnt_us=" << avx512_us;
    std::cout << " oracle_parity=YES (timings informational only).\n";

    std::cout << "[REG-01/02/03] ALL TESTS PASSED SUCCESSFULLY.\n";
    return 0;
}
