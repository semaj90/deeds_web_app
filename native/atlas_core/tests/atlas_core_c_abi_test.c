#include "atlas_core.h"

#include <assert.h>
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
  return 0;
}
