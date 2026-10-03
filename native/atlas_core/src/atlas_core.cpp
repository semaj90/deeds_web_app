#include "atlas_core.h"

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <new>
#include <vector>

namespace {
constexpr uint32_t kAllocatorId = 1u;

bool hasV1Size(uint32_t struct_size, size_t expected_size) {
  return struct_size >= expected_size;
}

bool fixedStringValid(const char *value, size_t capacity, bool required) {
  if (value == nullptr) return false;
  const void *terminator = std::memchr(value, '\0', capacity);
  if (terminator == nullptr) return false;
  return !required || value[0] != '\0';
}

bool sha256Valid(const char *value) {
  if (!fixedStringValid(value, ATLAS_MODEL_SHA256_HEX_LENGTH + 1u, true) ||
      std::strlen(value) != ATLAS_MODEL_SHA256_HEX_LENGTH) return false;
  for (size_t index = 0; index < ATLAS_MODEL_SHA256_HEX_LENGTH; ++index) {
    const char ch = value[index];
    if (!((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') ||
          (ch >= 'A' && ch <= 'F'))) return false;
  }
  return true;
}

atlas_status_t setRepresentationResult(
    atlas_representation_validation_receipt_v1_t *receipt,
    atlas_status_t status,
    atlas_representation_reason_t reason) {
  receipt->status = status;
  receipt->reason = reason;
  return status;
}

atlas_status_t validateRepresentation(
    const atlas_representation_contract_v1_t *contract,
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (contract == nullptr ||
      !hasV1Size(contract->struct_size, sizeof(*contract)) ||
      contract->abi_version != ATLAS_ABI_VERSION_1 ||
      !fixedStringValid(contract->representation_id, sizeof(contract->representation_id), true) ||
      !fixedStringValid(contract->representation_revision, sizeof(contract->representation_revision), true) ||
      contract->dimensions == 0u ||
      (contract->dtype != ATLAS_DTYPE_F32 && contract->dtype != ATLAS_DTYPE_F16 &&
       contract->dtype != ATLAS_DTYPE_BF16) ||
      (contract->normalization != ATLAS_NORMALIZATION_NONE &&
       contract->normalization != ATLAS_NORMALIZATION_L2) ||
      (contract->metric != ATLAS_METRIC_INNER_PRODUCT &&
       contract->metric != ATLAS_METRIC_COSINE &&
       contract->metric != ATLAS_METRIC_SQUARED_L2) ||
      !fixedStringValid(contract->model_id, sizeof(contract->model_id), false) ||
      !fixedStringValid(contract->model_sha256, sizeof(contract->model_sha256), false)) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  const bool hasModelId = contract->model_id[0] != '\0';
  const bool hasModelHash = contract->model_sha256[0] != '\0';
  if (hasModelId != hasModelHash || (hasModelHash && !sha256Valid(contract->model_sha256))) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  for (size_t index = 0; index < sizeof(contract->reserved) / sizeof(contract->reserved[0]); ++index) {
    if (contract->reserved[index] != 0u) {
      return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
          ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
    }
  }
  return setRepresentationResult(receipt, ATLAS_STATUS_OK, ATLAS_REPRESENTATION_REASON_NONE);
}

atlas_status_t compareRepresentations(
    const atlas_representation_contract_v1_t *query,
    const atlas_representation_contract_v1_t *index,
    atlas_representation_validation_receipt_v1_t *receipt) {
  atlas_status_t status = validateRepresentation(query, receipt);
  if (status != ATLAS_STATUS_OK) return status;
  status = validateRepresentation(index, receipt);
  if (status != ATLAS_STATUS_OK) return status;
  if (std::strcmp(query->representation_id, index->representation_id) != 0) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_ID_MISMATCH);
  }
  if (std::strcmp(query->representation_revision, index->representation_revision) != 0) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_REVISION_MISMATCH);
  }
  if (query->dimensions != index->dimensions) {
    return setRepresentationResult(receipt, ATLAS_STATUS_DIMENSION_MISMATCH,
        ATLAS_REPRESENTATION_REASON_DIMENSION_MISMATCH);
  }
  if (query->dtype != index->dtype) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_DTYPE_MISMATCH);
  }
  if (query->normalization != index->normalization) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_NORMALIZATION_MISMATCH);
  }
  if (query->metric != index->metric) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_METRIC_MISMATCH);
  }
  if (std::strcmp(query->model_id, index->model_id) != 0 ||
      std::strcmp(query->model_sha256, index->model_sha256) != 0) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_MODEL_MISMATCH);
  }
  return setRepresentationResult(receipt, ATLAS_STATUS_OK, ATLAS_REPRESENTATION_REASON_NONE);
}

