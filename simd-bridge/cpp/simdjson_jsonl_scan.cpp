// Parent Atlas JSONL snapshot scanner using simdjson On-Demand iterate_many().
//
// This is an ingestion helper, not a canonical data owner. It is intended for
// large immutable/revisioned JSONL snapshots where Node should not materialize
// every record as a JS object before Arrow/cuDF/PyTorch processing.
//
// Build/wiring is deliberately separate from the existing N-API bridge until
// workstation tests prove ABI/toolchain compatibility.

#include "vendor/simdjson.h"

#include <cstdint>
#include <fstream>
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>

namespace atlas::jsonl {

struct ScanStats {
  std::uint64_t documents = 0;
  std::uint64_t with_ordinal = 0;
  std::uint64_t with_canonical_id = 0;
  std::uint64_t with_vector = 0;
  std::uint64_t vector_values = 0;
  std::uint64_t parse_errors = 0;
};

struct ScanOptions {
  std::string ordinal_field = "ordinal";
  std::string canonical_id_field = "canonicalId";
  std::string vector_field = "semantic_768";
  std::size_t batch_size = 1 * 1024 * 1024;
  std::size_t expected_dimension = 768;
};

static std::string read_all(const std::string& path) {
  std::ifstream input(path, std::ios::binary);
  if (!input) {
    throw std::runtime_error("unable to open JSONL input: " + path);
  }
  std::ostringstream buffer;
  buffer << input.rdbuf();
  return buffer.str();
}

static ScanStats scan_buffer(std::string& jsonl, const ScanOptions& options) {
  // iterate_many(std::string&) can extend capacity for required SIMDJSON padding.
  simdjson::ondemand::parser parser;
  parser.set_max_capacity(std::max<std::size_t>(options.batch_size, 64 * 1024 * 1024));

  auto stream_result = parser.iterate_many(jsonl, options.batch_size, false);
  if (stream_result.error()) {
    throw std::runtime_error(
        std::string("iterate_many failed: ") + simdjson::error_message(stream_result.error()));
  }

  ScanStats stats;
  auto docs = stream_result.value();
  for (auto doc_result : docs) {
    if (doc_result.error()) {
      ++stats.parse_errors;
      continue;
    }

    ++stats.documents;
    auto doc = doc_result.value();

    std::uint64_t ordinal = 0;
    if (!doc[options.ordinal_field].get_uint64().get(ordinal)) {
      ++stats.with_ordinal;
    }

    std::string_view canonical_id;
    if (!doc[options.canonical_id_field].get_string().get(canonical_id)) {
      if (!canonical_id.empty()) ++stats.with_canonical_id;
    }

    auto vector_result = doc[options.vector_field].get_array();
    if (!vector_result.error()) {
      std::size_t dims = 0;
      for (auto value_result : vector_result.value()) {
        double value = 0.0;
        if (value_result.get_double().get(value)) {
          ++stats.parse_errors;
          break;
        }
        (void)value;
        ++dims;
      }
      if (dims > 0) {
        ++stats.with_vector;
        stats.vector_values += dims;
        if (options.expected_dimension != 0 && dims != options.expected_dimension) {
          ++stats.parse_errors;
        }
      }
    }
  }
  return stats;
}

static ScanStats scan_file(const std::string& path, const ScanOptions& options = {}) {
  auto buffer = read_all(path);
  return scan_buffer(buffer, options);
}

}  // namespace atlas::jsonl

#ifdef ATLAS_SIMDJSON_JSONL_SCAN_MAIN
int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: atlas-simdjson-jsonl-scan <snapshot.jsonl> [vector_field] [dimension]\n";
    return 2;
  }

  atlas::jsonl::ScanOptions options;
  if (argc >= 3) options.vector_field = argv[2];
  if (argc >= 4) options.expected_dimension = static_cast<std::size_t>(std::stoull(argv[3]));

  try {
    const auto stats = atlas::jsonl::scan_file(argv[1], options);
    std::cout
        << "{\"schema\":\"atlas.simdjson-jsonl-scan.v1\""
        << ",\"documents\":" << stats.documents
        << ",\"withOrdinal\":" << stats.with_ordinal
        << ",\"withCanonicalId\":" << stats.with_canonical_id
        << ",\"withVector\":" << stats.with_vector
        << ",\"vectorValues\":" << stats.vector_values
        << ",\"parseErrors\":" << stats.parse_errors
        << "}\n";
    return stats.parse_errors == 0 ? 0 : 1;
  } catch (const std::exception& exc) {
    std::cerr << "atlas-simdjson-jsonl-scan: " << exc.what() << "\n";
    return 1;
  }
}
#endif
