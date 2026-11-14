#include "radix_sort.hpp"
#include "sha256.hpp"

#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace {

using atlas::native::MAX_SOM_RADIX_CANDIDATES_V1;
using atlas::native::SomTileSortEntry;
using atlas::native::pack_som_radix_key;
using atlas::native::radix_sort_som_tiles;
using atlas::native::sha256_hex;

constexpr std::uint32_t NES_MAGIC_LE = 0x4e455331u;
constexpr std::uint32_t NES_ENDIAN_TAG_LE = 0x01020304u;
constexpr std::uint32_t NES_ENDIAN_TAG_BE = 0x04030201u;
constexpr std::size_t HEADER_BYTES = 64;
constexpr std::size_t RECORD_BYTES = 16;
constexpr std::size_t ALIGN_BYTES = 64;
constexpr std::uint16_t VALID_DOMAIN_MASK = 1023u;

const std::string FROZEN_SOURCE_REVISION = "fixture:parent-atlas-nes-fsm-native-runtime-v1:source";
const std::string FROZEN_GRAPH_REVISION = "sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce";
const std::string FROZEN_EDGE_POLICY_REVISION = "atlas.edge-policy.v1";

struct FrozenCandidateInput {
    std::uint32_t candidate_ordinal;
    std::uint16_t kmeans_cluster_id;
    std::uint16_t som_bmu_id;
    std::uint8_t primary_lut_byte;
    std::uint16_t domain_bitmask;
    const char* source_ref;
    std::uint16_t token_count;
};

struct DomainPaletteMap {
    std::uint8_t primary_lut_byte;
    std::uint8_t nes_palette_byte;
};

constexpr std::array<DomainPaletteMap, 10> CANONICAL_PALETTE_BRIDGE{{
    {1, 0x16},
    {2, 0x2a},
    {3, 0x21},
    {4, 0x2c},
    {5, 0x12},
    {6, 0x27},
    {7, 0x24},
    {8, 0x1a},
    {9, 0x14},
    {10, 0x0f},
}};

std::uint8_t resolve_nes_palette_byte(std::uint8_t primary_lut_byte) {
    for (const auto& entry : CANONICAL_PALETTE_BRIDGE) {
        if (entry.primary_lut_byte == primary_lut_byte) {
            return entry.nes_palette_byte;
        }
    }
    throw std::invalid_argument("PRIMARY_LUT_INVALID");
}

void write_u16_le(std::uint8_t* dst, std::uint16_t v) {
    dst[0] = static_cast<std::uint8_t>(v & 0xffu);
    dst[1] = static_cast<std::uint8_t>((v >> 8u) & 0xffu);
}

void write_u32_le(std::uint8_t* dst, std::uint32_t v) {
    dst[0] = static_cast<std::uint8_t>(v & 0xffu);
    dst[1] = static_cast<std::uint8_t>((v >> 8u) & 0xffu);
    dst[2] = static_cast<std::uint8_t>((v >> 16u) & 0xffu);
    dst[3] = static_cast<std::uint8_t>((v >> 24u) & 0xffu);
}

std::uint16_t read_u16_le(const std::uint8_t* src) {
    return static_cast<std::uint16_t>(src[0]) | (static_cast<std::uint16_t>(src[1]) << 8u);
}

std::uint32_t read_u32_le(const std::uint8_t* src) {
    return static_cast<std::uint32_t>(src[0]) |
           (static_cast<std::uint32_t>(src[1]) << 8u) |
           (static_cast<std::uint32_t>(src[2]) << 16u) |
           (static_cast<std::uint32_t>(src[3]) << 24u);
}

std::uint8_t hex_nibble(char c) {
    if (c >= '0' && c <= '9') return static_cast<std::uint8_t>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<std::uint8_t>(10 + (c - 'a'));
    if (c >= 'A' && c <= 'F') return static_cast<std::uint8_t>(10 + (c - 'A'));
    throw std::invalid_argument("INVALID_HEX_CHAR");
}

std::vector<std::uint8_t> hex_to_bytes(const std::string& hex) {
    if (hex.size() % 2 != 0) throw std::invalid_argument("ODD_HEX_LENGTH");
    std::vector<std::uint8_t> out(hex.size() / 2);
    for (std::size_t i = 0; i < out.size(); ++i) {
        out[i] = static_cast<std::uint8_t>((hex_nibble(hex[i * 2]) << 4u) | hex_nibble(hex[i * 2 + 1]));
    }
    return out;
}

