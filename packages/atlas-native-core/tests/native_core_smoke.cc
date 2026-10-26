#include "fsm_detector.hpp"
#include "radix_sort.hpp"
#include "pgvector_binary.hpp"
#include "tile_assembler.hpp"
#include "batch_tile_assembler.hpp"
#include "turbovec_pack.hpp"

#include <array>
#include <cassert>
#include <iostream>
#include <limits>
#include <string>
#include <vector>

int main(int argc, char** argv) {
    constexpr char sha256_abc[] = "abc";
    assert(atlas::native::sha256_hex(reinterpret_cast<const std::uint8_t*>(sha256_abc), 3) ==
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    const std::string query = "detect RFC7519 in session middleware";
    const auto match = atlas::native::fsm_detect_with_insert_stop(query.data(), query.size());
    assert(match.matched);
    assert(std::string(match.rfc_id) == "RFC-7519");

    const std::string no_trigger = "RFC7519 without the routing trigger";
    assert(!atlas::native::fsm_detect_with_insert_stop(no_trigger.data(), no_trigger.size()).matched);

    const std::string stopped("detect\0 RFC7519", 15);
    assert(!atlas::native::fsm_detect_with_insert_stop(stopped.data(), stopped.size()).matched);

    std::array<float, atlas::native::TURBOVEC_MRL_DIM> vector{};
    for (std::size_t i = 0; i < vector.size(); ++i) vector[i] = static_cast<float>(i);
    const auto packed = atlas::native::pack_turbovec_mrl128(vector.data(), vector.size());
    assert(packed.valid);
    std::array<std::uint8_t, 16> packed_sign_direct{};
    std::array<std::uint8_t, 32> packed_2bit_direct{};
    std::array<std::uint8_t, 64> packed_4bit_direct{};
    atlas::native::PackedTurboVecMetadata direct_metadata{};
    assert(atlas::native::pack_turbovec_mrl128_into(
        vector.data(), vector.size(), packed_sign_direct.data(), packed_2bit_direct.data(), packed_4bit_direct.data(), direct_metadata));
    assert(packed_sign_direct == packed.sign_bitset_128);
    assert(packed_2bit_direct == packed.data_2bit);
    assert(packed_4bit_direct == packed.data_4bit);
    assert(direct_metadata.min_val == packed.min_val && direct_metadata.scale_4bit == packed.scale_4bit);
    assert(packed.data_4bit.size() == 64);
    assert(packed.data_2bit.size() == 32);
    assert(packed.data_4bit.front() == 0x00 && packed.data_4bit.back() == 0xFF);
    assert(packed.data_2bit.front() == 0x00 && packed.data_2bit.back() == 0xFF);
    assert(atlas::native::unpack_4bit_value(packed.data_4bit.data(), 127) == 15);
    assert(atlas::native::unpack_2bit_value(packed.data_2bit.data(), 127) == 3);
    assert(atlas::native::get_sign_bit_128(packed.sign_bitset_128.data(), 0));
    assert(!atlas::native::get_sign_bit_128(packed.sign_bitset_128.data(), 128));
    assert(atlas::native::sign_bitset_128_as_bit_string(packed.sign_bitset_128.data()).size() == 128);

    std::vector<float> batch_values(4 * atlas::native::TURBOVEC_MRL_DIM);
    for (std::size_t row = 0; row < 4; ++row) {
        for (std::size_t column = 0; column < atlas::native::TURBOVEC_MRL_DIM; ++column) {
            batch_values[row * atlas::native::TURBOVEC_MRL_DIM + column] =
                static_cast<float>((row * 19 + column * 7) % 101) - 50.0f;
        }
    }
    const std::array<std::uint32_t, 4> batch_ordinals{91, 14, 52, 37};
    const std::array<std::uint16_t, 4> batch_som_cells{1, 17, 205, 399};
    const std::array<std::uint16_t, 4> batch_clusters{3, 2, 5, 1};
    const auto serial_blocks = atlas::native::assemble_lod_texture_blocks_v1(
        batch_values.data(), 4, atlas::native::TURBOVEC_MRL_DIM,
        batch_ordinals.data(), batch_som_cells.data(), batch_clusters.data(), 1);
    const auto parallel_blocks = atlas::native::assemble_lod_texture_blocks_v1(
        batch_values.data(), 4, atlas::native::TURBOVEC_MRL_DIM,
        batch_ordinals.data(), batch_som_cells.data(), batch_clusters.data(), 4);
    assert(serial_blocks == parallel_blocks);
    for (std::size_t row = 0; row < batch_ordinals.size(); ++row) {
        atlas::native::CandidateTileRecord scalar_record{};
        scalar_record.candidate_ordinal = batch_ordinals[row];
        scalar_record.som_bmu_id = batch_som_cells[row];
        scalar_record.kmeans_cluster_id = batch_clusters[row];
        scalar_record.packed_vector = atlas::native::pack_turbovec_mrl128(
            batch_values.data() + row * atlas::native::TURBOVEC_MRL_DIM,
            atlas::native::TURBOVEC_MRL_DIM);
        assert(serial_blocks[row] == atlas::native::serialize_lod_texture_block_v1(scalar_record));
    }
    bool rejected_duplicate_batch_ordinal = false;
    auto duplicate_ordinals = batch_ordinals;
    duplicate_ordinals[1] = duplicate_ordinals[0];
    try {
        atlas::native::assemble_lod_texture_blocks_v1(
            batch_values.data(), 4, atlas::native::TURBOVEC_MRL_DIM,
            duplicate_ordinals.data(), batch_som_cells.data(), batch_clusters.data(), 2);
    } catch (const std::invalid_argument&) {
        rejected_duplicate_batch_ordinal = true;
    }
    assert(rejected_duplicate_batch_ordinal);

    std::array<std::uint8_t, 16> bits_a{};
    std::array<std::uint8_t, 16> bits_b{};
    bits_a[0] = 0b11000000;
    bits_b[0] = 0b10100000;
    assert(atlas::native::bitset128_intersection_count(bits_a.data(), bits_b.data()) == 1);
    assert(atlas::native::bitset128_union_count(bits_a.data(), bits_b.data()) == 3);
    assert(std::abs(atlas::native::bitset128_jaccard_similarity(bits_a.data(), bits_b.data()) - (1.0f / 3.0f)) < 1e-6f);
    assert(atlas::native::bitset128_hamming_similarity(nullptr, nullptr) == 0.0f);

    std::array<std::uint8_t, 32> int2_fixture{};
    int2_fixture[0] = 0b00011011;
    assert(atlas::native::unpack_2bit_value(int2_fixture.data(), 0) == 0);
    assert(atlas::native::unpack_2bit_value(int2_fixture.data(), 1) == 1);
    assert(atlas::native::unpack_2bit_value(int2_fixture.data(), 2) == 2);
    assert(atlas::native::unpack_2bit_value(int2_fixture.data(), 3) == 3);
    std::array<float, 128> int2_query{};
    int2_query[0] = int2_query[1] = int2_query[2] = int2_query[3] = 1.0f;
    assert(atlas::native::asymmetric_dot_2bit(int2_query.data(), int2_fixture.data(), 0.0f, 0.5f) == 3.0f);
    assert(std::isnan(atlas::native::asymmetric_dot_2bit(nullptr, int2_fixture.data(), 0.0f, 1.0f)));
    std::array<std::uint8_t, 64> int4_fixture{};
    int4_fixture[0] = 0x12;
    assert(atlas::native::asymmetric_dot_4bit(int2_query.data(), int4_fixture.data(), 0.0f, 0.5f) == 1.5f);
    assert(std::isnan(atlas::native::asymmetric_dot_4bit(int2_query.data(), int4_fixture.data(), 0.0f, -0.5f)));

    std::array<std::uint8_t, atlas::native::PGVECTOR_768_BINARY_BYTES> pgvector_wire{};
    pgvector_wire[0] = 0x03;
    pgvector_wire[1] = 0x00;
    pgvector_wire[4] = 0x3f;
    pgvector_wire[5] = 0x80;
    pgvector_wire[8] = 0xc0;
    pgvector_wire[9] = 0x20;
    std::array<float, atlas::native::PGVECTOR_768_DIM> pgvector_output{};
    assert(atlas::native::unpack_pgvector_binary_768(pgvector_wire.data(), pgvector_wire.size(), pgvector_output.data()));
    assert(pgvector_output[0] == 1.0f && pgvector_output[1] == -2.5f && pgvector_output[2] == 0.0f);
    assert(!atlas::native::unpack_pgvector_binary_768(pgvector_wire.data(), pgvector_wire.size() - 1, pgvector_output.data()));
    pgvector_wire[3] = 1;
    assert(!atlas::native::unpack_pgvector_binary_768(pgvector_wire.data(), pgvector_wire.size(), pgvector_output.data()));

    atlas::native::TensorTileDescriptorV1 tile_fixture{};
    tile_fixture.workspace_revision = "sha256:" + std::string(64, '1');
    tile_fixture.source_snapshot_digest = "sha256:" + std::string(64, '2');
    tile_fixture.ordinal_map_digest = "sha256:" + std::string(64, '3');
    tile_fixture.representation_revision = "fixture-repr.v1";
    tile_fixture.payload.resize(32);
    for (std::size_t index = 0; index < tile_fixture.payload.size(); ++index) {
        tile_fixture.payload[index] = static_cast<std::uint8_t>(index);
    }
    tile_fixture.payload_sha256 = "sha256:" + atlas::native::sha256_hex(tile_fixture.payload.data(), tile_fixture.payload.size());
    tile_fixture.candidate_ordinal = 7;
    const auto encoded_tile = atlas::native::encode_tensor_tile_v1(tile_fixture);
    assert(encoded_tile.size() > tile_fixture.payload.size());
    assert(encoded_tile[0] == 0x0A);
    if (argc == 2 && std::string(argv[1]) == "--emit-tensor-tile-v1-fixture") {
        constexpr char hex[] = "0123456789abcdef";
        for (const auto byte : encoded_tile) {
            std::cout << hex[byte >> 4u] << hex[byte & 0x0Fu];
        }
        std::cout << '\n';
        return 0;
    }
    bool invalid_tile_refused = false;
    tile_fixture.payload.pop_back();
    try {
        static_cast<void>(atlas::native::encode_tensor_tile_v1(tile_fixture));
    } catch (const std::invalid_argument&) {
        invalid_tile_refused = true;
    }
    assert(invalid_tile_refused);

    tile_fixture.payload.push_back(32);
    tile_fixture.payload_sha256 = "sha256:" + std::string(64, '4');
    bool mismatched_tile_digest_refused = false;
    try {
        static_cast<void>(atlas::native::encode_tensor_tile_v1(tile_fixture));
    } catch (const std::invalid_argument& error) {
        mismatched_tile_digest_refused = std::string(error.what()) == "TENSOR_TILE_PAYLOAD_DIGEST_MISMATCH";
    }
    assert(mismatched_tile_digest_refused);

    atlas::native::CandidateTileRecord candidate{};
    candidate.candidate_ordinal = 91;
    candidate.som_bmu_id = 13;
    candidate.kmeans_cluster_id = 5;
    candidate.packed_vector = packed;
    const auto lod_block = atlas::native::materialize_lod_texture_block(candidate);
    assert(sizeof(lod_block) == 128);
    assert(lod_block.candidate_ordinal == 91 && lod_block.som_bmu_id == 13);
    if (argc == 2 && std::string(argv[1]) == "--emit-lod-texture-block-v1-fixture") {
        const auto serialized = atlas::native::serialize_lod_texture_block_v1(candidate);
        constexpr char hex[] = "0123456789abcdef";
        for (const auto byte : serialized) {
            std::cout << hex[byte >> 4u] << hex[byte & 0x0Fu];
        }
        std::cout << '\n';
        return 0;
    }

    std::vector<atlas::native::CandidateTileRecord> records(2);
    records[0].candidate_ordinal = 42;
    records[0].kmeans_cluster_id = 1;
    records[0].som_bmu_id = 3;
    records[1].candidate_ordinal = 7;
    records[1].kmeans_cluster_id = 0;
    records[1].som_bmu_id = 9;
    const auto descriptor = atlas::native::assemble_som_aligned_tiles(records, "k", "snapshot", "repr", "sha256:artifact");
    assert(descriptor.candidate_count == 2 && descriptor.tile_count == 1);
    assert(records[0].candidate_ordinal == 7);
    assert(records[1].candidate_ordinal == 42);

    vector[3] = std::numeric_limits<float>::quiet_NaN();
    assert(!atlas::native::pack_turbovec_mrl128(vector.data(), vector.size()).valid);

    std::vector<atlas::native::SomTileSortEntry> entries{
        {atlas::native::pack_som_radix_key(1, 2, 7), 1, 2, 7},
        {atlas::native::pack_som_radix_key(0, 9, 8), 0, 9, 8},
        {atlas::native::pack_som_radix_key(1, 2, 1), 1, 2, 1},
    };
    atlas::native::radix_sort_som_tiles(entries);
    assert(entries[0].candidate_ordinal == 8);
    assert(entries[1].candidate_ordinal == 1);
    assert(entries[2].candidate_ordinal == 7);

    auto invalid_entries = entries;
    invalid_entries[0].composite_key ^= 1;
    bool rejected_key_mismatch = false;
    try {
        atlas::native::radix_sort_som_tiles(invalid_entries);
    } catch (const std::invalid_argument&) {
        rejected_key_mismatch = true;
    }
    assert(rejected_key_mismatch);

    invalid_entries = entries;
    invalid_entries[0].som_bmu_id = 400;
    bool rejected_invalid_cell = false;
    try {
        atlas::native::radix_sort_som_tiles(invalid_entries);
    } catch (const std::invalid_argument&) {
        rejected_invalid_cell = true;
    }
    assert(rejected_invalid_cell);
}
