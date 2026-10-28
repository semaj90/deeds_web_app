#pragma once
/**
 * @file gpu_feature_tile.hpp
 * @brief Compact 24-byte AtlasFeatureRow and bounded GPU-resident search tile engine.
 *
 * Implements Phase B deterministic bitencoded directory and symbol feature tiles
 * for SIMT/warp-level filtering and cuVS/cuTile consumption on RTX 3060 Ti (Ampere sm_86).
 */

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>

namespace atlas::gpu {

#pragma pack(push, 4)
/**
 * @struct AtlasFeatureRow
 * @brief Packed 24-byte structural and taxonomy descriptor.
 *
 * Layout (all offsets verified by static_assert):
 *   +0: uint32_t candidate_ordinal (4B)
 *   +4: uint16_t domain_id         (2B)
 *   +6: uint16_t symbol_kind_id    (2B)
 *   +8: uint32_t feature_mask_lo   (4B)
 *  +12: uint32_t feature_mask_hi   (4B)
 *  +16: uint32_t relation_offset   (4B)
 *  +20: uint16_t relation_count    (2B)
 *  +22: uint16_t diagnostic_flags  (2B)
 * Total: 24 bytes, 4-byte aligned.
 */
struct AtlasFeatureRow {
    std::uint32_t candidate_ordinal{0}; // Row addressing local to snapshot; never canonical packet_key
    std::uint16_t domain_id{0};         // Canonical domain (auth, ui, retrieval, db, etc.)
    std::uint16_t symbol_kind_id{0};    // Symbol kind (function, class, component, interface, etc.)

    std::uint32_t feature_mask_lo{0};   // Hot feature bits 0..31
    std::uint32_t feature_mask_hi{0};   // Hot feature bits 32..63

    std::uint32_t relation_offset{0};   // CSR adjacency offset into sparse relation buffer
    std::uint16_t relation_count{0};    // Adjacency degree (fan-in / fan-out count)
    std::uint16_t diagnostic_flags{0};  // Compiler / linter / AST recovery diagnostic bitmask
};
#pragma pack(pop)

static_assert(sizeof(AtlasFeatureRow) == 24, "AtlasFeatureRow must be exactly 24 bytes");
static_assert(offsetof(AtlasFeatureRow, candidate_ordinal) == 0, "candidate_ordinal must be at offset 0");
static_assert(offsetof(AtlasFeatureRow, domain_id) == 4, "domain_id must be at offset 4");
static_assert(offsetof(AtlasFeatureRow, symbol_kind_id) == 6, "symbol_kind_id must be at offset 6");
static_assert(offsetof(AtlasFeatureRow, feature_mask_lo) == 8, "feature_mask_lo must be at offset 8");
static_assert(offsetof(AtlasFeatureRow, feature_mask_hi) == 12, "feature_mask_hi must be at offset 12");
static_assert(offsetof(AtlasFeatureRow, relation_offset) == 16, "relation_offset must be at offset 16");
static_assert(offsetof(AtlasFeatureRow, relation_count) == 20, "relation_count must be at offset 20");
static_assert(offsetof(AtlasFeatureRow, diagnostic_flags) == 22, "diagnostic_flags must be at offset 22");

/**
 * 64-bit feature mask helper.
 */
inline constexpr std::uint64_t get_feature_mask_64(const AtlasFeatureRow& row) noexcept {
    return (static_cast<std::uint64_t>(row.feature_mask_hi) << 32ULL) |
            static_cast<std::uint64_t>(row.feature_mask_lo);
}

inline void set_feature_mask_64(AtlasFeatureRow& row, std::uint64_t mask) noexcept {
    row.feature_mask_lo = static_cast<std::uint32_t>(mask & 0xFFFFFFFFULL);
    row.feature_mask_hi = static_cast<std::uint32_t>((mask >> 32ULL) & 0xFFFFFFFFULL);
}

/**
 * SIMT / Warp-level candidate filter kernel (CPU reference oracle and SIMT dispatch).
 *
 * Filters rows by required domain (if domain_id != 0) and required feature mask (all bits must match).
 * Writes passing candidate_ordinals to out_ordinals and returns the number of matches.
 */
inline std::size_t filter_feature_rows_simt(
    const AtlasFeatureRow* __restrict rows,
    std::size_t row_count,
    std::uint16_t required_domain_id,
    std::uint64_t required_feature_mask,
    std::uint32_t* __restrict out_ordinals,
    std::size_t max_output
) noexcept {
    if (!rows || !out_ordinals || row_count == 0 || max_output == 0) {
        return 0;
    }

    const std::uint32_t mask_lo = static_cast<std::uint32_t>(required_feature_mask & 0xFFFFFFFFULL);
    const std::uint32_t mask_hi = static_cast<std::uint32_t>((required_feature_mask >> 32ULL) & 0xFFFFFFFFULL);

    std::size_t match_count = 0;
    for (std::size_t i = 0; i < row_count; ++i) {
        const auto& r = rows[i];
        // Domain filter (0 = wildcard)
        if (required_domain_id != 0 && r.domain_id != required_domain_id) {
            continue;
        }
        // Bitmask filter: check if all required bits are present in the candidate row
        if ((r.feature_mask_lo & mask_lo) != mask_lo || (r.feature_mask_hi & mask_hi) != mask_hi) {
            continue;
        }

        out_ordinals[match_count++] = r.candidate_ordinal;
        if (match_count >= max_output) {
            break;
        }
    }
    return match_count;
}

/**
 * Header for a GPU-resident feature tile batch (e.g. 4096 or 16384 rows).
 */
struct AtlasGpuTileHeader {
    char magic[8]{'A', 'T', 'L', 'S', 'T', 'I', 'L', 'E'};
    std::uint32_t schema_version{1};
    std::uint32_t row_count{0};
    std::uint32_t feature_dim{64};       // 64 numerical features per row
    std::uint32_t categorical_row_bytes{24}; // sizeof(AtlasFeatureRow)
    char snapshot_revision[68]{0};       // "sha256:..."
    char taxonomy_revision[68]{0};       // "sha256:..."
    char feature_recipe_revision[68]{0}; // "sha256:..."
};

} // namespace atlas::gpu