std::string bytes_to_hex(const std::vector<std::uint8_t>& bytes) {
    static constexpr char kHex[] = "0123456789abcdef";
    std::string out;
    out.reserve(bytes.size() * 2);
    for (std::uint8_t b : bytes) {
        out.push_back(kHex[(b >> 4u) & 0x0fu]);
        out.push_back(kHex[b & 0x0fu]);
    }
    return out;
}

std::string sha256_string(const std::string& s) {
    return sha256_hex(reinterpret_cast<const std::uint8_t*>(s.data()), s.size());
}

void verify_descriptor_readback(
    const std::vector<std::uint8_t>& buf,
    const std::string& expected_source_revision,
    const std::string& expected_ordinal_map_checksum,
    const std::string& expected_csr_checksum
) {
    if (buf.size() < HEADER_BYTES || (buf.size() % ALIGN_BYTES) != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_ALIGNMENT_INVALID");
    }
    const std::uint32_t magic_le = read_u32_le(buf.data() + 0);
    const std::uint32_t endian_tag_le = read_u32_le(buf.data() + 4);
    if (endian_tag_le == NES_ENDIAN_TAG_BE || magic_le == 0x3153454eu) {
        throw std::runtime_error("BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH");
    }
    if (endian_tag_le != NES_ENDIAN_TAG_LE || magic_le != NES_MAGIC_LE) {
        throw std::runtime_error("BINARY_DESCRIPTOR_MAGIC_OR_ENDIAN_INVALID");
    }
    const std::uint16_t schema_version = read_u16_le(buf.data() + 8);
    if (schema_version != 1) {
        throw std::runtime_error("BINARY_DESCRIPTOR_SCHEMA_VERSION_UNSUPPORTED");
    }
    const std::uint16_t count = read_u16_le(buf.data() + 10);
    if (count == 0 || count > 256) {
        throw std::runtime_error("BINARY_DESCRIPTOR_COUNT_OUT_OF_RANGE");
    }
    const std::size_t required_len = HEADER_BYTES + static_cast<std::size_t>(count) * RECORD_BYTES;
    if (buf.size() < required_len) {
        throw std::runtime_error("BINARY_DESCRIPTOR_TRUNCATED");
    }
    if (buf[22] != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS");
    }

    const auto rev_bytes = hex_to_bytes(sha256_string(expected_source_revision));
    const auto ord_bytes = hex_to_bytes(expected_ordinal_map_checksum);
    const auto csr_bytes = hex_to_bytes(expected_csr_checksum);
    if (std::memcmp(buf.data() + 24, rev_bytes.data(), 8) != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_STALE_SOURCE_REVISION");
    }
    if (std::memcmp(buf.data() + 32, ord_bytes.data(), 8) != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_ORDINAL_MAP_CHECKSUM_MISMATCH");
    }
    if (std::memcmp(buf.data() + 40, csr_bytes.data(), 8) != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_CSR_CURSOR_CHECKSUM_MISMATCH");
    }

    const auto payload_digest = hex_to_bytes(
        sha256_hex(buf.data() + HEADER_BYTES, static_cast<std::size_t>(count) * RECORD_BYTES)
    );
    if (std::memcmp(buf.data() + 48, payload_digest.data(), 16) != 0) {
        throw std::runtime_error("BINARY_DESCRIPTOR_PAYLOAD_CHECKSUM_MISMATCH");
    }

    std::set<std::uint32_t> seen_ordinals;
    std::uint64_t prev_key = 0;
    bool has_prev = false;
    for (std::uint16_t i = 0; i < count; ++i) {
        const std::uint8_t* rec = buf.data() + HEADER_BYTES + static_cast<std::size_t>(i) * RECORD_BYTES;
        const std::uint32_t ordinal = read_u32_le(rec + 0);
        const std::uint16_t cluster = read_u16_le(rec + 4);
        const std::uint16_t som = read_u16_le(rec + 6);
        const std::uint16_t mask = read_u16_le(rec + 10);
        const std::uint8_t lut = rec[12];
        if (!seen_ordinals.insert(ordinal).second) {
            throw std::runtime_error("BINARY_DESCRIPTOR_DUPLICATE_ORDINAL");
        }
        if (som >= 400) {
            throw std::runtime_error("BINARY_DESCRIPTOR_SOM_CELL_OUT_OF_RANGE");
        }
        if (mask == 0 || (mask & ~VALID_DOMAIN_MASK) != 0 || lut < 1 || lut > 10 || ((mask & (1u << (lut - 1u))) == 0)) {
            throw std::runtime_error("BINARY_DESCRIPTOR_RECORD_MASK_INVALID");
        }
        const std::uint64_t key = pack_som_radix_key(cluster, som, ordinal);
        if (has_prev && key <= prev_key) {
            throw std::runtime_error("BINARY_DESCRIPTOR_NOT_RADIX_SORTED");
        }
        prev_key = key;
        has_prev = true;
    }
}

