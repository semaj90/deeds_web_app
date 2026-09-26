// BITFROST-L2-01 benchmark harness (v2 -- corrected methodology).
//
// v1 (see git history / archived docs/reports/bitfrost-l2-01-results.json)
// measured a small persisting buffer in ISOLATION -- no competing memory
// traffic ever pressured it out of L2, so there was nothing for the
// persisting hint to protect against, and the measured lift was small and
// negative (persisting slightly SLOWER than normal) on all 3 runs. Root
// cause found via web research, not guessed: NVIDIA's own L2-cache-control
// docs and independent benchmarks (Lei Mao's CUDA L2 Persistent Cache write-
// up) both use a TWO-BUFFER design to demonstrate a real benefit -- a small
// persisting buffer is repeatedly re-accessed via modulo indexing WHILE a
// much larger "streaming" buffer is also touched every kernel launch,
// creating genuine L2 eviction pressure the persisting hint can protect
// against. Lei Mao's writeup: 3MB persistent data + 3MB L2 set-aside +
// 1024MB streaming buffer => ~20% measured speedup (3.071ms -> 2.443ms) on
// an RTX 3090. This v2 implements that same two-buffer pattern, scaled down
// to fit this host's real, tight, contended VRAM budget.
//
// Deliberately standalone: no dependency on simd-bridge/cpp/binding.cc
// (documented corruption/fragility history in this repo's CLAUDE.md) and no
// Node N-API surface -- matches native/ace-radix-01/radix_bench.cu's
// convention exactly (benchmark-only tool, never wired into a production
// code path).
//
// VRAM SAFETY NOTE (found live, 2026-09-14): cudaMemGetInfo() on this
// Windows/WDDM host reports several GB more "free" than nvidia-smi reports
// for the same moment (a real, reproducible discrepancy -- see
// docs/reports/bitfrost-l2-01-results.json and root CLAUDE.md). Because of
// this, cudaMemGetInfo is NOT trusted as the primary sizing signal here --
// the wrapping harness script (scripts/atlas/bitfrost-l2-01/run-l2-persist-bench.mjs)
// queries nvidia-smi directly and passes a conservative streamingBufferMib
// as a CLI argument; cudaMemGetInfo is still checked as a belt-and-suspenders
// second gate, but the wrapper's nvidia-smi-derived figure is the one this
// change actually relies on for safety.
//
// Unlike ACE-RADIX-01's determinism-only gate (exact-match ordering is a
// binary correctness fact), L2 persistence's benefit is a magnitude
// measurement with no CPU/GPU oracle to check "correctness" against -- the
// result is reported as characterization data (RESULT: DRY_RUN_PROVEN if the
// measurement itself completed), not a fabricated PASS/FAIL threshold.
//
// Usage: l2_persist_bench.exe [iterations] [warmupIterations] [streamingBufferMib]
//   streamingBufferMib: size of the large competing buffer, in MiB. Should be
//   passed by the wrapper script from a real nvidia-smi-derived safe budget.
//   If omitted, falls back to a small, conservative default (8 MiB) -- NOT
//   derived from this binary's own (untrustworthy) cudaMemGetInfo reading.
// Output: one JSON line to stdout.

#include <cuda_runtime.h>

#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
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

static const size_t VRAM_SAFETY_MARGIN_BYTES = 64ull * 1024 * 1024; // 64 MiB for CUDA context overhead
static const size_t FALLBACK_STREAMING_BUFFER_MIB = 8; // conservative, used only if wrapper omits the arg

// streamOut[i] = persistBuf[i % persistCount] for i in [0, streamCount).
// The large write traffic across streamOut creates real memory-system
// pressure that would evict persistBuf from L2 absent the persisting hint --
// this is the mechanism v1 never exercised.
__global__ void streamingReadPersistKernel(
    const float* persistBuf, size_t persistCount, float* streamOut, size_t streamCount) {
  size_t tid = static_cast<size_t>(blockIdx.x) * blockDim.x + threadIdx.x;
  size_t stride = static_cast<size_t>(gridDim.x) * blockDim.x;
  for (size_t i = tid; i < streamCount; i += stride) {
    streamOut[i] = persistBuf[i % persistCount];
  }
}

