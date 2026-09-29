#include "atlas_core.h"

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <limits>

namespace {
atlas_status_t setResult(
    atlas_representation_validation_receipt_v1_t *receipt,
    atlas_status_t status,
    atlas_representation_reason_t reason) {
  receipt->status = status;
  receipt->reason = reason;
  return status;
}

bool productBytesFit(uint64_t rows, uint64_t columns, uint64_t *bytes) {
  if (columns != 0u && rows > UINT64_MAX / columns) return false;
  const uint64_t elements = rows * columns;
  if (elements > UINT64_MAX / sizeof(float)) return false;
  const uint64_t byteCount = elements * sizeof(float);
  if (byteCount > static_cast<uint64_t>(std::numeric_limits<size_t>::max())) return false;
  *bytes = byteCount;
  return true;
}
}  // namespace

extern "C" atlas_status_t atlas_knn_exact_request_init_v1(
    atlas_knn_exact_request_v1_t *request) {
  if (request == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(request, 0, sizeof(*request));
  request->struct_size = static_cast<uint32_t>(sizeof(*request));
  request->abi_version = ATLAS_ABI_VERSION_1;
  atlas_status_t status =
      atlas_representation_contract_init_v1(&request->query_representation);
  if (status != ATLAS_STATUS_OK) return status;
  return atlas_representation_contract_init_v1(&request->corpus_representation);
}

extern "C" atlas_status_t atlas_knn_exact_request_validate_v1(
    const atlas_knn_exact_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt) {
  if (receipt == nullptr || receipt->struct_size < sizeof(*receipt) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  if (request == nullptr || request->struct_size < sizeof(*request) ||
      request->abi_version != ATLAS_ABI_VERSION_1 || request->query_count == 0u ||
      request->corpus_count == 0u || request->top_k == 0u ||
      request->top_k > request->corpus_count || request->query_row_major_f32 == nullptr ||
      request->corpus_row_major_f32 == nullptr || request->reserved0 != 0u) {
    return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  for (uint32_t value : request->reserved) {
    if (value != 0u) return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }

  uint64_t expectedQueryBytes = 0u;
  uint64_t expectedCorpusBytes = 0u;
  if (!productBytesFit(request->query_count, request->query_representation.dimensions,
          &expectedQueryBytes) ||
      !productBytesFit(request->corpus_count, request->corpus_representation.dimensions,
          &expectedCorpusBytes)) {
    return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  if (request->query_byte_length != expectedQueryBytes ||
      request->corpus_byte_length != expectedCorpusBytes) {
    return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }

  atlas_compute_request_v1_t representations{};
  representations.struct_size = static_cast<uint32_t>(sizeof(representations));
  representations.abi_version = ATLAS_ABI_VERSION_1;
  representations.query_representation = request->query_representation;
  representations.index_representation = request->corpus_representation;
  atlas_status_t status = atlas_compute_request_validate_v1(&representations, receipt);
  if (status != ATLAS_STATUS_OK) return status;
  if (request->query_representation.dtype != ATLAS_DTYPE_F32) {
    return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_DTYPE_MISMATCH);
  }

  uint64_t outputBytes = 0u;
  if (!productBytesFit(request->query_count, request->top_k, &outputBytes)) {
    return setResult(receipt, ATLAS_STATUS_INVALID_ARGUMENT,
        ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);
  }
  (void)outputBytes;
  return setResult(receipt, ATLAS_STATUS_OK, ATLAS_REPRESENTATION_REASON_NONE);
}

extern "C" atlas_status_t atlas_knn_exact_result_init_v1(
    atlas_knn_exact_result_v1_t *result) {
  if (result == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(result, 0, sizeof(*result));
  result->struct_size = static_cast<uint32_t>(sizeof(*result));
  result->abi_version = ATLAS_ABI_VERSION_1;
  atlas_buffer_init(&result->corpus_row_indices);
  return atlas_buffer_init(&result->distances);
}

extern "C" atlas_status_t atlas_knn_exact_result_release_v1(
    atlas_knn_exact_result_v1_t *result) {
  if (result == nullptr || result->struct_size < sizeof(*result) ||
      result->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  atlas_status_t status = atlas_buffer_release(&result->corpus_row_indices);
  if (status != ATLAS_STATUS_OK) return status;
  status = atlas_buffer_release(&result->distances);
  if (status != ATLAS_STATUS_OK) return status;
  result->query_count = 0u;
  result->top_k = 0u;
  result->reserved0 = 0u;
  return ATLAS_STATUS_OK;
}
