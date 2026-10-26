/**
 * simdjson N-API Bridge
 *
 * Exposes simdjson functions to Node.js via N-API:
 *   - simdJsonParse(json: string) → string (validated round-trip)
 *   - simdJsonValidate(json: string) → boolean (fast structural check)
 *   - simdJsonExtractNumbers(json: string, pointer: string) → Float64Array
 */

#include <node_api.h>
#include "vendor/simdjson.h"
#include <vector>
#include <string>
#include <cmath>
#include <cstdint>
#include <limits>

// Thread-local parser for zero-allocation reuse across calls
static thread_local simdjson::ondemand::parser tl_parser;
// Separate parser for dom API (used by extractNumbers)
static thread_local simdjson::dom::parser tl_dom_parser;

// ── simdJsonParse(json: string) → string ────────────────────────────
// Parses JSON with simdjson (validates structure), then serializes back.
// Returns the minified JSON string. Throws on invalid JSON.

static napi_value SimdJsonParse(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "simdJsonParse: expected 1 argument (JSON string)");
    return nullptr;
  }

  // Get string length
  size_t str_len = 0;
  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &str_len);

  // Allocate buffer with simdjson padding
  std::string buf(str_len + simdjson::SIMDJSON_PADDING, '\0');
  napi_get_value_string_utf8(env, argv[0], buf.data(), str_len + 1, &str_len);

  // Parse with dom API for serialization
  simdjson::dom::element doc;
  auto error = tl_dom_parser.parse(buf.data(), str_len).get(doc);
  if (error) {
    std::string msg = "simdJsonParse: invalid JSON — ";
    msg += simdjson::error_message(error);
    napi_throw_error(env, nullptr, msg.c_str());
    return nullptr;
  }

  // Serialize back to minified JSON
  std::string output = simdjson::minify(doc);

  napi_value result;
  napi_create_string_utf8(env, output.c_str(), output.size(), &result);
  return result;
}

// ── simdJsonValidate(json: string) → boolean ────────────────────────
// Fast structural validation without full parse. ~20x faster than parse.

static napi_value SimdJsonValidate(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "simdJsonValidate: expected 1 argument (JSON string)");
    return nullptr;
  }

  size_t str_len = 0;
  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &str_len);

  std::string buf(str_len + simdjson::SIMDJSON_PADDING, '\0');
  napi_get_value_string_utf8(env, argv[0], buf.data(), str_len + 1, &str_len);

  // Just try to parse — success = valid
  simdjson::dom::element doc;
  auto error = tl_dom_parser.parse(buf.data(), str_len).get(doc);

  napi_value result;
  napi_get_boolean(env, error == simdjson::SUCCESS, &result);
  return result;
}

static bool isValidUtf8Range(const uint8_t *bytes, uint32_t start, uint32_t end) {
  uint32_t index = start;
  while (index < end) {
    const uint8_t first = bytes[index++];
    if (first <= 0x7F) continue;
    uint32_t codepoint = 0;
    uint32_t continuation_count = 0;
    if (first >= 0xC2 && first <= 0xDF) {
      codepoint = first & 0x1F;
      continuation_count = 1;
    } else if (first >= 0xE0 && first <= 0xEF) {
      codepoint = first & 0x0F;
      continuation_count = 2;
    } else if (first >= 0xF0 && first <= 0xF4) {
      codepoint = first & 0x07;
      continuation_count = 3;
    } else {
      return false;
    }
    if (end - index < continuation_count) return false;
    for (uint32_t offset = 0; offset < continuation_count; ++offset) {
      const uint8_t next = bytes[index++];
      if ((next & 0xC0) != 0x80) return false;
      codepoint = (codepoint << 6) | (next & 0x3F);
    }
    if ((continuation_count == 1 && codepoint < 0x80) ||
        (continuation_count == 2 && codepoint < 0x800) ||
        (continuation_count == 3 && codepoint < 0x10000) ||
        (codepoint >= 0xD800 && codepoint <= 0xDFFF) || codepoint > 0x10FFFF) {
      return false;
    }
  }
  return true;
}

