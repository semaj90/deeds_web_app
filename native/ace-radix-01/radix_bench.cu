// ACE-RADIX-01 benchmark harness.
//
// Compares a CPU std::sort reference ordering against CUB DeviceRadixSort
// (the required oracle, per openspec/changes/parent-atlas-ace-radix-residency).
//
// Deliberately standalone: no dependency on simd-bridge/cpp/binding.cc (which
// has a documented corruption/fragility history in this repo's CLAUDE.md) and
// no Node N-API surface. This is a benchmark-only tool, matching
// design.md's Non-Goal that CUB/cuTile bindings stay scoped to the harness,
// never wired into any production code path.
//
// cuTile challenger: NOT implemented here. Verified live on this build host
// (CUDA 13.0, `nvcc --version` / toolkit include tree) that the only cuTile
// artifact present is `crt/cuda_tile.h`, a bare compiler-intrinsic
// declaration (`__tile_builtin__ print`) -- not a usable host-side cuTile
// programming API. Per this repo's evidence rules (no fabricated benchmark
// results), every N in this run is recorded with cuTile status
// ENVIRONMENT_BLOCKED rather than a synthesized pass/fail. cuTile went stable
// on Ampere only at CUDA 13.2 per this repo's own prior finding (root
// CLAUDE.md, "Neural Decoder Container" section) -- this host has 13.0.
//
// Usage: radix_bench.exe <packed-keys-file.bin> <N>
// Input format: N little-endian uint64 values (see
// scripts/atlas/ace-radix-01/fixture-v1.mjs for the generator + packing
// scheme -- packedKey = (tier<<56)|(lod<<48)|(utilityBucket<<40)|(recencyBucket<<32)|projectionOrdinal).
// Output: one JSON line per run to stdout.

#include <cuda_runtime.h>
#include <cub/device/device_radix_sort.cuh>

#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <vector>

#define CUDA_CHECK(expr)                                                                   \
  do {                                                                                      \
    cudaError_t _err = (expr);                                                              \
    if (_err != cudaSuccess) {                                                               \
      std::fprintf(stderr, "CUDA error %s at %s:%d: %s\n", #expr, __FILE__, __LINE__,         \
                   cudaGetErrorString(_err));                                                \
      std::exit(1);                                                                          \
    }                                                                                        \
  } while (0)

static std::vector<uint64_t> readPackedKeys(const char* path, size_t n) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    std::fprintf(stderr, "failed to open %s\n", path);
    std::exit(1);
  }
  std::vector<uint64_t> keys(n);
  in.read(reinterpret_cast<char*>(keys.data()), static_cast<std::streamsize>(n * sizeof(uint64_t)));
  if (!in) {
    std::fprintf(stderr, "failed to read %zu keys from %s (file too short)\n", n, path);
    std::exit(1);
  }
  return keys;
}