static double timeStreamingReadPersist(
    const float* d_persistBuf, size_t persistCount, float* d_streamOut, size_t streamCount,
    cudaStream_t stream, int warmupIterations, int timedIterations) {
  const int threadsPerBlock = 256;
  const int blocks = 1024; // grid-stride loop covers streamCount regardless of grid size

  for (int i = 0; i < warmupIterations; ++i) {
    streamingReadPersistKernel<<<blocks, threadsPerBlock, 0, stream>>>(
        d_persistBuf, persistCount, d_streamOut, streamCount);
  }
  CUDA_CHECK(cudaStreamSynchronize(stream));

  cudaEvent_t start, end;
  CUDA_CHECK(cudaEventCreate(&start));
  CUDA_CHECK(cudaEventCreate(&end));

  CUDA_CHECK(cudaEventRecord(start, stream));
  for (int i = 0; i < timedIterations; ++i) {
    streamingReadPersistKernel<<<blocks, threadsPerBlock, 0, stream>>>(
        d_persistBuf, persistCount, d_streamOut, streamCount);
  }
  CUDA_CHECK(cudaEventRecord(end, stream));
  CUDA_CHECK(cudaEventSynchronize(end));

  float ms = 0.0f;
  CUDA_CHECK(cudaEventElapsedTime(&ms, start, end));

  CUDA_CHECK(cudaEventDestroy(start));
  CUDA_CHECK(cudaEventDestroy(end));

  return static_cast<double>(ms);
}