static napi_value SimdJsonValidateAstSpans(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) {
    napi_throw_type_error(env, nullptr, "simdJsonValidateAstSpans: expected (Uint32Array spans, Uint8Array sourceBytes)");
    return nullptr;
  }
  napi_typedarray_type type;
  size_t length = 0;
  void *data = nullptr;
  napi_typedarray_type source_type;
  size_t source_length = 0;
  void *source_data = nullptr;
  if (napi_get_typedarray_info(env, argv[0], &type, &length, &data, nullptr, nullptr) != napi_ok ||
      type != napi_uint32_array || length % 2 != 0 ||
      napi_get_typedarray_info(env, argv[1], &source_type, &source_length, &source_data, nullptr, nullptr) != napi_ok ||
      source_type != napi_uint8_array || source_length > std::numeric_limits<uint32_t>::max()) {
    napi_throw_type_error(env, nullptr, "simdJsonValidateAstSpans: expected Uint32Array spans and Uint8Array source bytes");
    return nullptr;
  }
  const auto *spans = static_cast<const uint32_t *>(data);
  const auto *source = static_cast<const uint8_t *>(source_data);
  bool valid = true;
  for (size_t index = 0; index < length; index += 2) {
    const uint32_t start = spans[index];
    const uint32_t end = spans[index + 1];
    if (start >= end || end > source_length ||
        (start > 0 && (source[start] & 0xC0) == 0x80) ||
        (end < source_length && (source[end] & 0xC0) == 0x80) ||
        !isValidUtf8Range(source, start, end)) {
      valid = false;
      break;
    }
  }
  napi_value result;
  napi_get_boolean(env, valid, &result);
  return result;
}

// ── simdJsonExtractNumbers(json: string, pointer: string) → Float64Array ─
// Extracts a JSON array of numbers at a given JSON Pointer path directly
// into a Float64Array, skipping JS object allocation entirely.
// Example: simdJsonExtractNumbers('{"vec":[1.0,2.0,3.0]}', '/vec') → Float64Array[1,2,3]

static napi_value SimdJsonExtractNumbers(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 2) {
    napi_throw_type_error(env, nullptr, "simdJsonExtractNumbers: expected (json, pointer)");
    return nullptr;
  }

  // Get JSON string
  size_t json_len = 0;
  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &json_len);
  std::string json_buf(json_len + simdjson::SIMDJSON_PADDING, '\0');
  napi_get_value_string_utf8(env, argv[0], json_buf.data(), json_len + 1, &json_len);

  // Get JSON Pointer string
  size_t ptr_len = 0;
  napi_get_value_string_utf8(env, argv[1], nullptr, 0, &ptr_len);
  std::string pointer(ptr_len + 1, '\0');
  napi_get_value_string_utf8(env, argv[1], pointer.data(), ptr_len + 1, &ptr_len);
  pointer.resize(ptr_len);

  // Parse document
  simdjson::dom::element doc;
  auto parse_err = tl_dom_parser.parse(json_buf.data(), json_len).get(doc);
  if (parse_err) {
    napi_throw_error(env, nullptr, "simdJsonExtractNumbers: invalid JSON");
    return nullptr;
  }

  // Navigate to pointer
  simdjson::dom::element target;
  auto ptr_err = doc.at_pointer(pointer).get(target);
  if (ptr_err) {
    std::string msg = "simdJsonExtractNumbers: pointer not found — ";
    msg += pointer;
    napi_throw_error(env, nullptr, msg.c_str());
    return nullptr;
  }

  // Must be an array
  simdjson::dom::array arr;
  auto arr_err = target.get_array().get(arr);
  if (arr_err) {
    napi_throw_error(env, nullptr, "simdJsonExtractNumbers: target is not an array");
    return nullptr;
  }

  // Extract numbers into a vector
  std::vector<double> numbers;
  numbers.reserve(1024); // Pre-allocate for typical embedding size
  for (auto element : arr) {
    double val;
    auto num_err = element.get_double().get(val);
    if (num_err) {
      // Try int64 fallback
      int64_t ival;
      auto int_err = element.get_int64().get(ival);
      if (int_err) {
        napi_throw_error(env, nullptr, "simdJsonExtractNumbers: array contains non-numeric value");
        return nullptr;
      }
      val = static_cast<double>(ival);
    }
    numbers.push_back(val);
  }

  // Create Float64Array
  void* out_data = nullptr;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, numbers.size() * sizeof(double), &out_data, &arraybuffer);
  if (out_data && !numbers.empty()) {
    memcpy(out_data, numbers.data(), numbers.size() * sizeof(double));
  }

  napi_value result;
  napi_create_typedarray(env, napi_float64_array, numbers.size(), arraybuffer, 0, &result);
  return result;
}

// ── simdJsonBackend() → string ──────────────────────────────────────
// Returns the active SIMD implementation name (e.g. "haswell" = AVX2).

static napi_value SimdJsonBackend(napi_env env, napi_callback_info info) {
  (void)info;
  const simdjson::implementation* impl = simdjson::get_active_implementation();
  std::string name(impl->name());
  std::string desc(impl->description());
  std::string result_str = name + " (" + desc + ")";
  napi_value result;
  napi_create_string_utf8(env, result_str.c_str(), result_str.size(), &result);
  return result;
}