void recompute_payload_digest(std::vector<std::uint8_t>& buf, std::uint16_t count) {
    const auto payload_digest = hex_to_bytes(
        sha256_hex(buf.data() + HEADER_BYTES, static_cast<std::size_t>(count) * RECORD_BYTES)
    );
    std::memcpy(buf.data() + 48, payload_digest.data(), 16);
}

bool test_negative_gates(
    const std::vector<std::uint8_t>& valid_descriptor,
    const std::string& ordinal_map_checksum,
    const std::string& csr_checksum
) {
    // 1. BE wrong endianness tag
    {
        auto be = valid_descriptor;
        write_u32_le(be.data() + 4, NES_ENDIAN_TAG_BE);
        bool caught = false;
        try {
            verify_descriptor_readback(be, FROZEN_SOURCE_REVISION, ordinal_map_checksum, csr_checksum);
        } catch (const std::runtime_error& e) {
            caught = std::string(e.what()).find("BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH") != std::string::npos;
        }
        if (!caught) return false;
    }
    // 2. Duplicate ordinal
    {
        auto dup = valid_descriptor;
        const std::uint32_t first_ord = read_u32_le(dup.data() + HEADER_BYTES);
        write_u32_le(dup.data() + HEADER_BYTES + RECORD_BYTES, first_ord);
        recompute_payload_digest(dup, 16);
        bool caught = false;
        try {
            verify_descriptor_readback(dup, FROZEN_SOURCE_REVISION, ordinal_map_checksum, csr_checksum);
        } catch (const std::runtime_error& e) {
            caught = std::string(e.what()).find("BINARY_DESCRIPTOR_DUPLICATE_ORDINAL") != std::string::npos;
        }
        if (!caught) return false;
    }
    // 3. Invalid mask & non-zero authority flags
    {
        auto mask_bad = valid_descriptor;
        write_u16_le(mask_bad.data() + HEADER_BYTES + 10, 0x0400u);
        recompute_payload_digest(mask_bad, 16);
        bool caught_mask = false;
        try {
            verify_descriptor_readback(mask_bad, FROZEN_SOURCE_REVISION, ordinal_map_checksum, csr_checksum);
        } catch (const std::runtime_error& e) {
            caught_mask = std::string(e.what()).find("BINARY_DESCRIPTOR_RECORD_MASK_INVALID") != std::string::npos;
        }
        if (!caught_mask) return false;

        auto auth_bad = valid_descriptor;
        auth_bad[22] = 0x01;
        bool caught_auth = false;
        try {
            verify_descriptor_readback(auth_bad, FROZEN_SOURCE_REVISION, ordinal_map_checksum, csr_checksum);
        } catch (const std::runtime_error& e) {
            caught_auth = std::string(e.what()).find("BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS") != std::string::npos;
        }
        if (!caught_auth) return false;
    }
    // 4. Stale source revision
    {
        bool caught = false;
        try {
            verify_descriptor_readback(
                valid_descriptor,
                FROZEN_SOURCE_REVISION + "-stale",
                ordinal_map_checksum,
                csr_checksum
            );
        } catch (const std::runtime_error& e) {
            caught = std::string(e.what()).find("BINARY_DESCRIPTOR_STALE_SOURCE_REVISION") != std::string::npos;
        }
        if (!caught) return false;
    }
    // 5. Native radix > 65536 and SOM >= 400 checks
    {
        std::vector<SomTileSortEntry> too_many(MAX_SOM_RADIX_CANDIDATES_V1 + 1);
        for (std::size_t i = 0; i < too_many.size(); ++i) {
            too_many[i].candidate_ordinal = static_cast<std::uint32_t>(i);
            too_many[i].source_index = static_cast<std::uint32_t>(i);
            too_many[i].composite_key = pack_som_radix_key(0, 0, static_cast<std::uint32_t>(i));
        }
        bool caught_limit = false;
        try {
            radix_sort_som_tiles(too_many);
        } catch (const std::invalid_argument& e) {
            caught_limit = std::string(e.what()) == "SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED";
        }
        if (!caught_limit) return false;

        std::vector<SomTileSortEntry> bad_som(1);
        bad_som[0].kmeans_cluster_id = 0;
        bad_som[0].som_bmu_id = 400;
        bad_som[0].candidate_ordinal = 1;
        bad_som[0].composite_key = pack_som_radix_key(0, 400, 1);
        bool caught_som = false;
        try {
            radix_sort_som_tiles(bad_som);
        } catch (const std::invalid_argument& e) {
            caught_som = std::string(e.what()) == "SOM_BMU_ID_OUT_OF_RANGE";
        }
        if (!caught_som) return false;
    }
    return true;
}

} // namespace