int main(int argc, char** argv) {
  if (argc != 3) {
    std::fprintf(stderr, "usage: %s <packed-keys-file.bin> <N>\n", argv[0]);
    return 2;
  }
  const char* path = argv[1];
  const size_t n = static_cast<size_t>(std::strtoull(argv[2], nullptr, 10));

  std::vector<uint64_t> original = readPackedKeys(path, n);

  // --- CPU std::sort reference ---
  std::vector<uint64_t> cpuSorted = original;
  auto cpuStart = std::chrono::high_resolution_clock::now();
  std::sort(cpuSorted.begin(), cpuSorted.end());
  auto cpuEnd = std::chrono::high_resolution_clock::now();
  double cpuMs = std::chrono::duration<double, std::milli>(cpuEnd - cpuStart).count();

  // --- CUB DeviceRadixSort oracle ---
  uint64_t* d_keysIn = nullptr;
  uint64_t* d_keysOut = nullptr;
  CUDA_CHECK(cudaMalloc(&d_keysIn, n * sizeof(uint64_t)));
  CUDA_CHECK(cudaMalloc(&d_keysOut, n * sizeof(uint64_t)));

  cudaEvent_t evH2DStart, evH2DEnd, evKernelStart, evKernelEnd, evD2HStart, evD2HEnd;
  CUDA_CHECK(cudaEventCreate(&evH2DStart));
  CUDA_CHECK(cudaEventCreate(&evH2DEnd));
  CUDA_CHECK(cudaEventCreate(&evKernelStart));
  CUDA_CHECK(cudaEventCreate(&evKernelEnd));
  CUDA_CHECK(cudaEventCreate(&evD2HStart));
  CUDA_CHECK(cudaEventCreate(&evD2HEnd));

  auto totalStart = std::chrono::high_resolution_clock::now();

  CUDA_CHECK(cudaEventRecord(evH2DStart));
  CUDA_CHECK(cudaMemcpy(d_keysIn, original.data(), n * sizeof(uint64_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaEventRecord(evH2DEnd));

  void* d_temp = nullptr;
  size_t tempBytes = 0;
  CUDA_CHECK(cub::DeviceRadixSort::SortKeys(d_temp, tempBytes, d_keysIn, d_keysOut, static_cast<int>(n)));
  CUDA_CHECK(cudaMalloc(&d_temp, tempBytes));

  CUDA_CHECK(cudaEventRecord(evKernelStart));
  CUDA_CHECK(cub::DeviceRadixSort::SortKeys(d_temp, tempBytes, d_keysIn, d_keysOut, static_cast<int>(n)));
  CUDA_CHECK(cudaEventRecord(evKernelEnd));

  std::vector<uint64_t> cubSorted(n);
  CUDA_CHECK(cudaEventRecord(evD2HStart));
  CUDA_CHECK(cudaMemcpy(cubSorted.data(), d_keysOut, n * sizeof(uint64_t), cudaMemcpyDeviceToHost));
  CUDA_CHECK(cudaEventRecord(evD2HEnd));

  CUDA_CHECK(cudaEventSynchronize(evD2HEnd));
  auto totalEnd = std::chrono::high_resolution_clock::now();
  double totalMs = std::chrono::duration<double, std::milli>(totalEnd - totalStart).count();

  float h2dMs = 0, kernelMs = 0, d2hMs = 0;
  CUDA_CHECK(cudaEventElapsedTime(&h2dMs, evH2DStart, evH2DEnd));
  CUDA_CHECK(cudaEventElapsedTime(&kernelMs, evKernelStart, evKernelEnd));
  CUDA_CHECK(cudaEventElapsedTime(&d2hMs, evD2HStart, evD2HEnd));

  const bool exactMatch = (cubSorted == cpuSorted);

  CUDA_CHECK(cudaFree(d_keysIn));
  CUDA_CHECK(cudaFree(d_keysOut));
  CUDA_CHECK(cudaFree(d_temp));
  CUDA_CHECK(cudaEventDestroy(evH2DStart));
  CUDA_CHECK(cudaEventDestroy(evH2DEnd));
  CUDA_CHECK(cudaEventDestroy(evKernelStart));
  CUDA_CHECK(cudaEventDestroy(evKernelEnd));
  CUDA_CHECK(cudaEventDestroy(evD2HStart));
  CUDA_CHECK(cudaEventDestroy(evD2HEnd));

  const size_t bytesMoved = n * sizeof(uint64_t) * 2; // H2D + D2H

  std::printf(
      "{\"n\":%zu,\"cpuMs\":%.4f,\"cubTotalMs\":%.4f,\"cubKernelMs\":%.4f,"
      "\"h2dMs\":%.4f,\"d2hMs\":%.4f,\"bytesMoved\":%zu,"
      "\"cubMatchesCpuExactly\":%s,\"determinismVerdict\":\"%s\","
      "\"cuTileStatus\":\"ENVIRONMENT_BLOCKED\","
      "\"cuTileReason\":\"CUDA %d.%d toolkit ships only crt/cuda_tile.h compiler-intrinsic stub, no usable host cuTile API (stable at CUDA 13.2 per prior finding, this host is 13.0)\"}\n",
      n, cpuMs, totalMs, kernelMs, h2dMs, d2hMs, bytesMoved,
      exactMatch ? "true" : "false", exactMatch ? "PASS" : "FAIL",
      CUDART_VERSION / 1000, (CUDART_VERSION % 1000) / 10);

  return exactMatch ? 0 : 1;
}