// ── simdJsonToCSR(json: string | Uint8Array | Buffer) → { rowPtr, colIndices, numNodes, numEdges, edgeWeights? }
// Fast zero-copy SIMD parsing of graph JSON into contiguous CSR TypedArrays.
// Supports:
//   1. Adjacency list: [[1, 2], [2], [0]]
//   2. Weighted adjacency list: [[[1, 0.5], [2, 1.2]], [[2, 0.8]], [[0, 2.5]]]
//   3. Object format: {"adjacency": [[1, 2], [2], [0]], "weights": [[0.5, 1.2], [0.8], [2.5]]}
//   4. Edge list: {"numNodes": 3, "edges": [[0, 1], [0, 2], [1, 2], [2, 0]]}

static napi_value SimdJsonToCSR(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_type_error(env, nullptr, "simdJsonToCSR: expected 1 argument (JSON string or Buffer)");
    return nullptr;
  }

  std::string buf;
  size_t str_len = 0;
  bool is_ta = false;
  napi_is_typedarray(env, argv[0], &is_ta);

  if (is_ta) {
    napi_typedarray_type type;
    size_t length = 0;
    void* data = nullptr;
    napi_get_typedarray_info(env, argv[0], &type, &length, &data, nullptr, nullptr);
    str_len = length;
    buf.resize(str_len + simdjson::SIMDJSON_PADDING, '\0');
    if (data && str_len > 0) {
      memcpy(buf.data(), data, str_len);
    }
  } else {
    napi_valuetype vt;
    napi_typeof(env, argv[0], &vt);
    if (vt != napi_string) {
      napi_throw_type_error(env, nullptr, "simdJsonToCSR: argument must be a string or TypedArray/Buffer");
      return nullptr;
    }
    napi_get_value_string_utf8(env, argv[0], nullptr, 0, &str_len);
    buf.resize(str_len + simdjson::SIMDJSON_PADDING, '\0');
    napi_get_value_string_utf8(env, argv[0], buf.data(), str_len + 1, &str_len);
  }

  simdjson::dom::element doc;
  auto parse_err = tl_dom_parser.parse(buf.data(), str_len).get(doc);
  if (parse_err) {
    std::string msg = "simdJsonToCSR: invalid JSON — ";
    msg += simdjson::error_message(parse_err);
    napi_throw_error(env, nullptr, msg.c_str());
    return nullptr;
  }

  // Branch A: Edge list format {"edges": [[u, v, (w)?], ...], "numNodes": N}
  if (doc.is_object()) {
    simdjson::dom::element edges_elem;
    if (doc.at_key("edges").get(edges_elem) == simdjson::SUCCESS && edges_elem.is_array()) {
      auto edges_arr = edges_elem.get_array().value();
      size_t edge_count = edges_arr.size();
      int32_t num_nodes = 0;

      simdjson::dom::element nodes_elem;
      if (doc.at_key("numNodes").get(nodes_elem) == simdjson::SUCCESS && nodes_elem.is_int64()) {
        num_nodes = static_cast<int32_t>(nodes_elem.get_int64().value());
      } else if (doc.at_key("num_nodes").get(nodes_elem) == simdjson::SUCCESS && nodes_elem.is_int64()) {
        num_nodes = static_cast<int32_t>(nodes_elem.get_int64().value());
      }

      std::vector<int32_t> u_list;
      std::vector<int32_t> v_list;
      std::vector<float> w_list;
      u_list.reserve(edge_count);
      v_list.reserve(edge_count);
      bool has_weights = false;

      for (auto edge : edges_arr) {
        if (edge.is_array()) {
          auto e = edge.get_array().value();
          if (e.size() >= 2) {
            int64_t u = e.at(0).value().get_int64().value();
            int64_t v = e.at(1).value().get_int64().value();
            u_list.push_back(static_cast<int32_t>(u));
            v_list.push_back(static_cast<int32_t>(v));
            if (num_nodes <= u) num_nodes = static_cast<int32_t>(u) + 1;
            if (num_nodes <= v) num_nodes = static_cast<int32_t>(v) + 1;
            if (e.size() >= 3) {
              has_weights = true;
              double w = 0.0;
              if (e.at(2).value().get_double().get(w) == simdjson::SUCCESS) {
                w_list.push_back(static_cast<float>(w));
              } else {
                int64_t iw = 0;
                e.at(2).value().get_int64().get(iw);
                w_list.push_back(static_cast<float>(iw));
              }
            }
          }
        }
      }

      std::vector<int32_t> degrees(num_nodes, 0);
      for (int32_t u : u_list) {
        if (u >= 0 && u < num_nodes) degrees[u]++;
      }

      void* raw_row_ptr = nullptr;
      napi_value ab_row_ptr;
      napi_create_arraybuffer(env, (num_nodes + 1) * sizeof(int32_t), &raw_row_ptr, &ab_row_ptr);
      int32_t* row_ptr_data = static_cast<int32_t*>(raw_row_ptr);
      row_ptr_data[0] = 0;
      for (int32_t i = 0; i < num_nodes; ++i) {
        row_ptr_data[i + 1] = row_ptr_data[i] + degrees[i];
      }

      void* raw_col_indices = nullptr;
      napi_value ab_col_indices;
      napi_create_arraybuffer(env, u_list.size() * sizeof(int32_t), &raw_col_indices, &ab_col_indices);
      int32_t* col_indices_data = static_cast<int32_t*>(raw_col_indices);

      void* raw_weights = nullptr;
      napi_value ab_weights;
      float* weights_data = nullptr;
      if (has_weights) {
        napi_create_arraybuffer(env, u_list.size() * sizeof(float), &raw_weights, &ab_weights);
        weights_data = static_cast<float*>(raw_weights);
      }

      std::vector<int32_t> offsets(num_nodes, 0);
      for (size_t i = 0; i < u_list.size(); ++i) {
        int32_t u = u_list[i];
        int32_t v = v_list[i];
        if (u >= 0 && u < num_nodes) {
          int32_t pos = row_ptr_data[u] + offsets[u]++;
          col_indices_data[pos] = v;
          if (has_weights && weights_data && i < w_list.size()) {
            weights_data[pos] = w_list[i];
          }
        }
      }

      napi_value result_obj;
      napi_create_object(env, &result_obj);
      napi_value ta_row_ptr, ta_col_indices, val_nodes, val_edges;
      napi_create_typedarray(env, napi_int32_array, num_nodes + 1, ab_row_ptr, 0, &ta_row_ptr);
      napi_create_typedarray(env, napi_int32_array, u_list.size(), ab_col_indices, 0, &ta_col_indices);
      napi_create_int32(env, num_nodes, &val_nodes);
      napi_create_int32(env, static_cast<int32_t>(u_list.size()), &val_edges);

      napi_set_named_property(env, result_obj, "rowPtr", ta_row_ptr);
      napi_set_named_property(env, result_obj, "colIndices", ta_col_indices);
      napi_set_named_property(env, result_obj, "numNodes", val_nodes);
      napi_set_named_property(env, result_obj, "numEdges", val_edges);
      if (has_weights) {
        napi_value ta_weights;
        napi_create_typedarray(env, napi_float32_array, u_list.size(), ab_weights, 0, &ta_weights);
        napi_set_named_property(env, result_obj, "edgeWeights", ta_weights);
      }
      return result_obj;
    }
  }

  // Branch B: Adjacency list (array of neighbor arrays, or object with "adjacency": [[...], ...])
  simdjson::dom::array adj_arr;
  bool separate_weights = false;
  simdjson::dom::element weights_elem;

  if (doc.is_array()) {
    adj_arr = doc.get_array().value();
  } else if (doc.is_object()) {
    simdjson::dom::element adj_elem;
    if (doc.at_key("adjacency").get(adj_elem) == simdjson::SUCCESS && adj_elem.is_array()) {
      adj_arr = adj_elem.get_array().value();
      if (doc.at_key("weights").get(weights_elem) == simdjson::SUCCESS && weights_elem.is_array()) {
        separate_weights = true;
      }
    } else {
      napi_throw_error(env, nullptr, "simdJsonToCSR: object must have 'edges' or 'adjacency' array");
      return nullptr;
    }
  } else {
    napi_throw_error(env, nullptr, "simdJsonToCSR: JSON root must be an array of adjacency lists or an object");
    return nullptr;
  }

  size_t num_nodes = adj_arr.size();
  size_t total_edges = 0;
  bool has_weights = separate_weights;

  // Pass 1: Count total edges & check inline weights
  for (auto row : adj_arr) {
    if (row.is_array()) {
      auto row_a = row.get_array().value();
      total_edges += row_a.size();
      if (!has_weights && row_a.size() > 0) {
        auto first = row_a.at(0).value();
        if (first.is_array()) {
          has_weights = true;
        }
      }
    }
  }

  void* raw_row_ptr = nullptr;
  napi_value ab_row_ptr;
  napi_create_arraybuffer(env, (num_nodes + 1) * sizeof(int32_t), &raw_row_ptr, &ab_row_ptr);
  int32_t* row_ptr_data = static_cast<int32_t*>(raw_row_ptr);

  void* raw_col_indices = nullptr;
  napi_value ab_col_indices;
  napi_create_arraybuffer(env, total_edges * sizeof(int32_t), &raw_col_indices, &ab_col_indices);
  int32_t* col_indices_data = static_cast<int32_t*>(raw_col_indices);

  void* raw_weights = nullptr;
  napi_value ab_weights;
  float* weights_data = nullptr;
  if (has_weights) {
    napi_create_arraybuffer(env, total_edges * sizeof(float), &raw_weights, &ab_weights);
    weights_data = static_cast<float*>(raw_weights);
  }

  row_ptr_data[0] = 0;
  size_t cur_edge = 0;
  size_t node_idx = 0;

  for (auto row : adj_arr) {
    if (row.is_array()) {
      auto row_a = row.get_array().value();
      for (auto edge_elem : row_a) {
        if (edge_elem.is_array()) {
          auto pair = edge_elem.get_array().value();
          int64_t target = pair.at(0).value().get_int64().value();
          col_indices_data[cur_edge] = static_cast<int32_t>(target);
          if (weights_data && pair.size() >= 2) {
            double w = 0.0;
            if (pair.at(1).value().get_double().get(w) == simdjson::SUCCESS) {
              weights_data[cur_edge] = static_cast<float>(w);
            } else {
              int64_t iw = 0;
              pair.at(1).value().get_int64().get(iw);
              weights_data[cur_edge] = static_cast<float>(iw);
            }
          }
        } else {
          int64_t target = edge_elem.get_int64().value();
          col_indices_data[cur_edge] = static_cast<int32_t>(target);
        }
        cur_edge++;
      }
    }
    row_ptr_data[node_idx + 1] = static_cast<int32_t>(cur_edge);
    node_idx++;
  }

  if (separate_weights && weights_data) {
    size_t w_edge = 0;
    auto w_arr = weights_elem.get_array().value();
    for (auto row_w : w_arr) {
      if (row_w.is_array()) {
        for (auto w_val : row_w.get_array().value()) {
          if (w_edge < total_edges) {
            double w = 0.0;
            if (w_val.get_double().get(w) == simdjson::SUCCESS) {
              weights_data[w_edge++] = static_cast<float>(w);
            } else {
              int64_t iw = 0;
              w_val.get_int64().get(iw);
              weights_data[w_edge++] = static_cast<float>(iw);
            }
          }
        }
      }
    }
  }

  napi_value result_obj;
  napi_create_object(env, &result_obj);
  napi_value ta_row_ptr, ta_col_indices, val_nodes, val_edges;
  napi_create_typedarray(env, napi_int32_array, num_nodes + 1, ab_row_ptr, 0, &ta_row_ptr);
  napi_create_typedarray(env, napi_int32_array, total_edges, ab_col_indices, 0, &ta_col_indices);
  napi_create_int32(env, static_cast<int32_t>(num_nodes), &val_nodes);
  napi_create_int32(env, static_cast<int32_t>(total_edges), &val_edges);

  napi_set_named_property(env, result_obj, "rowPtr", ta_row_ptr);
  napi_set_named_property(env, result_obj, "colIndices", ta_col_indices);
  napi_set_named_property(env, result_obj, "numNodes", val_nodes);
  napi_set_named_property(env, result_obj, "numEdges", val_edges);
  if (has_weights) {
    napi_value ta_weights;
    napi_create_typedarray(env, napi_float32_array, total_edges, ab_weights, 0, &ta_weights);
    napi_set_named_property(env, result_obj, "edgeWeights", ta_weights);
  }
  return result_obj;
}

// ── Registration (called from binding.cc Init) ──────────────────────

extern "C" {

napi_value RegisterSimdJsonParse(napi_env env, napi_callback_info info) {
  return SimdJsonParse(env, info);
}

napi_value RegisterSimdJsonValidate(napi_env env, napi_callback_info info) {
  return SimdJsonValidate(env, info);
}

napi_value RegisterSimdJsonValidateAstSpans(napi_env env, napi_callback_info info) {
  return SimdJsonValidateAstSpans(env, info);
}

napi_value RegisterSimdJsonExtractNumbers(napi_env env, napi_callback_info info) {
  return SimdJsonExtractNumbers(env, info);
}

napi_value RegisterSimdJsonBackend(napi_env env, napi_callback_info info) {
  return SimdJsonBackend(env, info);
}

napi_value RegisterSimdJsonToCSR(napi_env env, napi_callback_info info) {
  return SimdJsonToCSR(env, info);
}

} // extern "C"
