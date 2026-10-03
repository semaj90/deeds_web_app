#include "atlas_core.h"

namespace {
bool emptyBuffer(const atlas_buffer_t &buffer) {
  return buffer.struct_size >= sizeof(atlas_buffer_t) &&
      buffer.abi_version == ATLAS_ABI_VERSION_1 && buffer.data == nullptr &&
      buffer.byte_length == 0u && buffer.capacity == 0u && buffer.allocator_id == 0u &&
      buffer.reserved == 0u;
}

bool emptyResult(const atlas_knn_exact_result_v1_t *result) {
  return result != nullptr && result->struct_size >= sizeof(*result) &&
      result->abi_version == ATLAS_ABI_VERSION_1 && result->query_count == 0u &&
      result->top_k == 0u && result->reserved0 == 0u &&
      emptyBuffer(result->corpus_row_indices) && emptyBuffer(result->distances);
}
}  // namespace

extern "C" atlas_status_t atlas_knn_exact(
    const atlas_context_t *context,
    const atlas_knn_exact_request_v1_t *request,
    atlas_knn_exact_result_v1_t *out_result,
    atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr || receipt->struct_size < sizeof(*receipt) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  atlas_execution_receipt_init(receipt);
  if (context == nullptr || !emptyResult(out_result)) {
    receipt->status = ATLAS_STATUS_INVALID_ARGUMENT;
    return receipt->status;
  }

  atlas_representation_validation_receipt_v1_t validation{};
  atlas_representation_validation_receipt_init_v1(&validation);
  const atlas_status_t validationStatus =
      atlas_knn_exact_request_validate_v1(request, &validation);
  if (validationStatus != ATLAS_STATUS_OK) {
    receipt->status = validationStatus;
    return validationStatus;
  }

  receipt->status = ATLAS_STATUS_NOT_IMPLEMENTED;
  return receipt->status;
}
