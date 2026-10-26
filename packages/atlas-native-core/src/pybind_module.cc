#include "fsm_detector.hpp"
#include "radix_sort.hpp"
#include "turbovec_pack.hpp"
#include "tile_assembler.hpp"
#include "pgvector_binary.hpp"

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <cmath>
#include <cstdint>
#include <string>
#include <unordered_set>
#include <vector>

namespace py = pybind11;
using namespace pybind11::literals;

PYBIND11_MODULE(_atlas_native_core, module) {
    module.attr("__version__") = "0.1.0";
    module.def("detect_rfc_or_language_proposal", [](const std::string& text) {
        const auto match = atlas::native::fsm_detect_with_insert_stop(text.data(), text.size());
        return py::dict(
            "matched"_a = match.matched,
            "authority"_a = "PROPOSAL_ONLY",
            "domain_topic"_a = match.domain_topic,
            "rfc_id"_a = match.rfc_id,
            "feature_label"_a = match.feature_label,
            "language_id_hint"_a = match.language_id,
            "byte_offset"_a = match.byte_offset,
            "state_transitions"_a = match.state_transitions
        );
    });
    module.def("radix_sort_som_candidate_indices", [](
        const std::vector<std::uint64_t>& kmeans_cluster_ids,
        const std::vector<std::uint64_t>& som_bmu_ids,
        const std::vector<std::uint64_t>& candidate_ordinals) {
        if (kmeans_cluster_ids.size() != som_bmu_ids.size() ||
            kmeans_cluster_ids.size() != candidate_ordinals.size()) {
            throw py::value_error("SOM_RADIX_KEY_ARRAY_LENGTH_MISMATCH");
        }
        if (candidate_ordinals.size() > UINT32_MAX) {
            throw py::value_error("SOM_RADIX_CANDIDATE_COUNT_OUT_OF_RANGE");
        }
        std::vector<atlas::native::SomTileSortEntry> entries;
        entries.reserve(candidate_ordinals.size());
        std::unordered_set<std::uint32_t> seen_ordinals;
        for (std::size_t index = 0; index < candidate_ordinals.size(); ++index) {
            if (kmeans_cluster_ids[index] > UINT16_MAX || som_bmu_ids[index] >= 400 ||
                candidate_ordinals[index] > UINT32_MAX) {
                throw py::value_error("SOM_RADIX_KEY_OUT_OF_RANGE");
            }
            const auto cluster = static_cast<std::uint16_t>(kmeans_cluster_ids[index]);
            const auto cell = static_cast<std::uint16_t>(som_bmu_ids[index]);
            const auto ordinal = static_cast<std::uint32_t>(candidate_ordinals[index]);
            if (!seen_ordinals.insert(ordinal).second) {
                throw py::value_error("SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE");
            }
            entries.push_back({
                atlas::native::pack_som_radix_key(cluster, cell, ordinal),
                cluster,
                cell,
                ordinal,
                static_cast<std::uint32_t>(index),
            });
        }
        {
            py::gil_scoped_release release;
            atlas::native::radix_sort_som_tiles(entries);
        }
        std::vector<std::uint32_t> sorted_indices;
        sorted_indices.reserve(entries.size());
        for (const auto& entry : entries) sorted_indices.push_back(entry.source_index);
        return sorted_indices;
    }, "kmeans_cluster_ids"_a, "som_bmu_ids"_a, "candidate_ordinals"_a);
    module.def("pack_turbovec_mrl128", [](const std::vector<float>& values) {
        if (values.size() < atlas::native::TURBOVEC_MRL_DIM) {
            throw py::value_error("TURBOVEC_MRL_PREFIX_MUST_HAVE_128_VALUES");
        }
        atlas::native::PackedTurboVecBlob packed{};
        {
            py::gil_scoped_release release;
            packed = atlas::native::pack_turbovec_mrl128(values.data(), values.size());
        }
        if (!packed.valid) {
            throw py::value_error("TURBOVEC_VECTOR_VALUES_MUST_BE_FINITE");
        }
        return py::dict(
            "scale_4bit"_a = packed.scale_4bit,
            "scale_2bit"_a = packed.scale_2bit,
            "minimum"_a = packed.min_val,
            "maximum"_a = packed.max_val,
            "bytea_4bit"_a = py::bytes(reinterpret_cast<const char*>(packed.data_4bit.data()), packed.data_4bit.size()),
            "bytea_2bit"_a = py::bytes(reinterpret_cast<const char*>(packed.data_2bit.data()), packed.data_2bit.size()),
            "sign_bitset_128"_a = py::bytes(reinterpret_cast<const char*>(packed.sign_bitset_128.data()), packed.sign_bitset_128.size()),
            "sign_bitset_128_bit_string"_a = atlas::native::sign_bitset_128_as_bit_string(packed.sign_bitset_128.data()),
            "authority"_a = "PROJECTION_PROPOSAL"
        );
    });
    module.def("assemble_lod_texture_block_v1", [](const std::vector<float>& values,
                                                     std::uint32_t candidate_ordinal,
                                                     std::uint16_t som_bmu_id,
                                                     std::uint16_t kmeans_cluster_id) {
        if (values.size() < atlas::native::TURBOVEC_MRL_DIM) {
            throw py::value_error("TURBOVEC_MRL_PREFIX_MUST_HAVE_128_VALUES");
        }
        atlas::native::CandidateTileRecord record{};
        record.candidate_ordinal = candidate_ordinal;
        record.som_bmu_id = som_bmu_id;
        record.kmeans_cluster_id = kmeans_cluster_id;
        {
            py::gil_scoped_release release;
            record.packed_vector = atlas::native::pack_turbovec_mrl128(values.data(), values.size());
        }
        if (!record.packed_vector.valid) {
            throw py::value_error("TURBOVEC_VECTOR_VALUES_MUST_BE_FINITE");
        }
        const auto encoded = atlas::native::serialize_lod_texture_block_v1(record);
        return py::bytes(reinterpret_cast<const char*>(encoded.data()), encoded.size());
    }, "values"_a, "candidate_ordinal"_a, "som_bmu_id"_a, "kmeans_cluster_id"_a);
    module.def("bitset128_jaccard_similarity", [](const py::bytes& a_bytes, const py::bytes& b_bytes) {
        std::string a = a_bytes;
        std::string b = b_bytes;
        if (a.size() != atlas::native::PG18_BITSET_BYTES || b.size() != atlas::native::PG18_BITSET_BYTES) {
            throw py::value_error("SIGN_BITSET_128_MUST_BE_16_BYTES");
        }
        return atlas::native::bitset128_jaccard_similarity(
            reinterpret_cast<const std::uint8_t*>(a.data()),
            reinterpret_cast<const std::uint8_t*>(b.data())
        );
    });
    module.def("asymmetric_dot_2bit", [](const std::vector<float>& query_128, const py::bytes& packed_32b, float min_val, float scale_2bit) {
        std::string packed = packed_32b;
        if (query_128.size() < atlas::native::TURBOVEC_MRL_DIM || packed.size() != atlas::native::TURBOVEC_2BIT_BYTES) {
            throw py::value_error("TURBOVEC_2BIT_INPUT_SHAPE_INVALID");
        }
        const float score = atlas::native::asymmetric_dot_2bit(
            query_128.data(),
            reinterpret_cast<const std::uint8_t*>(packed.data()),
            min_val,
            scale_2bit
        );
        if (std::isnan(score)) {
            throw py::value_error("TURBOVEC_2BIT_SCORE_NAN");
        }
        return score;
    });
    module.def("asymmetric_dot_4bit", [](const std::vector<float>& query_128, const py::bytes& packed_64b, float min_val, float scale_4bit) {
        std::string packed = packed_64b;
        if (query_128.size() < atlas::native::TURBOVEC_MRL_DIM || packed.size() != atlas::native::TURBOVEC_4BIT_BYTES) {
            throw py::value_error("TURBOVEC_4BIT_INPUT_SHAPE_INVALID");
        }
        const float score = atlas::native::asymmetric_dot_4bit(
            query_128.data(),
            reinterpret_cast<const std::uint8_t*>(packed.data()),
            min_val,
            scale_4bit
        );
        if (!std::isfinite(score)) {
            throw py::value_error("TURBOVEC_4BIT_SCORE_INVALID");
        }
        return score;
    });
    module.def("unpack_pgvector_binary_768", [](const py::bytes& raw_bytes) {
        const std::string raw = raw_bytes;
        std::array<float, atlas::native::PGVECTOR_768_DIM> output{};
        if (!atlas::native::unpack_pgvector_binary_768(
                reinterpret_cast<const std::uint8_t*>(raw.data()), raw.size(), output.data())) {
            throw py::value_error("PGVECTOR_768_BINARY_INVALID");
        }
        return std::vector<float>(output.begin(), output.end());
    });
}