bool executionReceiptValid(const atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr || !hasV1Size(receipt->struct_size, sizeof(*receipt)) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1 ||
      receipt->backend < ATLAS_BACKEND_CPU || receipt->backend > ATLAS_BACKEND_WEBGPU ||
      receipt->status < ATLAS_STATUS_OK || receipt->status > ATLAS_STATUS_INTERNAL_ERROR ||
      receipt->used_cpu_fallback > 1u) return false;
  for (size_t index = 0; index < sizeof(receipt->reserved); ++index) {
    if (receipt->reserved[index] != 0u) return false;
  }
  return true;
}

void appendString(std::vector<uint8_t> *out, const char *value) {
  const size_t length = std::strlen(value);
  if (length <= 31u) {
    out->push_back(static_cast<uint8_t>(0xa0u | length));
  } else if (length <= UINT8_MAX) {
    out->push_back(0xd9u);
    out->push_back(static_cast<uint8_t>(length));
  } else {
    out->push_back(0xdau);
    out->push_back(static_cast<uint8_t>((length >> 8u) & 0xffu));
    out->push_back(static_cast<uint8_t>(length & 0xffu));
  }
  out->insert(out->end(), value, value + length);
}

void appendUnsigned(std::vector<uint8_t> *out, uint64_t value) {
  if (value <= 0x7fu) {
    out->push_back(static_cast<uint8_t>(value));
  } else if (value <= UINT8_MAX) {
    out->push_back(0xccu);
    out->push_back(static_cast<uint8_t>(value));
  } else if (value <= UINT16_MAX) {
    out->push_back(0xcdu);
    out->push_back(static_cast<uint8_t>((value >> 8u) & 0xffu));
    out->push_back(static_cast<uint8_t>(value & 0xffu));
  } else if (value <= UINT32_MAX) {
    out->push_back(0xceu);
    for (int shift = 24; shift >= 0; shift -= 8) {
      out->push_back(static_cast<uint8_t>((value >> shift) & 0xffu));
    }
  } else {
    out->push_back(0xcfu);
    for (int shift = 56; shift >= 0; shift -= 8) {
      out->push_back(static_cast<uint8_t>((value >> shift) & 0xffu));
    }
  }
}

void appendBoolean(std::vector<uint8_t> *out, bool value) {
  out->push_back(value ? 0xc3u : 0xc2u);
}

bool readByte(const uint8_t *bytes, uint64_t length, uint64_t *offset, uint8_t *out) {
  if (*offset >= length) return false;
  *out = bytes[(*offset)++];
  return true;
}

bool readBigEndian(const uint8_t *bytes, uint64_t length, uint64_t *offset,
    size_t byteCount, uint64_t *out) {
  if (byteCount > 8u || *offset > length || byteCount > length - *offset) return false;
  uint64_t value = 0u;
  for (size_t index = 0; index < byteCount; ++index) {
    value = (value << 8u) | bytes[(*offset)++];
  }
  *out = value;
  return true;
}

