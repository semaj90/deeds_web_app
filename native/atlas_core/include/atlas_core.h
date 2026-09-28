#ifndef ATLAS_CORE_H
#define ATLAS_CORE_H

#include <stdint.h>

#if defined(_WIN32) && !defined(ATLAS_CORE_STATIC)
#  if defined(ATLAS_CORE_BUILD)
#    define ATLAS_API __declspec(dllexport)
#  else
#    define ATLAS_API __declspec(dllimport)
#  endif
#else
#  define ATLAS_API
#endif

#ifdef __cplusplus
extern "C" {
#endif

#define ATLAS_ABI_VERSION_1 1u
#define ATLAS_CUDA_DEVICE_DEFAULT (-1)
#define ATLAS_REPRESENTATION_ID_MAX 128u
#define ATLAS_REPRESENTATION_REVISION_MAX 128u
#define ATLAS_MODEL_ID_MAX 128u
#define ATLAS_MODEL_SHA256_HEX_LENGTH 64u

typedef struct atlas_context atlas_context_t;
typedef struct atlas_cuvs_index atlas_cuvs_index_t;
typedef struct atlas_turbovec_index atlas_turbovec_index_t;

typedef enum atlas_status {
  ATLAS_STATUS_OK = 0,
  ATLAS_STATUS_INVALID_ARGUMENT = 1,
  ATLAS_STATUS_DIMENSION_MISMATCH = 2,
  ATLAS_STATUS_QUEUE_FULL = 3,
  ATLAS_STATUS_CUDA_UNAVAILABLE = 4,
  ATLAS_STATUS_CUDA_ERROR = 5,
  ATLAS_STATUS_OUT_OF_MEMORY = 6,
  ATLAS_STATUS_NOT_IMPLEMENTED = 7,
  ATLAS_STATUS_INTERNAL_ERROR = 8
} atlas_status_t;

typedef enum atlas_backend {
  ATLAS_BACKEND_CPU = 0,
  ATLAS_BACKEND_LIBTORCH_CUDA = 1,
  ATLAS_BACKEND_CUVS_BRUTE_FORCE = 2,
  ATLAS_BACKEND_CUVS_CAGRA = 3,
  ATLAS_BACKEND_CUGRAPH = 4,
  ATLAS_BACKEND_TURBOVEC = 5,
  ATLAS_BACKEND_WEBGPU = 6
} atlas_backend_t;

typedef enum atlas_metric {
  ATLAS_METRIC_INNER_PRODUCT = 0,
  ATLAS_METRIC_COSINE = 1,
  ATLAS_METRIC_SQUARED_L2 = 2
} atlas_metric_t;

typedef enum atlas_dtype {
  ATLAS_DTYPE_F32 = 1,
  ATLAS_DTYPE_F16 = 2,
  ATLAS_DTYPE_BF16 = 3
} atlas_dtype_t;

typedef enum atlas_normalization {
  ATLAS_NORMALIZATION_NONE = 0,
  ATLAS_NORMALIZATION_L2 = 1
} atlas_normalization_t;

typedef enum atlas_representation_reason {
  ATLAS_REPRESENTATION_REASON_NONE = 0,
  ATLAS_REPRESENTATION_REASON_INVALID_CONTRACT = 1,
  ATLAS_REPRESENTATION_REASON_ID_MISMATCH = 2,
  ATLAS_REPRESENTATION_REASON_REVISION_MISMATCH = 3,
  ATLAS_REPRESENTATION_REASON_DIMENSION_MISMATCH = 4,
  ATLAS_REPRESENTATION_REASON_DTYPE_MISMATCH = 5,
  ATLAS_REPRESENTATION_REASON_NORMALIZATION_MISMATCH = 6,
  ATLAS_REPRESENTATION_REASON_METRIC_MISMATCH = 7,
  ATLAS_REPRESENTATION_REASON_MODEL_MISMATCH = 8
} atlas_representation_reason_t;

/* Fixed-size identifier fields avoid caller-owned string lifetime in the C ABI. */
typedef struct atlas_representation_contract_v1 {
  uint32_t struct_size;
  uint32_t abi_version;
  char representation_id[ATLAS_REPRESENTATION_ID_MAX];
  char representation_revision[ATLAS_REPRESENTATION_REVISION_MAX];
  uint32_t dimensions;
  atlas_dtype_t dtype;
  atlas_normalization_t normalization;
  atlas_metric_t metric;
  char model_id[ATLAS_MODEL_ID_MAX];
  char model_sha256[ATLAS_MODEL_SHA256_HEX_LENGTH + 1u];
  uint32_t reserved[4];
} atlas_representation_contract_v1_t;

/* These envelopes bind future index/compute operations to the same representation contract. */
typedef struct atlas_index_build_request_v1 {
  uint32_t struct_size;
  uint32_t abi_version;
  uint64_t row_count;
  atlas_representation_contract_v1_t representation;
} atlas_index_build_request_v1_t;

typedef struct atlas_compute_request_v1 {
  uint32_t struct_size;
  uint32_t abi_version;
  atlas_representation_contract_v1_t query_representation;
  atlas_representation_contract_v1_t index_representation;
} atlas_compute_request_v1_t;

typedef struct atlas_representation_validation_receipt_v1 {
  uint32_t struct_size;
  uint32_t abi_version;
  atlas_status_t status;
  atlas_representation_reason_t reason;
  uint32_t reserved[4];
} atlas_representation_validation_receipt_v1_t;

typedef struct atlas_context_options {
  uint32_t struct_size;
  uint32_t abi_version;
  int32_t cuda_device;
  uint32_t stream_count;
  uint32_t queue_capacity;
  uint32_t flags;
  uint64_t memory_limit_bytes;
  uint32_t reserved[4];
} atlas_context_options_t;

typedef struct atlas_execution_receipt {
  uint32_t struct_size;
  uint32_t abi_version;
  uint64_t operation_id;
  atlas_backend_t backend;
  atlas_status_t status;
  uint64_t queue_wait_ns;
  uint64_t execution_ns;
  uint64_t host_to_device_bytes;
  uint64_t device_to_host_bytes;
  uint8_t used_cpu_fallback;
  uint8_t reserved[7];
} atlas_execution_receipt_t;

/* Buffers are allocated and released by this module; callers must not free data. */
typedef struct atlas_buffer {
  uint32_t struct_size;
  uint32_t abi_version;
  void *data;
  uint64_t byte_length;
  uint64_t capacity;
  uint32_t allocator_id;
  uint32_t reserved;
} atlas_buffer_t;

ATLAS_API uint32_t atlas_get_abi_version(void);
ATLAS_API const char *atlas_status_string(atlas_status_t status);
ATLAS_API atlas_status_t atlas_context_options_init(atlas_context_options_t *options);
ATLAS_API atlas_status_t atlas_execution_receipt_init(atlas_execution_receipt_t *receipt);
/* Strict atlas.execution-receipt.v1 MessagePack; encoded buffers use the module allocator. */
ATLAS_API atlas_status_t atlas_receipt_encode_msgpack_v1(
    const atlas_execution_receipt_t *receipt,
    atlas_buffer_t *out_msgpack);
ATLAS_API atlas_status_t atlas_receipt_decode_msgpack_v1(
    const atlas_buffer_t *msgpack,
    atlas_execution_receipt_t *out_receipt);
ATLAS_API atlas_status_t atlas_context_create(
    const atlas_context_options_t *options,
    atlas_context_t **out_context);
ATLAS_API atlas_status_t atlas_context_destroy(atlas_context_t **context);
ATLAS_API atlas_status_t atlas_buffer_init(atlas_buffer_t *buffer);
ATLAS_API atlas_status_t atlas_buffer_allocate(uint64_t byte_length, atlas_buffer_t *out_buffer);
ATLAS_API atlas_status_t atlas_buffer_release(atlas_buffer_t *buffer);
ATLAS_API atlas_status_t atlas_representation_contract_init_v1(
    atlas_representation_contract_v1_t *contract);
ATLAS_API atlas_status_t atlas_index_build_request_init_v1(
    atlas_index_build_request_v1_t *request);
ATLAS_API atlas_status_t atlas_compute_request_init_v1(
    atlas_compute_request_v1_t *request);
ATLAS_API atlas_status_t atlas_representation_validation_receipt_init_v1(
    atlas_representation_validation_receipt_v1_t *receipt);
ATLAS_API atlas_status_t atlas_index_build_request_validate_v1(
    const atlas_index_build_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt);
ATLAS_API atlas_status_t atlas_compute_request_validate_v1(
    const atlas_compute_request_v1_t *request,
    atlas_representation_validation_receipt_v1_t *receipt);

#ifdef __cplusplus
}
#endif

#endif
