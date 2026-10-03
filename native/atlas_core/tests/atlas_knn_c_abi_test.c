#include "atlas_core.h"

#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#ifdef NDEBUG
#  undef assert
#  define assert(condition) ((condition) ? (void)0 : abort())
#endif

static void set_representation(atlas_representation_contract_v1_t *contract) {
  assert(atlas_representation_contract_init_v1(contract) == ATLAS_STATUS_OK);
  strcpy(contract->representation_id, "fixture_f32");
  strcpy(contract->representation_revision, "repr:fixture-r1");
  contract->dimensions = 3u;
  contract->dtype = ATLAS_DTYPE_F32;
  contract->normalization = ATLAS_NORMALIZATION_L2;
  contract->metric = ATLAS_METRIC_COSINE;
  strcpy(contract->model_id, "embeddinggemma-300m");
  strcpy(contract->model_sha256,
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
}

int main(void) {
  float query[6] = {1, 0, 0, 1, 1, 1};
  float corpus[12] = {1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 2, 2};
  atlas_knn_exact_request_v1_t request;
  atlas_representation_validation_receipt_v1_t validation;
  assert(atlas_knn_exact_request_init_v1(&request) == ATLAS_STATUS_OK);
  request.query_count = 2u;
  request.corpus_count = 4u;
  request.top_k = 2u;
  request.query_row_major_f32 = query;
  request.query_byte_length = sizeof(query);
  request.corpus_row_major_f32 = corpus;
  request.corpus_byte_length = sizeof(corpus);
  set_representation(&request.query_representation);
  set_representation(&request.corpus_representation);
  assert(atlas_representation_validation_receipt_init_v1(&validation) == ATLAS_STATUS_OK);
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_OK);
  assert(validation.reason == ATLAS_REPRESENTATION_REASON_NONE);

  request.top_k = 5u;
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_INVALID_ARGUMENT);
  request.top_k = 2u;
  request.query_byte_length -= sizeof(float);
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_INVALID_ARGUMENT);
  request.query_byte_length = sizeof(query);
  request.corpus_representation.representation_revision[5] = 'x';
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_INVALID_ARGUMENT);
  set_representation(&request.corpus_representation);
  request.reserved[2] = 1u;
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_INVALID_ARGUMENT);
  request.reserved[2] = 0u;
  request.query_count = UINT64_MAX;
  assert(atlas_knn_exact_request_validate_v1(&request, &validation) == ATLAS_STATUS_INVALID_ARGUMENT);
  request.query_count = 2u;
  set_representation(&request.query_representation);

  atlas_knn_exact_result_v1_t result;
  assert(atlas_knn_exact_result_init_v1(&result) == ATLAS_STATUS_OK);
  assert(atlas_buffer_allocate(2u * sizeof(uint32_t), &result.corpus_row_indices) == ATLAS_STATUS_OK);
  assert(atlas_buffer_allocate(2u * sizeof(float), &result.distances) == ATLAS_STATUS_OK);
  result.query_count = 1u;
  result.top_k = 2u;
  assert(atlas_knn_exact_result_release_v1(&result) == ATLAS_STATUS_OK);
  assert(result.query_count == 0u && result.top_k == 0u);
  assert(atlas_knn_exact_result_release_v1(&result) == ATLAS_STATUS_OK);

  atlas_context_options_t options;
  atlas_context_t *context = NULL;
  assert(atlas_context_options_init(&options) == ATLAS_STATUS_OK);
  assert(atlas_context_create(&options, &context) == ATLAS_STATUS_OK);
  assert(atlas_knn_exact_result_init_v1(&result) == ATLAS_STATUS_OK);
  atlas_execution_receipt_t receipt = {0};
  receipt.struct_size = (uint32_t)sizeof(receipt);
  receipt.abi_version = ATLAS_ABI_VERSION_1;
  assert(atlas_execution_receipt_init(&receipt) == ATLAS_STATUS_OK);
  assert(atlas_knn_exact(context, &request, &result, &receipt) == ATLAS_STATUS_NOT_IMPLEMENTED);
  assert(receipt.status == ATLAS_STATUS_NOT_IMPLEMENTED);
  assert(result.query_count == 0u && result.top_k == 0u);
  assert(result.corpus_row_indices.data == NULL && result.distances.data == NULL);
  assert(atlas_knn_exact_result_release_v1(&result) == ATLAS_STATUS_OK);
  assert(atlas_context_destroy(&context) == ATLAS_STATUS_OK);
  assert(context == NULL);
  return 0;
}