int main(int argc, char** argv) {
  const int timedIterations = argc > 1 ? std::atoi(argv[1]) : 200;
  const int warmupIterations = argc > 2 ? std::atoi(argv[2]) : 10;
  const size_t streamingBufferMib =
      argc > 3 ? static_cast<size_t>(std::strtoull(argv[3], nullptr, 10)) : FALLBACK_STREAMING_BUFFER_MIB;
  const bool streamingBufferMibFromWrapper = argc > 3;

  cudaDeviceProp prop{};
  CUDA_CHECK(cudaGetDeviceProperties(&prop, 0));

  int maxPersistingL2Bytes = 0;
  CUDA_CHECK(cudaDeviceGetAttribute(&maxPersistingL2Bytes, cudaDevAttrMaxPersistingL2CacheSize, 0));

  size_t freeBytesBefore = 0, totalBytes = 0;
  CUDA_CHECK(cudaMemGetInfo(&freeBytesBefore, &totalBytes));

  // Persisting buffer size still capped at the device's own max-persisting-L2
  // attribute (2,162,688 bytes / ~2.06 MiB on this RTX 3060 Ti) -- unchanged
  // from v1.
  size_t persistBufferBytes = 4ull * 1024 * 1024; // same 4 MiB ceiling as v1
  if (maxPersistingL2Bytes > 0 && static_cast<size_t>(maxPersistingL2Bytes) < persistBufferBytes) {
    persistBufferBytes = static_cast<size_t>(maxPersistingL2Bytes);
  }

  const size_t streamBufferBytes = streamingBufferMib * 1024ull * 1024ull;

  // Two persisting buffers + two streaming buffers (persisting-config +
  // normal-config), plus a safety margin. cudaMemGetInfo is checked here as
  // a SECOND gate, not the primary safety mechanism -- see the VRAM SAFETY
  // NOTE above for why it is not fully trusted on this host.
  const size_t requiredBytes = (persistBufferBytes + streamBufferBytes) * 2 + VRAM_SAFETY_MARGIN_BYTES;
  if (freeBytesBefore < requiredBytes) {
    std::printf(
        "{\"schema\":\"atlas.bitfrost-l2-01.result.v2\",\"test\":\"BITFROST-L2-01\","
        "\"RESULT\":\"INSUFFICIENT_VRAM\","
        "\"freeVramBeforeMibCudaMemGetInfo\":%.2f,\"totalVramMib\":%.2f,"
        "\"requiredBytes\":%zu,\"streamingBufferMibAttempted\":%zu,"
        "\"streamingBufferMibFromWrapper\":%s}\n",
        freeBytesBefore / 1048576.0, totalBytes / 1048576.0, requiredBytes, streamingBufferMib,
        streamingBufferMibFromWrapper ? "true" : "false");
    return 1;
  }

  const size_t persistCount = persistBufferBytes / sizeof(float);
  const size_t streamCount = streamBufferBytes / sizeof(float);

  float* d_persistBufA = nullptr; // persisting-config
  float* d_persistBufB = nullptr; // normal-config
  float* d_streamOutA = nullptr;
  float* d_streamOutB = nullptr;
  CUDA_CHECK(cudaMalloc(&d_persistBufA, persistBufferBytes));
  CUDA_CHECK(cudaMalloc(&d_persistBufB, persistBufferBytes));
  CUDA_CHECK(cudaMalloc(&d_streamOutA, streamBufferBytes));
  CUDA_CHECK(cudaMalloc(&d_streamOutB, streamBufferBytes));

  std::vector<float> hostInit(persistCount, 1.0f);
  CUDA_CHECK(cudaMemcpy(d_persistBufA, hostInit.data(), persistBufferBytes, cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_persistBufB, hostInit.data(), persistBufferBytes, cudaMemcpyHostToDevice));

  cudaStream_t persistStream, normalStream;
  CUDA_CHECK(cudaStreamCreate(&persistStream));
  CUDA_CHECK(cudaStreamCreate(&normalStream));

  cudaStreamAttrValue attr{};
  attr.accessPolicyWindow.base_ptr = d_persistBufA;
  attr.accessPolicyWindow.num_bytes = persistBufferBytes;
  // hitRatio per NVIDIA's own guidance: min(persistentL2Size / persistentDataSize, 1.0).
  // Here persistBufferBytes IS maxPersistingL2Bytes (or smaller), so ratio is 1.0.
  attr.accessPolicyWindow.hitRatio = 1.0f;
  attr.accessPolicyWindow.hitProp = cudaAccessPropertyPersisting;
  attr.accessPolicyWindow.missProp = cudaAccessPropertyStreaming;
  CUDA_CHECK(cudaStreamSetAttribute(persistStream, cudaStreamAttributeAccessPolicyWindow, &attr));
  // normalStream deliberately gets NO access policy window set (default/normal behavior).

  const double persistMs = timeStreamingReadPersist(
      d_persistBufA, persistCount, d_streamOutA, streamCount, persistStream,
      warmupIterations, timedIterations);
  const double normalMs = timeStreamingReadPersist(
      d_persistBufB, persistCount, d_streamOutB, streamCount, normalStream,
      warmupIterations, timedIterations);

  // Reset the persisting stream's access policy window before teardown, per
  // NVIDIA's own documented cleanup requirement.
  cudaStreamAttrValue resetAttr{};
  resetAttr.accessPolicyWindow.num_bytes = 0;
  CUDA_CHECK(cudaStreamSetAttribute(persistStream, cudaStreamAttributeAccessPolicyWindow, &resetAttr));
  CUDA_CHECK(cudaCtxResetPersistingL2Cache());

  size_t freeBytesAfter = 0;
  CUDA_CHECK(cudaMemGetInfo(&freeBytesAfter, &totalBytes));

  const double lift = normalMs > 0.0 ? (normalMs - persistMs) / normalMs : 0.0;

  // Best-effort: this benchmark cannot itself enumerate other processes
  // (that is an OS/nvidia-smi-level query, out of a CUDA runtime program's
  // scope) -- the harness script wrapping this binary is responsible for
  // attaching a real nvidia-smi-derived contention snapshot to the final
  // result JSON. This binary honestly reports that it did not attempt that
  // query itself, rather than fabricating a value.
  std::printf(
      "{\"schema\":\"atlas.bitfrost-l2-01.result.v2\",\"test\":\"BITFROST-L2-01\","
      "\"RESULT\":\"DRY_RUN_PROVEN\","
      "\"methodology\":\"two-buffer-eviction-pressure\","
      "\"device\":\"%s\",\"cudaRuntimeVersion\":%d,"
      "\"maxPersistingL2CacheSizeBytes\":%d,\"persistBufferBytes\":%zu,"
      "\"streamingBufferMib\":%zu,\"streamingBufferMibFromWrapper\":%s,"
      "\"timedIterations\":%d,\"warmupIterations\":%d,"
      "\"freeVramBeforeMibCudaMemGetInfo\":%.2f,\"freeVramAfterMibCudaMemGetInfo\":%.2f,\"totalVramMib\":%.2f,"
      "\"persistingTotalMs\":%.4f,\"normalTotalMs\":%.4f,"
      "\"persistingVsNormalLatencyLift\":%.6f,"
      "\"contentionSnapshotAvailable\":false,"
      "\"note\":\"contentionSnapshotAvailable=false because this binary does not itself query other OS processes; the wrapping harness script attaches a real nvidia-smi snapshot to the final report. freeVramBeforeMibCudaMemGetInfo is NOT trusted as the primary safety signal on this host -- see VRAM SAFETY NOTE in source.\"}\n",
      prop.name, CUDART_VERSION, maxPersistingL2Bytes, persistBufferBytes,
      streamingBufferMib, streamingBufferMibFromWrapper ? "true" : "false",
      timedIterations, warmupIterations,
      freeBytesBefore / 1048576.0, freeBytesAfter / 1048576.0, totalBytes / 1048576.0,
      persistMs, normalMs, lift);

  CUDA_CHECK(cudaStreamDestroy(persistStream));
  CUDA_CHECK(cudaStreamDestroy(normalStream));
  CUDA_CHECK(cudaFree(d_persistBufA));
  CUDA_CHECK(cudaFree(d_persistBufB));
  CUDA_CHECK(cudaFree(d_streamOutA));
  CUDA_CHECK(cudaFree(d_streamOutB));

  return 0;
}
