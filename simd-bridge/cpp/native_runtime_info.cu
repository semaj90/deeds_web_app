#include "native_runtime_info.h"

#include <cstring>

#if !defined(NO_CUDA)
#include <cuda_runtime_api.h>
#endif

extern "C" int atlasGetCudaRuntimeInfo(AtlasCudaRuntimeInfo* out) {
  if (!out) return -1;
  std::memset(out, 0, sizeof(*out));
  out->device_index = -1;

#if defined(NO_CUDA)
  out->query_status = -99;
  return 0;
#else
  out->cuda_compiled = 1;
  cudaError_t status = cudaRuntimeGetVersion(&out->cuda_runtime_version);
  if (status != cudaSuccess) {
    out->query_status = static_cast<int>(status);
    return 0;
  }

  status = cudaDriverGetVersion(&out->cuda_driver_version);
  if (status != cudaSuccess) {
    out->query_status = static_cast<int>(status);
    return 0;
  }

  int device_count = 0;
  status = cudaGetDeviceCount(&device_count);
  if (status != cudaSuccess || device_count <= 0) {
    out->query_status = status == cudaSuccess ? -1 : static_cast<int>(status);
    return 0;
  }
  out->cuda_runtime_available = 1;

  status = cudaGetDevice(&out->device_index);
  if (status != cudaSuccess) {
    out->query_status = static_cast<int>(status);
    return 0;
  }

  cudaDeviceProp properties{};
  status = cudaGetDeviceProperties(&properties, out->device_index);
  if (status != cudaSuccess) {
    out->query_status = static_cast<int>(status);
    return 0;
  }

  std::strncpy(out->device_name, properties.name, sizeof(out->device_name) - 1);
  out->compute_major = properties.major;
  out->compute_minor = properties.minor;

  std::size_t free_bytes = 0;
  std::size_t total_bytes = 0;
  status = cudaMemGetInfo(&free_bytes, &total_bytes);
  if (status != cudaSuccess) {
    out->query_status = static_cast<int>(status);
    return 0;
  }
  out->free_bytes = static_cast<std::uint64_t>(free_bytes);
  out->total_bytes = static_cast<std::uint64_t>(total_bytes);

  out->query_status = 0;
  return 1;
#endif
}
