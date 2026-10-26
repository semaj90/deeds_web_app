#pragma once

#include "tile_assembler.hpp"

#include <algorithm>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

namespace atlas::native {

constexpr std::size_t MAX_LOD_TILE_BATCH_ROWS_V1 = 4096;
constexpr std::size_t MAX_LOD_TILE_BATCH_WORKERS_V1 = 32;
constexpr std::size_t MAX_LOD_TILE_BATCH_STRIDE_V1 = 768;

inline std::vector<std::array<std::uint8_t, sizeof(LodTextureBlock128B)>>
assemble_lod_texture_blocks_v1(
    const float* values,
    std::size_t row_count,
    std::size_t row_stride,
    const std::uint32_t* candidate_ordinals,
    const std::uint16_t* som_bmu_ids,
    const std::uint16_t* kmeans_cluster_ids,
    std::size_t requested_workers = 0
) {
    if (row_count == 0 || row_count > MAX_LOD_TILE_BATCH_ROWS_V1 ||
        row_stride < TURBOVEC_MRL_DIM || row_stride > MAX_LOD_TILE_BATCH_STRIDE_V1 ||
        values == nullptr || candidate_ordinals == nullptr || som_bmu_ids == nullptr ||
        kmeans_cluster_ids == nullptr || row_count > SIZE_MAX / row_stride) {
        throw std::invalid_argument("LOD_TILE_BATCH_SHAPE_INVALID");
    }

    std::unordered_set<std::uint32_t> unique_ordinals;
    unique_ordinals.reserve(row_count);
    for (std::size_t index = 0; index < row_count; ++index) {
        if (!unique_ordinals.insert(candidate_ordinals[index]).second) {
            throw std::invalid_argument("LOD_TILE_BATCH_ORDINALS_MUST_BE_UNIQUE");
        }
        if (som_bmu_ids[index] >= 400) {
            throw std::invalid_argument("LOD_TILE_BATCH_SOM_CELL_OUT_OF_RANGE");
        }
    }

    std::size_t worker_count = requested_workers;
    if (worker_count == 0) worker_count = std::thread::hardware_concurrency();
    if (worker_count == 0) worker_count = 1;
    worker_count = std::min({worker_count, row_count, MAX_LOD_TILE_BATCH_WORKERS_V1});

    using EncodedBlock = std::array<std::uint8_t, sizeof(LodTextureBlock128B)>;
    std::vector<EncodedBlock> output(row_count);
    std::vector<std::uint8_t> valid(row_count, 0);
    std::atomic<std::size_t> next_row{0};

    const auto encode_rows = [&]() {
        for (;;) {
            const std::size_t index = next_row.fetch_add(1, std::memory_order_relaxed);
            if (index >= row_count) return;

            CandidateTileRecord record{};
            record.candidate_ordinal = candidate_ordinals[index];
            record.som_bmu_id = som_bmu_ids[index];
            record.kmeans_cluster_id = kmeans_cluster_ids[index];
            record.packed_vector = pack_turbovec_mrl128(values + index * row_stride, row_stride);
            if (record.packed_vector.valid) {
                output[index] = serialize_lod_texture_block_v1(record);
                valid[index] = 1;
            }
        }
    };

    if (worker_count == 1) {
        encode_rows();
    } else {
        std::vector<std::jthread> workers;
        workers.reserve(worker_count);
        for (std::size_t worker = 0; worker < worker_count; ++worker) {
            workers.emplace_back(encode_rows);
        }
    }

    for (std::size_t index = 0; index < row_count; ++index) {
        if (valid[index] == 0) {
            throw std::invalid_argument("LOD_TILE_BATCH_VECTOR_INVALID_AT_ROW_" + std::to_string(index));
        }
    }
    return output;
}

}