bool readStringEquals(const uint8_t *bytes, uint64_t length, uint64_t *offset,
    const char *expected) {
  uint8_t marker = 0u;
  if (!readByte(bytes, length, offset, &marker)) return false;
  uint64_t stringLength = 0u;
  if ((marker & 0xe0u) == 0xa0u) {
    stringLength = marker & 0x1fu;
  } else if (marker == 0xd9u) {
    if (!readBigEndian(bytes, length, offset, 1u, &stringLength)) return false;
    if (stringLength <= 31u) return false;
  } else if (marker == 0xdau) {
    if (!readBigEndian(bytes, length, offset, 2u, &stringLength)) return false;
    if (stringLength <= UINT8_MAX) return false;
  } else {
    return false;
  }
  const size_t expectedLength = std::strlen(expected);
  if (stringLength != expectedLength || *offset > length || stringLength > length - *offset ||
      std::memcmp(bytes + *offset, expected, expectedLength) != 0) return false;
  *offset += stringLength;
  return true;
}

bool readUnsigned(const uint8_t *bytes, uint64_t length, uint64_t *offset, uint64_t *out) {
  uint8_t marker = 0u;
  if (!readByte(bytes, length, offset, &marker)) return false;
  if (marker <= 0x7fu) {
    *out = marker;
    return true;
  }
  size_t byteCount = 0u;
  switch (marker) {
    case 0xccu: byteCount = 1u; break;
    case 0xcdu: byteCount = 2u; break;
    case 0xceu: byteCount = 4u; break;
    case 0xcfu: byteCount = 8u; break;
    default: return false;
  }
  if (!readBigEndian(bytes, length, offset, byteCount, out)) return false;
  return (byteCount == 1u && *out > 0x7fu) ||
      (byteCount == 2u && *out > UINT8_MAX) ||
      (byteCount == 4u && *out > UINT16_MAX) ||
      (byteCount == 8u && *out > UINT32_MAX);
}

bool readBoolean(const uint8_t *bytes, uint64_t length, uint64_t *offset, bool *out) {
  uint8_t marker = 0u;
  if (!readByte(bytes, length, offset, &marker)) return false;
  if (marker == 0xc2u) {
    *out = false;
    return true;
  }
  if (marker == 0xc3u) {
    *out = true;
    return true;
  }
  return false;
}

bool readKey(const uint8_t *bytes, uint64_t length, uint64_t *offset, const char *key) {
  return readStringEquals(bytes, length, offset, key);
}

bool readKeyedUnsigned(const uint8_t *bytes, uint64_t length, uint64_t *offset,
    const char *key, uint64_t *value) {
  return readKey(bytes, length, offset, key) && readUnsigned(bytes, length, offset, value);
}
}  // namespace

struct atlas_context {
  atlas_context_options_t options;
};

