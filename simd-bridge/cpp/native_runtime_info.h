#pragma once

#include <cstdint>

struct AtlasCudaRuntimeInfo {
  int cuda_compiled;
  int cuda_runtime_available;
  int cuda_runtime_version;
  int cuda_driver_version;
  int device_index;
  int compute_major;
  int compute_minor;
  int query_status;
  std::uint64_t free_bytes;
  std::uint64_t total_bytes;
  char device_name[256];
};

extern "C" int atlasGetCudaRuntimeInfo(AtlasCudaRuntimeInfo* out);
