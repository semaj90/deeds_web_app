#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/*
 * Parent Atlas GPU Runtime ABI v1
 *
 * Purpose:
 *   Keep Node-API, LibTorch, cuBLASLt/CUTLASS, cuTile AOT kernels, and cuVS
 *   behind a framework-neutral C boundary. No torch::Tensor, RAFT/cuVS C++
 *   types, Python objects, or C++ standard-library containers may cross it.
 *
 * This is an execution ABI, never canonical identity authority.
 */

#define ATLAS_GPU_RUNTIME_ABI_VERSION 1u

typedef enum AtlasGpuStatusV1 {
  ATLAS_GPU_OK = 0,
  ATLAS_GPU_INVALID_ARGUMENT = 1,
  ATLAS_GPU_UNSUPPORTED = 2,
  ATLAS_GPU_RUNTIME_UNAVAILABLE = 3,
  ATLAS_GPU_DEVICE_MISMATCH = 4,
  ATLAS_GPU_OUT_OF_MEMORY = 5,
  ATLAS_GPU_KERNEL_FAILURE = 6,
  ATLAS_GPU_ABI_MISMATCH = 7
} AtlasGpuStatusV1;

typedef enum AtlasGpuBackendV1 {
  ATLAS_GPU_BACKEND_LIBTORCH = 1,
  ATLAS_GPU_BACKEND_CUBLASLT = 2,
  ATLAS_GPU_BACKEND_CUTLASS = 3,
  ATLAS_GPU_BACKEND_CUTILE_AOT = 4,
  ATLAS_GPU_BACKEND_CUVS = 5,
  ATLAS_GPU_BACKEND_CUSTOM_CUDA = 6
} AtlasGpuBackendV1;

typedef enum AtlasGpuDTypeV1 {
  ATLAS_GPU_DTYPE_F32 = 1,
  ATLAS_GPU_DTYPE_F16 = 2,
  ATLAS_GPU_DTYPE_BF16 = 3,
  ATLAS_GPU_DTYPE_I8 = 4,
  ATLAS_GPU_DTYPE_U8 = 5,
  ATLAS_GPU_DTYPE_U16 = 6,
  ATLAS_GPU_DTYPE_U32 = 7
} AtlasGpuDTypeV1;

typedef enum AtlasGpuMemorySpaceV1 {
  ATLAS_GPU_MEMORY_HOST_PAGEABLE = 1,
  ATLAS_GPU_MEMORY_HOST_PINNED = 2,
  ATLAS_GPU_MEMORY_DEVICE = 3
} AtlasGpuMemorySpaceV1;

typedef struct AtlasGpuBufferV1 {
  uint32_t abi_version;
  void* data;
  uint64_t byte_length;
  AtlasGpuDTypeV1 dtype;
  AtlasGpuMemorySpaceV1 memory_space;
  int32_t device_ordinal; /* -1 for host memory */
} AtlasGpuBufferV1;

typedef struct AtlasGpuMatrixV1 {
  uint32_t abi_version;
  AtlasGpuBufferV1 buffer;
  uint64_t rows;
  uint64_t cols;
  uint64_t row_stride_bytes;
} AtlasGpuMatrixV1;

typedef struct AtlasGpuRuntimeInfoV1 {
  uint32_t abi_version;
  AtlasGpuBackendV1 backend;
  int32_t device_ordinal;
  int32_t compute_capability_major;
  int32_t compute_capability_minor;
  uint64_t vram_total_bytes;
  uint64_t vram_free_bytes;
  const char* device_name;
  const char* driver_version;
  const char* runtime_version;
  const char* compiler_toolkit_version;
  const char* framework_name;
  const char* framework_version;
  const char* framework_cuda_runtime_version;
  const char* backend_library_version;
  const char* producer_revision;
} AtlasGpuRuntimeInfoV1;

typedef struct AtlasGpuKernelLaunchV1 {
  uint32_t abi_version;
  const char* kernel_id;
  AtlasGpuBackendV1 backend;
  int32_t device_ordinal;
  uint64_t stream_handle; /* cudaStream_t bit pattern; 0 = backend default */
  uint32_t grid_x;
  uint32_t grid_y;
  uint32_t grid_z;
  uint32_t block_x;
  uint32_t block_y;
  uint32_t block_z;
  uint32_t dynamic_shared_memory_bytes;
} AtlasGpuKernelLaunchV1;

/*
 * Framework-neutral operations. Implementations may internally use LibTorch,
 * cuBLASLt, CUTLASS, exported cuTile cubins, cuVS, or raw CUDA.
 */
uint32_t atlas_gpu_runtime_abi_version(void);
AtlasGpuStatusV1 atlas_gpu_runtime_info(AtlasGpuRuntimeInfoV1* out_info);
AtlasGpuStatusV1 atlas_gpu_synchronize(uint64_t stream_handle);

AtlasGpuStatusV1 atlas_gpu_feature_projection_f32(
    const AtlasGpuMatrixV1* features,
    const AtlasGpuMatrixV1* weights,
    AtlasGpuMatrixV1* output,
    uint64_t stream_handle);

/*
 * Optional cuTile AOT/CUDA Driver path.
 * The exported cubin stays framework-independent. The launcher owns module
 * loading and argument marshalling; no cuTile Python object crosses this ABI.
 */
AtlasGpuStatusV1 atlas_gpu_load_cubin(
    const void* cubin_bytes,
    uint64_t cubin_length,
    uint64_t* out_module_handle);

AtlasGpuStatusV1 atlas_gpu_unload_cubin(uint64_t module_handle);

AtlasGpuStatusV1 atlas_gpu_launch_cubin_kernel(
    uint64_t module_handle,
    const char* kernel_symbol,
    const AtlasGpuKernelLaunchV1* launch,
    void** kernel_arguments,
    uint32_t kernel_argument_count);

#ifdef __cplusplus
} /* extern "C" */
#endif
