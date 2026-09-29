#include "atlas_core.h"

#include <assert.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Keep test expressions active in Release: several assertions invoke the C ABI. */
#ifdef NDEBUG
#  undef assert
#  define assert(condition) ((condition) ? (void)0 : abort())
#endif

static void set_representation(atlas_representation_contract_v1_t *contract) {
  assert(atlas_representation_contract_init_v1(contract) == ATLAS_STATUS_OK);
  strcpy(contract->representation_id, "semantic_768");
  strcpy(contract->representation_revision, "repr:embeddinggemma-r1");
  contract->dimensions = 768u;
  contract->dtype = ATLAS_DTYPE_F32;
  contract->normalization = ATLAS_NORMALIZATION_L2;
  contract->metric = ATLAS_METRIC_COSINE;
  strcpy(contract->model_id, "embeddinggemma-300m");
  strcpy(contract->model_sha256,
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
}

int main(int argc, char **argv) {
  atlas_context_options_t options;
  assert(atlas_context_options_init(&options) == ATLAS_STATUS_OK);
  assert(options.abi_version == ATLAS_ABI_VERSION_1);
  assert(options.cuda_device == ATLAS_CUDA_DEVICE_DEFAULT);

  atlas_context_t *context = 0;
  assert(atlas_context_create(&options, &context) == ATLAS_STATUS_OK);
  assert(context != 0);
  assert(atlas_context_destroy(&context) == ATLAS_STATUS_OK);
  assert(context == 0);
  assert(atlas_context_destroy(&context) == ATLAS_STATUS_OK);

  atlas_execution_receipt_t receipt;
  memset(&receipt, 0, sizeof(receipt));
  receipt.struct_size = (uint32_t)sizeof(receipt);
  receipt.abi_version = ATLAS_ABI_VERSION_1;
  assert(atlas_execution_receipt_init(&receipt) == ATLAS_STATUS_OK);
  assert(receipt.operation_id == 0u);
  assert(receipt.backend == ATLAS_BACKEND_CPU);
  assert(receipt.status == ATLAS_STATUS_OK);

  receipt.operation_id = UINT64_MAX;
  receipt.backend = ATLAS_BACKEND_CUVS_CAGRA;
  receipt.status = ATLAS_STATUS_CUDA_ERROR;
  receipt.queue_wait_ns = UINT64_C(70000);
  receipt.execution_ns = UINT64_C(5000000000);
  receipt.host_to_device_bytes = UINT64_C(4294967296);
  receipt.device_to_host_bytes = UINT64_C(123456789);
  receipt.used_cpu_fallback = 1u;
  atlas_buffer_t receipt_msgpack = {0};
  assert(atlas_buffer_init(&receipt_msgpack) == ATLAS_STATUS_OK);
  assert(atlas_receipt_encode_msgpack_v1(&receipt, &receipt_msgpack) == ATLAS_STATUS_OK);
  assert(receipt_msgpack.data != 0 && receipt_msgpack.byte_length > 0u);
  assert(((const uint8_t *)receipt_msgpack.data)[0] == 0x8au);
  if (argc == 2 && strcmp(argv[1], "--emit-msgpack-hex") == 0) {
    const uint8_t *encoded = (const uint8_t *)receipt_msgpack.data;
    for (uint64_t index = 0; index < receipt_msgpack.byte_length; ++index) {
      printf("%02x", encoded[index]);
    }
    return 0;
  }

  atlas_execution_receipt_t decoded_receipt;
  memset(&decoded_receipt, 0, sizeof(decoded_receipt));
  decoded_receipt.struct_size = (uint32_t)sizeof(decoded_receipt);
  decoded_receipt.abi_version = ATLAS_ABI_VERSION_1;
  assert(atlas_receipt_decode_msgpack_v1(&receipt_msgpack, &decoded_receipt) == ATLAS_STATUS_OK);
  assert(decoded_receipt.operation_id == receipt.operation_id);
  assert(decoded_receipt.backend == receipt.backend && decoded_receipt.status == receipt.status);
  assert(decoded_receipt.queue_wait_ns == receipt.queue_wait_ns);
  assert(decoded_receipt.execution_ns == receipt.execution_ns);
  assert(decoded_receipt.host_to_device_bytes == receipt.host_to_device_bytes);
  assert(decoded_receipt.device_to_host_bytes == receipt.device_to_host_bytes);
  assert(decoded_receipt.used_cpu_fallback == receipt.used_cpu_fallback);

  decoded_receipt.operation_id = 99u;
  ((uint8_t *)receipt_msgpack.data)[0] = 0x81u;  // wrong map arity
  assert(atlas_receipt_decode_msgpack_v1(&receipt_msgpack, &decoded_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(decoded_receipt.operation_id == 99u);  // malformed input must not partially mutate output
  ((uint8_t *)receipt_msgpack.data)[0] = 0x8au;
  assert(atlas_buffer_release(&receipt_msgpack) == ATLAS_STATUS_OK);

  atlas_buffer_t invalid_receipt_msgpack = {0};
  assert(atlas_buffer_init(&invalid_receipt_msgpack) == ATLAS_STATUS_OK);
  receipt.reserved[0] = 1u;
  assert(atlas_receipt_encode_msgpack_v1(&receipt, &invalid_receipt_msgpack) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(invalid_receipt_msgpack.data == 0);
  receipt.reserved[0] = 0u;

  atlas_buffer_t buffer = {0};
  assert(atlas_buffer_init(&buffer) == ATLAS_STATUS_OK);
  assert(atlas_buffer_allocate(32u, &buffer) == ATLAS_STATUS_OK);
  assert(buffer.data != 0 && buffer.byte_length == 32u);
  memset(buffer.data, 0x5a, (size_t)buffer.byte_length);
  assert(atlas_buffer_release(&buffer) == ATLAS_STATUS_OK);
  assert(buffer.data == 0 && buffer.byte_length == 0u);
  assert(atlas_buffer_release(&buffer) == ATLAS_STATUS_OK);

  options.abi_version = ATLAS_ABI_VERSION_1 + 1u;
  assert(atlas_context_create(&options, &context) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(context == 0);
  assert(strcmp(atlas_status_string(ATLAS_STATUS_NOT_IMPLEMENTED), "NOT_IMPLEMENTED") == 0);

  atlas_index_build_request_v1_t build_request;
  atlas_compute_request_v1_t compute_request;
  atlas_representation_validation_receipt_v1_t validation_receipt;
  assert(atlas_index_build_request_init_v1(&build_request) == ATLAS_STATUS_OK);
  build_request.row_count = 4u;
  set_representation(&build_request.representation);
  assert(atlas_representation_validation_receipt_init_v1(&validation_receipt) == ATLAS_STATUS_OK);
  assert(atlas_index_build_request_validate_v1(&build_request, &validation_receipt) == ATLAS_STATUS_OK);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_NONE);

  assert(atlas_compute_request_init_v1(&compute_request) == ATLAS_STATUS_OK);
  set_representation(&compute_request.query_representation);
  set_representation(&compute_request.index_representation);
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_OK);
  compute_request.query_representation.dimensions = 512u;
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_DIMENSION_MISMATCH);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_DIMENSION_MISMATCH);
  compute_request.query_representation.dimensions = 768u;
  strcpy(compute_request.query_representation.representation_revision, "repr:other");
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_REVISION_MISMATCH);
  set_representation(&compute_request.query_representation);
  strcpy(compute_request.query_representation.representation_id, "latent_64");
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_ID_MISMATCH);
  set_representation(&compute_request.query_representation);
  compute_request.query_representation.dtype = ATLAS_DTYPE_F16;
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_DTYPE_MISMATCH);
  set_representation(&compute_request.query_representation);
  compute_request.query_representation.normalization = ATLAS_NORMALIZATION_NONE;
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_NORMALIZATION_MISMATCH);
  set_representation(&compute_request.query_representation);
  compute_request.query_representation.metric = ATLAS_METRIC_INNER_PRODUCT;
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_METRIC_MISMATCH);
  set_representation(&compute_request.query_representation);
  strcpy(compute_request.query_representation.model_id, "other-model");
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_MODEL_MISMATCH);
  set_representation(&compute_request.query_representation);
  strcpy(compute_request.query_representation.model_sha256,
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_MODEL_MISMATCH);
  compute_request.query_representation.model_id[0] = '\0';
  assert(atlas_compute_request_validate_v1(&compute_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);

  build_request.row_count = 0u;
  assert(atlas_index_build_request_validate_v1(&build_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
  assert(validation_receipt.reason == ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT);

  {
    const float vectors[] = {1.0f, 0.0f, 0.8f, 0.6f, 0.0f, 1.0f, 0.8f, -0.6f};
    atlas_similarity_graph_request_v1_t graph_request;
    atlas_csr_graph_v1_t graph;
    atlas_execution_receipt_t graph_receipt;
    assert(atlas_similarity_graph_request_init_v1(&graph_request) == ATLAS_STATUS_OK);
    graph_request.row_count = 4u;
    graph_request.dimension = 2u;
    graph_request.max_neighbors_per_row = 1u;
    graph_request.threshold = 0.5f;
    graph_request.row_major_values = vectors;
    graph_request.input_byte_length = sizeof(vectors);
    set_representation(&graph_request.representation);
    graph_request.representation.dimensions = 2u;
    assert(atlas_representation_validation_receipt_init_v1(&validation_receipt) == ATLAS_STATUS_OK);
    assert(atlas_similarity_graph_request_validate_v1(&graph_request, &validation_receipt) == ATLAS_STATUS_OK);

    graph_request.threshold = 1.1f;
    assert(atlas_similarity_graph_request_validate_v1(&graph_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
    graph_request.threshold = 0.5f;
    graph_request.input_byte_length -= sizeof(float);
    assert(atlas_similarity_graph_request_validate_v1(&graph_request, &validation_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
    graph_request.input_byte_length = sizeof(vectors);
    graph_request.representation.dimensions = 768u;
    assert(atlas_similarity_graph_request_validate_v1(&graph_request, &validation_receipt) == ATLAS_STATUS_DIMENSION_MISMATCH);
    graph_request.representation.dimensions = 2u;

    assert(atlas_csr_graph_init_v1(&graph) == ATLAS_STATUS_OK);
    memset(&graph_receipt, 0, sizeof(graph_receipt));
    graph_receipt.struct_size = (uint32_t)sizeof(graph_receipt);
    graph_receipt.abi_version = ATLAS_ABI_VERSION_1;
    assert(atlas_execution_receipt_init(&graph_receipt) == ATLAS_STATUS_OK);
    assert(atlas_context_options_init(&options) == ATLAS_STATUS_OK);
    assert(atlas_context_create(&options, &context) == ATLAS_STATUS_OK);
#if ATLAS_GRAPH_BACKEND_AVAILABLE
    assert(atlas_similarity_graph_build(context, &graph_request, &graph, &graph_receipt) == ATLAS_STATUS_OK);
    assert(graph_receipt.status == ATLAS_STATUS_OK);
    assert(graph.row_count == 4u && graph.edge_count == 4u);
    assert(((const uint64_t *)graph.row_offsets.data)[0] == 0u);
    assert(((const uint64_t *)graph.row_offsets.data)[1] == 1u);
    assert(((const uint64_t *)graph.row_offsets.data)[2] == 2u);
    assert(((const uint64_t *)graph.row_offsets.data)[3] == 3u);
    assert(((const uint64_t *)graph.row_offsets.data)[4] == 4u);
    /* Equal 0.8 scores from row 0 resolve to the smaller ordinal. */
    assert(((const uint32_t *)graph.column_indices.data)[0] == 1u);
    assert(((const uint32_t *)graph.column_indices.data)[1] == 0u);
    assert(((const uint32_t *)graph.column_indices.data)[2] == 1u);
    assert(((const uint32_t *)graph.column_indices.data)[3] == 0u);
    assert(((const float *)graph.edge_weights.data)[0] > 0.79f);
    assert(atlas_csr_graph_release_v1(&graph) == ATLAS_STATUS_OK);

    assert(atlas_csr_graph_init_v1(&graph) == ATLAS_STATUS_OK);
    graph_request.max_neighbors_per_row = 0u;
    assert(atlas_similarity_graph_build(context, &graph_request, &graph, &graph_receipt) == ATLAS_STATUS_OK);
    assert(graph.row_count == 4u && graph.edge_count == 0u);
    assert(((const uint64_t *)graph.row_offsets.data)[4] == 0u);
    assert(atlas_csr_graph_release_v1(&graph) == ATLAS_STATUS_OK);

    {
      float invalidVectors[8] = {0.0f};
      graph_request.max_neighbors_per_row = 1u;
      graph_request.row_major_values = invalidVectors;
      assert(atlas_csr_graph_init_v1(&graph) == ATLAS_STATUS_OK);
      assert(atlas_similarity_graph_build(context, &graph_request, &graph, &graph_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
      assert(graph.row_count == 0u && graph.row_offsets.data == 0);
      invalidVectors[0] = 1.0f;
      invalidVectors[1] = 0.0f;
      invalidVectors[2] = 1.0f;
      invalidVectors[3] = 0.0f;
      invalidVectors[4] = 1.0f;
      invalidVectors[5] = 0.0f;
      invalidVectors[6] = 1.0f;
      invalidVectors[7] = 0.0f;
      invalidVectors[3] = (float)NAN;
      assert(atlas_similarity_graph_build(context, &graph_request, &graph, &graph_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
      assert(graph.row_count == 0u && graph.row_offsets.data == 0);
      assert(atlas_csr_graph_release_v1(&graph) == ATLAS_STATUS_OK);
    }
#else
    assert(atlas_similarity_graph_build(context, &graph_request, &graph, &graph_receipt) == ATLAS_STATUS_NOT_IMPLEMENTED);
    assert(graph_receipt.status == ATLAS_STATUS_NOT_IMPLEMENTED);
    assert(graph.row_count == 0u && graph.edge_count == 0u);
    assert(graph.row_offsets.data == 0 && graph.column_indices.data == 0 && graph.edge_weights.data == 0);
#endif
    assert(atlas_context_destroy(&context) == ATLAS_STATUS_OK);
    assert(atlas_csr_graph_release_v1(&graph) == ATLAS_STATUS_OK);
  }

  {
    uint64_t offsets[] = {0u, 1u, 2u, 2u};
    uint32_t columns[] = {1u, 0u};
    float weights[] = {1.0f, 1.0f};
    atlas_csr_graph_v1_t graph;
    atlas_pagerank_options_v1_t pagerank_options;
    atlas_pagerank_result_v1_t pagerank_result;
    atlas_execution_receipt_t pagerank_receipt;
    assert(atlas_csr_graph_init_v1(&graph) == ATLAS_STATUS_OK);
    graph.row_count = 3u;
    graph.edge_count = 2u;
    graph.row_offsets.data = (void *)offsets;
    graph.row_offsets.byte_length = sizeof(offsets);
    graph.row_offsets.capacity = sizeof(offsets);
    graph.column_indices.data = (void *)columns;
    graph.column_indices.byte_length = sizeof(columns);
    graph.column_indices.capacity = sizeof(columns);
    graph.edge_weights.data = (void *)weights;
    graph.edge_weights.byte_length = sizeof(weights);
    graph.edge_weights.capacity = sizeof(weights);
    assert(atlas_pagerank_options_init_v1(&pagerank_options) == ATLAS_STATUS_OK);
    assert(atlas_pagerank_result_init_v1(&pagerank_result) == ATLAS_STATUS_OK);
    memset(&pagerank_receipt, 0, sizeof(pagerank_receipt));
    pagerank_receipt.struct_size = (uint32_t)sizeof(pagerank_receipt);
    pagerank_receipt.abi_version = ATLAS_ABI_VERSION_1;
    assert(atlas_execution_receipt_init(&pagerank_receipt) == ATLAS_STATUS_OK);
    assert(atlas_context_options_init(&options) == ATLAS_STATUS_OK);
    assert(atlas_context_create(&options, &context) == ATLAS_STATUS_OK);
    assert(atlas_pagerank(context, &graph, &pagerank_options, &pagerank_result, &pagerank_receipt) == ATLAS_STATUS_OK);
    assert(pagerank_result.converged == 1u && pagerank_result.iterations > 0u);
    assert(pagerank_result.node_count == 3u && pagerank_result.scores.byte_length == 3u * sizeof(double));
    {
      const double *scores = (const double *)pagerank_result.scores.data;
      assert(fabs(scores[0] - 0.46511627906976744) < 1e-10);
      assert(fabs(scores[1] - 0.46511627906976744) < 1e-10);
      assert(fabs(scores[2] - 0.06976744186046512) < 1e-10);
      assert(fabs(scores[0] + scores[1] + scores[2] - 1.0) < 1e-12);
      if (argc == 2 && strcmp(argv[1], "--emit-pagerank-json") == 0) {
        printf("{\"scores\":[%.17g,%.17g,%.17g],\"iterations\":%u,\"converged\":%s}\n",
            scores[0], scores[1], scores[2], pagerank_result.iterations,
            pagerank_result.converged ? "true" : "false");
      }
    }
    assert(atlas_pagerank_result_release_v1(&pagerank_result) == ATLAS_STATUS_OK);

    assert(atlas_pagerank_result_init_v1(&pagerank_result) == ATLAS_STATUS_OK);
    pagerank_options.max_iterations = 1u;
    assert(atlas_pagerank(context, &graph, &pagerank_options, &pagerank_result, &pagerank_receipt) == ATLAS_STATUS_OK);
    assert(pagerank_result.iterations == 1u && pagerank_result.converged == 0u);
    assert(atlas_pagerank_result_release_v1(&pagerank_result) == ATLAS_STATUS_OK);

    assert(atlas_pagerank_result_init_v1(&pagerank_result) == ATLAS_STATUS_OK);
    columns[0] = 3u;
    assert(atlas_pagerank(context, &graph, &pagerank_options, &pagerank_result, &pagerank_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
    assert(pagerank_result.scores.data == 0u && pagerank_result.node_count == 0u);
    columns[0] = 1u;
    weights[0] = (float)NAN;
    assert(atlas_pagerank(context, &graph, &pagerank_options, &pagerank_result, &pagerank_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
    assert(pagerank_result.scores.data == 0u && pagerank_result.node_count == 0u);
    weights[0] = 1.0f;
    offsets[1] = 2u;
    assert(atlas_pagerank(context, &graph, &pagerank_options, &pagerank_result, &pagerank_receipt) == ATLAS_STATUS_INVALID_ARGUMENT);
    assert(pagerank_result.scores.data == 0u && pagerank_result.node_count == 0u);
    offsets[1] = 1u;
    assert(atlas_pagerank_result_release_v1(&pagerank_result) == ATLAS_STATUS_OK);

    assert(atlas_context_destroy(&context) == ATLAS_STATUS_OK);
    /* This fixture borrows stack-backed CSR arrays; reinitialize, do not free them. */
    assert(atlas_csr_graph_init_v1(&graph) == ATLAS_STATUS_OK);
  }
  return 0;
}