extern "C" {

uint32_t atlas_get_abi_version(void) {
  return ATLAS_ABI_VERSION_1;
}

const char *atlas_status_string(atlas_status_t status) {
  switch (status) {
    case ATLAS_STATUS_OK: return "OK";
    case ATLAS_STATUS_INVALID_ARGUMENT: return "INVALID_ARGUMENT";
    case ATLAS_STATUS_DIMENSION_MISMATCH: return "DIMENSION_MISMATCH";
    case ATLAS_STATUS_QUEUE_FULL: return "QUEUE_FULL";
    case ATLAS_STATUS_CUDA_UNAVAILABLE: return "CUDA_UNAVAILABLE";
    case ATLAS_STATUS_CUDA_ERROR: return "CUDA_ERROR";
    case ATLAS_STATUS_OUT_OF_MEMORY: return "OUT_OF_MEMORY";
    case ATLAS_STATUS_NOT_IMPLEMENTED: return "NOT_IMPLEMENTED";
    case ATLAS_STATUS_INTERNAL_ERROR: return "INTERNAL_ERROR";
    default: return "UNKNOWN_STATUS";
  }
}

atlas_status_t atlas_context_options_init(atlas_context_options_t *options) {
  if (options == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(options, 0, sizeof(*options));
  options->struct_size = static_cast<uint32_t>(sizeof(*options));
  options->abi_version = ATLAS_ABI_VERSION_1;
  options->cuda_device = ATLAS_CUDA_DEVICE_DEFAULT;
  options->stream_count = 1u;
  options->queue_capacity = 64u;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_execution_receipt_init(atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  if (!hasV1Size(receipt->struct_size, sizeof(*receipt)) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  const uint32_t size = receipt->struct_size;
  std::memset(receipt, 0, sizeof(*receipt));
  receipt->struct_size = size;
  receipt->abi_version = ATLAS_ABI_VERSION_1;
  receipt->backend = ATLAS_BACKEND_CPU;
  receipt->status = ATLAS_STATUS_OK;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_context_create(
    const atlas_context_options_t *options,
    atlas_context_t **out_context) {
  if (out_context == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  *out_context = nullptr;
  if (options == nullptr ||
      !hasV1Size(options->struct_size, sizeof(*options)) ||
      options->abi_version != ATLAS_ABI_VERSION_1 ||
      options->cuda_device < ATLAS_CUDA_DEVICE_DEFAULT ||
      options->stream_count == 0u || options->queue_capacity == 0u ||
      options->flags != 0u) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  atlas_context *context = new (std::nothrow) atlas_context{};
  if (context == nullptr) return ATLAS_STATUS_OUT_OF_MEMORY;
  context->options = *options;
  *out_context = context;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_context_destroy(atlas_context_t **context) {
  if (context == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  delete *context;
  *context = nullptr;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_context_get_options_v1(
    const atlas_context_t *context,
    atlas_context_options_t *out_options) {
  if (context == nullptr || out_options == nullptr ||
      !hasV1Size(out_options->struct_size, sizeof(*out_options)) ||
      out_options->abi_version != ATLAS_ABI_VERSION_1) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  const uint32_t callerSize = out_options->struct_size;
  *out_options = context->options;
  out_options->struct_size = callerSize;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_buffer_init(atlas_buffer_t *buffer) {
  if (buffer == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(buffer, 0, sizeof(*buffer));
  buffer->struct_size = static_cast<uint32_t>(sizeof(*buffer));
  buffer->abi_version = ATLAS_ABI_VERSION_1;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_buffer_allocate(uint64_t byte_length, atlas_buffer_t *out_buffer) {
  if (out_buffer == nullptr ||
      !hasV1Size(out_buffer->struct_size, sizeof(*out_buffer)) ||
      out_buffer->abi_version != ATLAS_ABI_VERSION_1 ||
      out_buffer->data != nullptr || out_buffer->capacity != 0u) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  if (byte_length > static_cast<uint64_t>(std::numeric_limits<size_t>::max())) {
    return ATLAS_STATUS_OUT_OF_MEMORY;
  }
  void *data = byte_length == 0u ? nullptr : std::malloc(static_cast<size_t>(byte_length));
  if (byte_length != 0u && data == nullptr) return ATLAS_STATUS_OUT_OF_MEMORY;

  out_buffer->data = data;
  out_buffer->byte_length = byte_length;
  out_buffer->capacity = byte_length;
  out_buffer->allocator_id = kAllocatorId;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_buffer_release(atlas_buffer_t *buffer) {
  if (buffer == nullptr ||
      !hasV1Size(buffer->struct_size, sizeof(*buffer)) ||
      buffer->abi_version != ATLAS_ABI_VERSION_1) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  if (buffer->data != nullptr && buffer->allocator_id != kAllocatorId) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  if (buffer->allocator_id == kAllocatorId) std::free(buffer->data);
  return atlas_buffer_init(buffer);
}

atlas_status_t atlas_receipt_encode_msgpack_v1(
    const atlas_execution_receipt_t *receipt,
    atlas_buffer_t *out_msgpack) {
  if (!executionReceiptValid(receipt) || out_msgpack == nullptr ||
      !hasV1Size(out_msgpack->struct_size, sizeof(*out_msgpack)) ||
      out_msgpack->abi_version != ATLAS_ABI_VERSION_1 || out_msgpack->data != nullptr ||
      out_msgpack->capacity != 0u || out_msgpack->byte_length != 0u) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  try {
    std::vector<uint8_t> encoded;
    encoded.reserve(256u);
    encoded.push_back(0x8au);  // canonical fixmap with ten ordered fields
    appendString(&encoded, "schema");
    appendString(&encoded, "atlas.execution-receipt.v1");
    appendString(&encoded, "abi_version");
    appendUnsigned(&encoded, ATLAS_ABI_VERSION_1);
    appendString(&encoded, "operation_id");
    appendUnsigned(&encoded, receipt->operation_id);
    appendString(&encoded, "backend");
    appendUnsigned(&encoded, static_cast<uint64_t>(receipt->backend));
    appendString(&encoded, "status");
    appendUnsigned(&encoded, static_cast<uint64_t>(receipt->status));
    appendString(&encoded, "queue_wait_ns");
    appendUnsigned(&encoded, receipt->queue_wait_ns);
    appendString(&encoded, "execution_ns");
    appendUnsigned(&encoded, receipt->execution_ns);
    appendString(&encoded, "host_to_device_bytes");
    appendUnsigned(&encoded, receipt->host_to_device_bytes);
    appendString(&encoded, "device_to_host_bytes");
    appendUnsigned(&encoded, receipt->device_to_host_bytes);
    appendString(&encoded, "used_cpu_fallback");
    appendBoolean(&encoded, receipt->used_cpu_fallback != 0u);

    atlas_status_t status = atlas_buffer_allocate(static_cast<uint64_t>(encoded.size()), out_msgpack);
    if (status != ATLAS_STATUS_OK) return status;
    std::memcpy(out_msgpack->data, encoded.data(), encoded.size());
    return ATLAS_STATUS_OK;
  } catch (const std::bad_alloc &) {
    return ATLAS_STATUS_OUT_OF_MEMORY;
  } catch (...) {
    return ATLAS_STATUS_INTERNAL_ERROR;
  }
}

atlas_status_t atlas_receipt_decode_msgpack_v1(
    const atlas_buffer_t *msgpack,
    atlas_execution_receipt_t *out_receipt) {
  if (msgpack == nullptr || out_receipt == nullptr ||
      !hasV1Size(msgpack->struct_size, sizeof(*msgpack)) ||
      msgpack->abi_version != ATLAS_ABI_VERSION_1 || msgpack->data == nullptr ||
      msgpack->byte_length == 0u || msgpack->byte_length > msgpack->capacity ||
      !hasV1Size(out_receipt->struct_size, sizeof(*out_receipt)) ||
      out_receipt->abi_version != ATLAS_ABI_VERSION_1) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  const auto *bytes = static_cast<const uint8_t *>(msgpack->data);
  const uint64_t length = msgpack->byte_length;
  uint64_t offset = 0u;
  uint8_t mapMarker = 0u;
  uint64_t abiVersion = 0u;
  uint64_t operationId = 0u;
  uint64_t backend = 0u;
  uint64_t receiptStatus = 0u;
  uint64_t queueWaitNs = 0u;
  uint64_t executionNs = 0u;
  uint64_t hostToDeviceBytes = 0u;
  uint64_t deviceToHostBytes = 0u;
  bool usedCpuFallback = false;
  if (!readByte(bytes, length, &offset, &mapMarker) || mapMarker != 0x8au ||
      !readKey(bytes, length, &offset, "schema") ||
      !readStringEquals(bytes, length, &offset, "atlas.execution-receipt.v1") ||
      !readKeyedUnsigned(bytes, length, &offset, "abi_version", &abiVersion) ||
      abiVersion != ATLAS_ABI_VERSION_1 ||
      !readKeyedUnsigned(bytes, length, &offset, "operation_id", &operationId) ||
      !readKeyedUnsigned(bytes, length, &offset, "backend", &backend) ||
      !readKeyedUnsigned(bytes, length, &offset, "status", &receiptStatus) ||
      !readKeyedUnsigned(bytes, length, &offset, "queue_wait_ns", &queueWaitNs) ||
      !readKeyedUnsigned(bytes, length, &offset, "execution_ns", &executionNs) ||
      !readKeyedUnsigned(bytes, length, &offset, "host_to_device_bytes", &hostToDeviceBytes) ||
      !readKeyedUnsigned(bytes, length, &offset, "device_to_host_bytes", &deviceToHostBytes) ||
      !readKey(bytes, length, &offset, "used_cpu_fallback") ||
      !readBoolean(bytes, length, &offset, &usedCpuFallback) ||
      offset != length || backend > ATLAS_BACKEND_WEBGPU ||
      receiptStatus > ATLAS_STATUS_INTERNAL_ERROR) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }

  atlas_execution_receipt_t decoded{};
  decoded.struct_size = static_cast<uint32_t>(sizeof(decoded));
  decoded.abi_version = ATLAS_ABI_VERSION_1;
  decoded.operation_id = operationId;
  decoded.backend = static_cast<atlas_backend_t>(backend);
  decoded.status = static_cast<atlas_status_t>(receiptStatus);
  decoded.queue_wait_ns = queueWaitNs;
  decoded.execution_ns = executionNs;
  decoded.host_to_device_bytes = hostToDeviceBytes;
  decoded.device_to_host_bytes = deviceToHostBytes;
  decoded.used_cpu_fallback = usedCpuFallback ? 1u : 0u;
  std::memcpy(out_receipt, &decoded, sizeof(decoded));
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_representation_contract_init_v1(
    atlas_representation_contract_v1_t *contract) {
  if (contract == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(contract, 0, sizeof(*contract));
  contract->struct_size = static_cast<uint32_t>(sizeof(*contract));
  contract->abi_version = ATLAS_ABI_VERSION_1;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_index_build_request_init_v1(atlas_index_build_request_v1_t *request) {
  if (request == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(request, 0, sizeof(*request));
  request->struct_size = static_cast<uint32_t>(sizeof(*request));
  request->abi_version = ATLAS_ABI_VERSION_1;
  return atlas_representation_contract_init_v1(&request->representation);
}

atlas_status_t atlas_compute_request_init_v1(atlas_compute_request_v1_t *request) {
  if (request == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(request, 0, sizeof(*request));
  request->struct_size = static_cast<uint32_t>(sizeof(*request));
  request->abi_version = ATLAS_ABI_VERSION_1;
  atlas_status_t status = atlas_representation_contract_init_v1(&request->query_representation);
  if (status != ATLAS_STATUS_OK) return status;
  return atlas_representation_contract_init_v1(&request->index_representation);
}

atlas_status_t atlas_representation_validation_receipt_init_v1(
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (receipt == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(receipt, 0, sizeof(*receipt));
  receipt->struct_size = static_cast<uint32_t>(sizeof(*receipt));
  receipt->abi_version = ATLAS_ABI_VERSION_1;
  receipt->status = ATLAS_STATUS_OK;
  receipt->reason = ATLAS_REPRESENTATION_REASON_NONE;
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_index_build_request_validate_v1(
    const atlas_index_build_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (receipt == nullptr ||
      !hasV1Size(receipt->struct_size, sizeof(*receipt)) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  if (request == nullptr ||
      !hasV1Size(request->struct_size, sizeof(*request)) ||
      request->abi_version != ATLAS_ABI_VERSION_1 || request->row_count == 0u) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  return validateRepresentation(&request->representation, receipt);
}

atlas_status_t atlas_compute_request_validate_v1(
    const atlas_compute_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (receipt == nullptr ||
      !hasV1Size(receipt->struct_size, sizeof(*receipt)) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  if (request == nullptr ||
      !hasV1Size(request->struct_size, sizeof(*request)) ||
      request->abi_version != ATLAS_ABI_VERSION_1) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  return compareRepresentations(&request->query_representation,
      &request->index_representation, receipt);
}

atlas_status_t atlas_similarity_graph_request_init_v1(
    atlas_similarity_graph_request_v1_t *request) {
  if (request == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(request, 0, sizeof(*request));
  request->struct_size = static_cast<uint32_t>(sizeof(*request));
  request->abi_version = ATLAS_ABI_VERSION_1;
  return atlas_representation_contract_init_v1(&request->representation);
}

atlas_status_t atlas_similarity_graph_request_validate_v1(
    const atlas_similarity_graph_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (receipt == nullptr ||
      !hasV1Size(receipt->struct_size, sizeof(*receipt)) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  if (request == nullptr ||
      !hasV1Size(request->struct_size, sizeof(*request)) ||
      request->abi_version != ATLAS_ABI_VERSION_1 ||
      request->row_count == 0u || request->row_count > UINT32_MAX ||
      request->dimension == 0u || request->row_major_values == nullptr ||
      !std::isfinite(request->threshold) || request->threshold < 0.0f ||
      request->threshold > 1.0f || request->max_neighbors_per_row > request->row_count - 1u ||
      request->reserved0 != 0u) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  for (uint32_t value : request->reserved) {
    if (value != 0u) return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  if (request->row_count > UINT64_MAX / request->dimension ||
      request->row_count * request->dimension > UINT64_MAX / sizeof(float)) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  const uint64_t elementCount = request->row_count * request->dimension;
  if (elementCount > static_cast<uint64_t>(std::numeric_limits<int64_t>::max()) ||
      elementCount > static_cast<uint64_t>(std::numeric_limits<size_t>::max() / sizeof(float))) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  const uint64_t expectedBytes = elementCount * sizeof(float);
  if (request->input_byte_length != expectedBytes) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }

  atlas_status_t status = validateRepresentation(&request->representation, receipt);
  if (status != ATLAS_STATUS_OK) return status;
  if (request->representation.dimensions != request->dimension) {
    return setRepresentationResult(receipt, ATLAS_STATUS_DIMENSION_MISMATCH,
        ATLAS_REPRESENTATION_REASON_DIMENSION_MISMATCH);
  }
  if (request->representation.dtype != ATLAS_DTYPE_F32) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_DTYPE_MISMATCH);
  }
  if (request->representation.metric != ATLAS_METRIC_COSINE) {
    return setRepresentationResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_METRIC_MISMATCH);
  }
  return setRepresentationResult(receipt, ATLAS_STATUS_OK, ATLAS_REPRESENTATION_REASON_NONE);
}

atlas_status_t atlas_csr_graph_init_v1(atlas_csr_graph_v1_t *graph) {
  if (graph == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(graph, 0, sizeof(*graph));
  graph->struct_size = static_cast<uint32_t>(sizeof(*graph));
  graph->abi_version = ATLAS_ABI_VERSION_1;
  atlas_buffer_init(&graph->row_offsets);
  atlas_buffer_init(&graph->column_indices);
  atlas_buffer_init(&graph->edge_weights);
  return ATLAS_STATUS_OK;
}

atlas_status_t atlas_csr_graph_release_v1(atlas_csr_graph_v1_t *graph) {
  if (graph == nullptr ||
      !hasV1Size(graph->struct_size, sizeof(*graph)) ||
      graph->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  atlas_status_t status = atlas_buffer_release(&graph->row_offsets);
  if (status != ATLAS_STATUS_OK) return status;
  status = atlas_buffer_release(&graph->column_indices);
  if (status != ATLAS_STATUS_OK) return status;
  status = atlas_buffer_release(&graph->edge_weights);
  if (status != ATLAS_STATUS_OK) return status;
  graph->row_count = 0u;
  graph->edge_count = 0u;
  return ATLAS_STATUS_OK;
}

}  // extern "C"
