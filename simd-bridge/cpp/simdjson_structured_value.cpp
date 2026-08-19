// Parent Atlas ordered JSON/JSONL -> StructuredValue materializer.
//
// This parser preserves JSON object encounter order by iterating each On-Demand
// object exactly once and appending repeated KeyValueEntry records. It never
// converts source/evidence objects to std::map/unordered_map, so duplicate keys
// remain observable at this boundary.
//
// Source AST provenance is NOT minted here. Tree-sitter/GIS may attach
// sourceEvidence later when this value corresponds to source-code structure.

#include "vendor/simdjson.h"

#include <cstdint>
#include <iomanip>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

namespace atlas::structured_value {

enum class Kind {
  Null,
  Bool,
  Int,
  Float,
  String,
  List,
  Object,
};

struct Value;

struct Member {
  std::uint32_t ordinal = 0;
  Value* value = nullptr;
};

struct Entry {
  std::uint32_t ordinal = 0;
  std::string key;
  Value* value = nullptr;
};

struct Value {
  std::string value_id;
  Kind kind = Kind::Null;
  std::optional<bool> bool_value;
  std::optional<std::string> int_decimal;
  std::optional<double> float_value;
  std::optional<std::string> string_value;
  std::vector<Value> member_values;
  std::vector<Member> members;
  std::vector<Value> entry_values;
  std::vector<Entry> entries;
};

static std::string child_id(std::string_view parent, std::string_view segment, std::uint32_t ordinal) {
  std::ostringstream out;
  out << parent << '/' << segment << '/' << ordinal;
  return out.str();
}

static Value materialize(simdjson::ondemand::value value, const std::string& value_id);

static Value materialize_array(simdjson::ondemand::array array, const std::string& value_id) {
  Value result;
  result.value_id = value_id;
  result.kind = Kind::List;

  std::uint32_t ordinal = 0;
  for (auto element_result : array) {
    if (element_result.error()) {
      throw std::runtime_error(
          std::string("array element parse failed: ") + simdjson::error_message(element_result.error()));
    }
    result.member_values.push_back(
        materialize(element_result.value(), child_id(value_id, "member", ordinal)));
    ++ordinal;
  }

  result.members.reserve(result.member_values.size());
  for (std::uint32_t i = 0; i < result.member_values.size(); ++i) {
    result.members.push_back(Member{i, &result.member_values[i]});
  }
  return result;
}

static Value materialize_object(simdjson::ondemand::object object, const std::string& value_id) {
  Value result;
  result.value_id = value_id;
  result.kind = Kind::Object;

  // On-Demand objects are forward-only. Consume key/value immediately while the
  // field is current, and preserve encounter order with ordinal.
  std::uint32_t ordinal = 0;
  std::vector<std::string> keys;
  for (auto field_result : object) {
    if (field_result.error()) {
      throw std::runtime_error(
          std::string("object field parse failed: ") + simdjson::error_message(field_result.error()));
    }
    auto field = field_result.value();
    std::string_view key_view;
    auto key_error = field.unescaped_key().get(key_view);
    if (key_error) {
      throw std::runtime_error(
          std::string("object key parse failed: ") + simdjson::error_message(key_error));
    }

    keys.emplace_back(key_view);
    auto field_value = field.value();
    result.entry_values.push_back(
        materialize(field_value, child_id(value_id, "entry", ordinal)));
    ++ordinal;
  }

  result.entries.reserve(result.entry_values.size());
  for (std::uint32_t i = 0; i < result.entry_values.size(); ++i) {
    result.entries.push_back(Entry{i, std::move(keys[i]), &result.entry_values[i]});
  }
  return result;
}

static Value materialize(simdjson::ondemand::value value, const std::string& value_id) {
  auto type_result = value.type();
  if (type_result.error()) {
    throw std::runtime_error(
        std::string("value type parse failed: ") + simdjson::error_message(type_result.error()));
  }

  Value result;
  result.value_id = value_id;

  switch (type_result.value()) {
    case simdjson::ondemand::json_type::null:
      if (auto error = value.get_null(); error) {
        throw std::runtime_error(std::string("null parse failed: ") + simdjson::error_message(error));
      }
      result.kind = Kind::Null;
      return result;

    case simdjson::ondemand::json_type::boolean: {
      bool parsed = false;
      if (auto error = value.get_bool().get(parsed); error) {
        throw std::runtime_error(std::string("bool parse failed: ") + simdjson::error_message(error));
      }
      result.kind = Kind::Bool;
      result.bool_value = parsed;
      return result;
    }

    case simdjson::ondemand::json_type::number: {
      // Preserve integer precision when the token is integer-shaped. On-Demand
      // exposes both signed/unsigned integer accessors and double fallback.
      std::int64_t signed_value = 0;
      if (!value.get_int64().get(signed_value)) {
        result.kind = Kind::Int;
        result.int_decimal = std::to_string(signed_value);
        return result;
      }

      std::uint64_t unsigned_value = 0;
      if (!value.get_uint64().get(unsigned_value)) {
        result.kind = Kind::Int;
        result.int_decimal = std::to_string(unsigned_value);
        return result;
      }

      double parsed = 0.0;
      if (auto error = value.get_double().get(parsed); error) {
        throw std::runtime_error(std::string("number parse failed: ") + simdjson::error_message(error));
      }
      result.kind = Kind::Float;
      result.float_value = parsed;
      return result;
    }

    case simdjson::ondemand::json_type::string: {
      std::string_view parsed;
      if (auto error = value.get_string().get(parsed); error) {
        throw std::runtime_error(std::string("string parse failed: ") + simdjson::error_message(error));
      }
      result.kind = Kind::String;
      result.string_value = std::string(parsed);
      return result;
    }

    case simdjson::ondemand::json_type::array: {
      auto array_result = value.get_array();
      if (array_result.error()) throw std::runtime_error("array materialization failed");
      return materialize_array(array_result.value(), value_id);
    }

    case simdjson::ondemand::json_type::object: {
      auto object_result = value.get_object();
      if (object_result.error()) throw std::runtime_error("object materialization failed");
      return materialize_object(object_result.value(), value_id);
    }
  }

  throw std::runtime_error("unsupported JSON value type");
}

static Value parse_document(std::string& json, const std::string& root_id = "json:root") {
  simdjson::ondemand::parser parser;
  auto document_result = parser.iterate(json);
  if (document_result.error()) {
    throw std::runtime_error(
        std::string("simdjson parse failed: ") + simdjson::error_message(document_result.error()));
  }
  return materialize(document_result.value(), root_id);
}

static std::vector<Value> parse_jsonl(std::string& jsonl, std::size_t batch_size = 1 * 1024 * 1024) {
  simdjson::ondemand::parser parser;
  parser.set_max_capacity(std::max<std::size_t>(batch_size, 64 * 1024 * 1024));
  auto docs_result = parser.iterate_many(jsonl, batch_size, false);
  if (docs_result.error()) {
    throw std::runtime_error(
        std::string("iterate_many failed: ") + simdjson::error_message(docs_result.error()));
  }

  std::vector<Value> values;
  std::uint32_t ordinal = 0;
  for (auto doc_result : docs_result.value()) {
    if (doc_result.error()) {
      throw std::runtime_error(
          std::string("JSONL document failed: ") + simdjson::error_message(doc_result.error()));
    }
    values.push_back(materialize(doc_result.value(), child_id("jsonl", "document", ordinal)));
    ++ordinal;
  }
  return values;
}

}  // namespace atlas::structured_value