int main(int argc, char** argv) {
    bool emit_json = false;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--emit-json") emit_json = true;
    }

    const std::vector<FrozenCandidateInput> batch{
        {142, 2, 17, 10, 0x0202, "src/lib/server/atlas/fsm/nes-feature-fsm.ts", 128},
        {108, 1, 6, 2, 0x0002, "src/lib/server/search/qdrant-search.ts", 128},
        {115, 2, 7, 1, 0x0001, "src/lib/server/lucia.ts", 128},
        {101, 0, 12, 6, 0x0022, "src/lib/server/db/client.ts", 128},
        {130, 3, 42, 9, 0x0104, "src/lib/server/atlas/fsm/nes-feature-token-pipeline.ts", 128},
        {121, 1, 6, 10, 0x0200, "src/lib/server/atlas/rendering/nes-glyph-canvas-renderer-v1.ts", 128},
        {104, 0, 3, 2, 0x0006, "src/lib/server/retrieval/orchestrator.ts", 128},
        {155, 3, 88, 8, 0x0080, "src/lib/gpu/nes-glyph-webgpu.ts", 128},
        {111, 1, 19, 5, 0x0010, "src/lib/server/seaweed-client.ts", 128},
        {127, 2, 7, 3, 0x0024, "src/lib/server/atlas/cache/bitfrost-token-fsm-v1.ts", 128},
        {136, 3, 15, 7, 0x0040, "src/lib/server/atlas/taxonomy/task-domain-lut-reconciliation-v1.ts", 128},
        {102, 0, 3, 1, 0x0003, "src/lib/server/atlas/orchestration/task-execution-lifecycle-fsm-v1.ts", 128},
        {148, 2, 210, 4, 0x0008, "src/lib/server/atlas/graph/csr-traversal-cursor.ts", 128},
        {119, 1, 14, 6, 0x0020, "src/lib/server/atlas/kanban-task-board.ts", 128},
        {109, 0, 12, 2, 0x000a, "src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts", 128},
        {124, 2, 7, 10, 0x0202, "src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts", 128},
    };

    // 1. CandidateOrdinalMapChecksum + Input buffer checksum
    std::string canonical_map;
    std::vector<std::uint8_t> input_buf(batch.size() * 16, 0);
    std::vector<SomTileSortEntry> entries(batch.size());
    for (std::size_t i = 0; i < batch.size(); ++i) {
        const auto& rec = batch[i];
        canonical_map += std::to_string(i) + "|" + std::to_string(rec.candidate_ordinal) + "|" +
                         rec.source_ref + "|" + FROZEN_SOURCE_REVISION + "\n";

        std::uint8_t* dst = input_buf.data() + i * 16;
        write_u32_le(dst + 0, rec.candidate_ordinal);
        write_u16_le(dst + 4, rec.kmeans_cluster_id);
        write_u16_le(dst + 6, rec.som_bmu_id);
        write_u16_le(dst + 8, rec.domain_bitmask);
        dst[10] = rec.primary_lut_byte;
        dst[11] = 0;
        write_u16_le(dst + 12, rec.token_count);
        write_u16_le(dst + 14, 0);

        entries[i].kmeans_cluster_id = rec.kmeans_cluster_id;
        entries[i].som_bmu_id = rec.som_bmu_id;
        entries[i].candidate_ordinal = rec.candidate_ordinal;
        entries[i].source_index = static_cast<std::uint32_t>(i);
        entries[i].composite_key = pack_som_radix_key(
            rec.kmeans_cluster_id, rec.som_bmu_id, rec.candidate_ordinal
        );
    }

    const std::string ordinal_map_checksum = sha256_string(canonical_map);
    const std::string input_buffer_checksum = sha256_hex(input_buf.data(), input_buf.size());

    // 2. Native C++ radix sort
    radix_sort_som_tiles(entries);

    // 3. Bounded CSR traversal matching FROZEN_NES_FSM_CSR_GRAPH_V1
    const std::array<std::uint32_t, 17> row_offsets{0, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16};
    const std::array<std::uint32_t, 16> col_indices{1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0};
    std::vector<std::uint32_t> seeds{entries[0].source_index % 16u, entries[1].source_index % 16u};
    std::sort(seeds.begin(), seeds.end());
    seeds.erase(std::unique(seeds.begin(), seeds.end()), seeds.end());

    std::array<std::uint8_t, 16> visited{};
    std::string prefix_log;
    for (std::uint32_t s : seeds) {
        visited[s] = 1;
        prefix_log += "seed:" + std::to_string(s) + "\n";
    }
    std::vector<std::uint32_t> frontier = seeds;
    std::size_t discovered_count = 0;
    for (int depth = 1; depth <= 2 && !frontier.empty(); ++depth) {
        std::set<std::uint32_t> next_set;
        for (std::uint32_t node : frontier) {
            for (std::uint32_t e = row_offsets[node]; e < row_offsets[node + 1]; ++e) {
                const std::uint32_t nbr = col_indices[e];
                if (visited[nbr] == 0) next_set.insert(nbr);
            }
        }
        std::vector<std::uint32_t> next_frontier(next_set.begin(), next_set.end());
        for (std::uint32_t nbr : next_frontier) {
            visited[nbr] = 1;
            ++discovered_count;
            prefix_log += "node:" + std::to_string(depth) + ":" + std::to_string(nbr) + "\n";
        }
        frontier = std::move(next_frontier);
    }
    const std::uint8_t csr_total_visited = static_cast<std::uint8_t>(seeds.size() + discovered_count);
    const std::string csr_checksum = sha256_string(prefix_log);

    // 4. BitFrost selection (token_budget = 1536 -> top 12 RESIDENT, remaining 4 ADMITTED)
    std::uint32_t used_tokens = 0;
    constexpr std::uint32_t TOKEN_BUDGET = 1536u;
    std::vector<std::uint8_t> bitfrost_codes(entries.size(), 1);
    std::vector<std::uint32_t> resident_ordinals;
    std::vector<std::uint32_t> admitted_ordinals;
    for (std::size_t i = 0; i < entries.size(); ++i) {
        const auto& rec = batch[entries[i].source_index];
        if (used_tokens + rec.token_count <= TOKEN_BUDGET) {
            used_tokens += rec.token_count;
            bitfrost_codes[i] = 2; // RESIDENT
            resident_ordinals.push_back(rec.candidate_ordinal);
        } else {
            bitfrost_codes[i] = 1; // ADMITTED
            admitted_ordinals.push_back(rec.candidate_ordinal);
        }
    }

    // 5. Serialize a 320-byte LE descriptor with a 64-byte padded layout.
    const auto& lead = batch[entries[0].source_index];
    const std::size_t raw_payload_bytes = entries.size() * RECORD_BYTES;
    const std::size_t total_bytes = (HEADER_BYTES + raw_payload_bytes + (ALIGN_BYTES - 1)) & ~(ALIGN_BYTES - 1);
    std::vector<std::uint8_t> scratch(total_bytes, 0);

    write_u32_le(scratch.data() + 0, NES_MAGIC_LE);
    write_u32_le(scratch.data() + 4, NES_ENDIAN_TAG_LE);
    write_u16_le(scratch.data() + 8, 1);
    write_u16_le(scratch.data() + 10, static_cast<std::uint16_t>(entries.size()));
    scratch[12] = lead.primary_lut_byte;
    scratch[13] = resolve_nes_palette_byte(lead.primary_lut_byte);
    write_u16_le(scratch.data() + 14, lead.domain_bitmask);
    write_u32_le(scratch.data() + 16, 0x000fu); // policyAuthorizationMask
    scratch[20] = 4; // DEPENDENCY_CHECKED
    scratch[21] = 6; // READY
    scratch[22] = 0; // authorityFlagsByte = 0x00 (canonicalAuthority=false, promotionEligible=false, writesPerformed=false)
    scratch[23] = csr_total_visited;

    const auto rev_bytes = hex_to_bytes(sha256_string(FROZEN_SOURCE_REVISION));
    const auto ord_bytes = hex_to_bytes(ordinal_map_checksum);
    const auto csr_bytes = hex_to_bytes(csr_checksum);
    std::memcpy(scratch.data() + 24, rev_bytes.data(), 8);
    std::memcpy(scratch.data() + 32, ord_bytes.data(), 8);
    std::memcpy(scratch.data() + 40, csr_bytes.data(), 8);

    for (std::size_t i = 0; i < entries.size(); ++i) {
        const auto& rec = batch[entries[i].source_index];
        std::uint8_t* dst = scratch.data() + HEADER_BYTES + i * RECORD_BYTES;
        write_u32_le(dst + 0, rec.candidate_ordinal);
        write_u16_le(dst + 4, rec.kmeans_cluster_id);
        write_u16_le(dst + 6, rec.som_bmu_id);
        write_u16_le(dst + 8, static_cast<std::uint16_t>(entries[i].source_index));
        write_u16_le(dst + 10, rec.domain_bitmask);
        dst[12] = rec.primary_lut_byte;
        dst[13] = bitfrost_codes[i];
        write_u16_le(dst + 14, rec.token_count);
    }
    recompute_payload_digest(scratch, static_cast<std::uint16_t>(entries.size()));

    // 6. Readback verification + swap into active buffer
    verify_descriptor_readback(scratch, FROZEN_SOURCE_REVISION, ordinal_map_checksum, csr_checksum);
    std::vector<std::uint8_t> active_buffer = scratch;
    const std::string output_buffer_checksum = sha256_hex(active_buffer.data(), active_buffer.size());

    // 7. Negative gate proofs
    const bool negative_ok = test_negative_gates(active_buffer, ordinal_map_checksum, csr_checksum);
    if (!negative_ok) {
        std::cerr << "negative_gates=FAIL\n";
        return 1;
    }

    if (emit_json) {
        std::cout << "{";
        std::cout << "\"runtime\":\"cpp\",";
        std::cout << "\"sourceRevision\":\"" << FROZEN_SOURCE_REVISION << "\",";
        std::cout << "\"binarySchemaRevision\":\"atlas.nes-fsm-binary-descriptor.v1\",";
        std::cout << "\"endianness\":\"LE\",";
        std::cout << "\"serializedLayoutAlignmentBytes\":" << ALIGN_BYTES << ",";
        std::cout << "\"descriptorByteLength\":" << active_buffer.size() << ",";
        std::cout << "\"candidateOrdinalMapChecksum\":\"" << ordinal_map_checksum << "\",";
        std::cout << "\"inputBufferChecksum\":\"" << input_buffer_checksum << "\",";
        std::cout << "\"outputBufferChecksum\":\"" << output_buffer_checksum << "\",";
        std::cout << "\"csrTotalVisited\":" << static_cast<int>(csr_total_visited) << ",";
        std::cout << "\"csrDiscoveryPrefixChecksum\":\"" << csr_checksum << "\",";
        std::cout << "\"sortedOrdinals\":[";
        for (std::size_t i = 0; i < entries.size(); ++i) {
            if (i > 0) std::cout << ",";
            std::cout << entries[i].candidate_ordinal;
        }
        std::cout << "],";
        std::cout << "\"residentCount\":" << resident_ordinals.size() << ",";
        std::cout << "\"admittedCount\":" << admitted_ordinals.size() << ",";
        std::cout << "\"descriptorHex\":\"" << bytes_to_hex(active_buffer) << "\",";
        std::cout << "\"negativeGatesPassed\":true,";
        std::cout << "\"canonicalAuthority\":false,";
        std::cout << "\"promotionEligible\":false";
        std::cout << "}\n";
    } else {
        std::cout << "nes_fsm_runtime_parity_smoke=PASS"
                  << " bytes=" << active_buffer.size()
                  << " outputChecksum=" << output_buffer_checksum
                  << " csrVisited=" << static_cast<int>(csr_total_visited)
                  << " negativeGates=PASS\n";
    }
    return 0;
}
