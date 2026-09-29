#include "atlas_core.h"

namespace {
bool validBuffer(const atlas_buffer_t &buffer) {
  return buffer.struct_size >= sizeof(atlas_buffer_t) &&
      buffer.abi_version == ATLAS_ABI_VERSION_1 && buffer.data == nullptr &&
      buffer.byte_length == 0u && buffer.capacity == 0u && buffer.allocator_id == 0u &&
      buffer.reserved == 0u;
}
}  // namespace

extern "C" atlas_status_t atlas_similarity_graph_build(
    const atlas_context_t *context,
    const atlas_similarity_graph_request_v1_t *request,
    atlas_csr_graph_v1_t *out_graph,
    atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr || receipt->struct_size < sizeof(*receipt) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  atlas_execution_receipt_init(receipt);
  if (context == nullptr || out_graph == nullptr ||
      out_graph->struct_size < sizeof(*out_graph) ||
      out_graph->abi_version != ATLAS_ABI_VERSION_1 || out_graph->row_count != 0u ||
      out_graph->edge_count != 0u || !validBuffer(out_graph->row_offsets) ||
      !validBuffer(out_graph->column_indices) || !validBuffer(out_graph->edge_weights)) {
    receipt->status = ATLAS_STATUS_INVALID_ARGUMENT;
    return receipt->status;
  }
  atlas_representation_validation_receipt_v1_t validation{};
  atlas_representation_validation_receipt_init_v1(&validation);
  const atlas_status_t validationStatus =
      atlas_similarity_graph_request_validate_v1(request, &validation);
  if (validationStatus != ATLAS_STATUS_OK) {
    receipt->status = validationStatus;
    return validationStatus;
  }
  receipt->status = ATLAS_STATUS_NOT_IMPLEMENTED;
  return receipt->status;
}
