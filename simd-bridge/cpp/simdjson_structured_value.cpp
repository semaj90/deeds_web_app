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

#include <algorithm>
#include <cstdint>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
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
    result.entry_values.push_back(
        materialize(field.value(), child_id(value_id, "entry", ordinal)));
    ++ordinal;
  }

  result.entries.reserve(result.entry_values.size());
  for (std::uint32_t i = 0; i < result.entry_values.size(); ++i) {
    result.entries.push_back(Entry{i, std::move(keys[i]), &result.entry_values[i]});
  }
  return result;
}

static Value materialize_number(simdjson::ondemand::value value, const std::string& value_id) {
  auto number_result = value.get_number();
  if (number_result.error()) {
    throw std::runtime_error(
        std::string("number parse failed: ") + simdjson::error_message(number_result.error()));
  }

  auto number = number_result.value();
  Value result;
  result.value_id = value_id;

  switch (number.get_number_type()) {
    case simdjson::ondemand::number_type::signed_integer:
      result.kind = Kind::Int;
      result.int_decimal = std::to_string(number.get_int64());
      return result;

    case simdjson::ondemand::number_type::unsigned_integer:
      result.kind = Kind::Int;
      result.int_decimal = std::to_string(number.get_uint64());
      return result;

    case simdjson::ondemand::number_type::floating_point_number:
      result.kind = Kind::Float;
      result.float_value = number.get_double();
      return result;
  }

  throw std::runtime_error("unsupported simdjson number type");
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

    case simdjson::ondemand::json_type::number:
      return materialize_number(value, value_id);

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

static Value materialize_document(simdjson::ondemand::document& document, const std::string& value_id) {
  auto type_result = document.type();
  if (type_result.error()) {
    throw std::runtime_error(
        std::string("document type parse failed: ") + simdjson::error_message(type_result.error()));
  }

  switch (type_result.value()) {
    case simdjson::ondemand::json_type::object: {
      auto object_result = document.get_object();
      if (object_result.error()) throw std::runtime_error("root object materialization failed");
      return materialize_object(object_result.value(), value_id);
    }
    case simdjson::ondemand::json_type::array: {
      auto array_result = document.get_array();
      if (array_result.error()) throw std::runtime_error("root array materialization failed");
      return materialize_array(array_result.value(), value_id);
    }
    case simdjson::ondemand::json_type::string: {
      std::string_view parsed;
      if (auto error = document.get_string().get(parsed); error) {
        throw std::runtime_error(std::string("root string parse failed: ") + simdjson::error_message(error));
      }
      Value result;
      result.value_id = value_id;
      result.kind = Kind::String;
      result.string_value = std::string(parsed);
      return result;
    }
    case simdjson::ondemand::json_type::boolean: {
      bool parsed = false;
      if (auto error = document.get_bool().get(parsed); error) {
        throw std::runtime_error(std::string("root bool parse failed: ") + simdjson::error_message(error));
      }
      Value result;
      result.value_id = value_id;
      result.kind = Kind::Bool;
      result.bool_value = parsed;
      return result;
    }
    case simdjson::ondemand::json_type::number: {
      auto value_result = document.get_value();
      // Some simdjson revisions only expose get_value() for object/array roots;
      // use document.get_number() directly for scalar numeric documents.
      (void)value_result;
      auto number_result = document.get_number();
      if (number_result.error()) {
        throw std::runtime_error(
            std::string("root number parse failed: ") + simdjson::error_message(number_result.error()));
      }
      auto number = number_result.value();
      Value result;
      result.value_id = value_id;
      if (number.get_number_type() == simdjson::ondemand::number_type::floating_point_number) {
        result.kind = Kind::Float;
        result.float_value = number.get_double();
      } else if (number.get_number_type() == simdjson::ondemand::number_type::signed_integer) {
        result.kind = Kind::Int;
        result.int_decimal = std::to_string(number.get_int64());
      } else {
        result.kind = Kind::Int;
        result.int_decimal = std::to_string(number.get_uint64());
      }
      return result;
    }
    case simdjson::ondemand::json_type::null: {
      if (auto error = document.get_null(); error) {
        throw std::runtime_error(std::string("root null parse failed: ") + simdjson::error_message(error));
      }
      Value result;
      result.value_id = value_id;
      result.kind = Kind::Null;
      return result;
    }
  }

  throw std::runtime_error("unsupported root JSON type");
}

static Value parse_document(std::string& json, const std::string& root_id = "json:root") {
  simdjson::ondemand::parser parser;
  auto document_result = parser.iterate(json);
  if (document_result.error()) {
    throw std::runtime_error(
        std::string("simdjson parse failed: ") + simdjson::error_message(document_result.error()));
  }
  auto document = document_result.value();
  return materialize_document(document, root_id);
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
    auto document = doc_result.value();
    values.push_back(materialize_document(document, child_id("jsonl", "document", ordinal)));
    ++ordinal;
  }
  return values;
}

}  // namespace atlas::structured_value
