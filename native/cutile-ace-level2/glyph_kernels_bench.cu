// CUTILE-ACE-01 LEVEL 2 benchmark harness.
//
// Two simple, unfused CUDA kernels, each verified EXACT-MATCH against an
// existing CPU oracle, per openspec/changes/parent-atlas-cutile-ace-level2:
//   1. GlyphScoreV1 -- a NEW pure-integer scoring formula (no prior formula
//      existed anywhere in this repo; designed in this change's design.md).
//   2. ResidencySortKeyV1 GPU packing -- computes the SAME formula
//      scripts/atlas/ace-radix-01/fixture-v1.mjs already computes on CPU,
//      just from raw glyph fields instead of pre-packed input.
//
// Deliberately standalone: no dependency on simd-bridge/cpp/binding.cc and
// no Node N-API surface -- matches native/ace-radix-01/radix_bench.cu and
// native/bitfrost-l2-01/l2_persist_bench.cu's convention exactly.
//
// This is explicitly NOT the LEVEL 3 fused cuTile challenger (score ->
// key-pack -> partition) -- both kernels here are simple, unfused, single-
// purpose LEVEL 2 proofs. LEVEL 3 stays gated behind this proof passing.
//
// Input glyph binary format (16 bytes/glyph, little-endian, matches
// scripts/atlas/ace-radix-01/glyph-score-v1.mjs's glyphsToBuffer()):
//   uint32 projectionOrdinal, uint16 featureBits, uint8 lod, uint8 residency,
//   uint16 pagerankQuantized, uint16 recency, uint16 somCell, uint16 flags
//
// Usage: glyph_kernels_bench.exe <glyphs.bin> <scores-reference.bin> <packed-keys-reference.bin> <N>
// Output: one JSON line to stdout.

#include <cuda_runtime.h>

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

// MUST match scripts/atlas/ace-radix-01/glyph-score-v1.mjs's named constants
// exactly (design.md Decision 1's "Weights are named constants" requirement).
__device__ __constant__ uint32_t GLYPH_SCORE_W_PAGERANK = 4;
__device__ __constant__ uint32_t GLYPH_SCORE_W_RECENCY = 3;
__device__ __constant__ uint32_t GLYPH_SCORE_W_RESIDENCY = 2;
__device__ __constant__ uint32_t GLYPH_SCORE_W_LOD = 1;
__device__ __constant__ uint32_t GLYPH_SCORE_W_FEATURE_POPCOUNT = 50;
__device__ __constant__ uint32_t GLYPH_SCORE_W_FLAG_POPCOUNT = 50;

// Raw glyph record -- MUST match the 16-byte layout the .mjs writer produces.
// #pragma pack ensures the struct's in-memory layout has no compiler-inserted
// padding, so a raw fread() of the .bin file into an array of this struct is
// valid without a separate per-field unpack step.
#pragma pack(push, 1)
struct PackedGlyphInputV1 {
  uint32_t projectionOrdinal;
  uint16_t featureBits;
  uint8_t lod;
  uint8_t residency;
  uint16_t pagerankQuantized;
  uint16_t recency;
  uint16_t somCell; // read but never used in either kernel -- see Non-Goals
  uint16_t flags;
};
#pragma pack(pop)
static_assert(sizeof(PackedGlyphInputV1) == 16, "PackedGlyphInputV1 must be exactly 16 bytes");

__global__ void glyphScoreV1Kernel(const PackedGlyphInputV1* glyphs, uint32_t n, uint32_t* outScores) {
  uint32_t i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  const PackedGlyphInputV1& g = glyphs[i];
  // somCell and projectionOrdinal deliberately NOT read here -- neither is a
  // utility signal (design.md Decision 1 / Non-Goals).
  uint32_t score =
      static_cast<uint32_t>(g.pagerankQuantized) * GLYPH_SCORE_W_PAGERANK +
      static_cast<uint32_t>(g.recency) * GLYPH_SCORE_W_RECENCY +
      static_cast<uint32_t>(g.residency) * 257u * GLYPH_SCORE_W_RESIDENCY +
      static_cast<uint32_t>(g.lod) * 257u * GLYPH_SCORE_W_LOD +
      static_cast<uint32_t>(__popc(static_cast<uint32_t>(g.featureBits))) * GLYPH_SCORE_W_FEATURE_POPCOUNT +
      static_cast<uint32_t>(__popc(static_cast<uint32_t>(g.flags))) * GLYPH_SCORE_W_FLAG_POPCOUNT;
  outScores[i] = score;
}

__global__ void residencyKeyPackV1Kernel(const PackedGlyphInputV1* glyphs, uint32_t n, uint64_t* outKeys) {
  uint32_t i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  const PackedGlyphInputV1& g = glyphs[i];
  // Identical formula to scripts/atlas/ace-radix-01/fixture-v1.mjs's CPU
  // packing code -- computed here from raw glyph fields, not pre-packed input.
  uint64_t tier = static_cast<uint64_t>(g.residency);
  uint64_t lodField = static_cast<uint64_t>(g.lod);
  uint64_t utilityBucket = static_cast<uint64_t>(g.pagerankQuantized) / 257ull;
  uint64_t recencyBucket = static_cast<uint64_t>(g.recency) / 257ull;
  uint64_t ordinal = static_cast<uint64_t>(g.projectionOrdinal);

  uint64_t packedKey = (tier << 56) | (lodField << 48) | (utilityBucket << 40) | (recencyBucket << 32) | ordinal;
  outKeys[i] = packedKey;
}

template <typename T>
static std::vector<T> readBinary(const char* path, size_t n) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    std::fprintf(stderr, "failed to open %s\n", path);
    std::exit(1);
  }
  std::vector<T> data(n);
  in.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(n * sizeof(T)));
  if (!in) {
    std::fprintf(stderr, "failed to read %zu records from %s (file too short)\n", n, path);
    std::exit(1);
  }
  return data;
}

int main(int argc, char** argv) {
  if (argc != 5) {
    std::fprintf(stderr, "usage: %s <glyphs.bin> <scores-reference.bin> <packed-keys-reference.bin> <N>\n", argv[0]);
    return 2;
  }
  const char* glyphsPath = argv[1];
  const char* scoresRefPath = argv[2];
  const char* keysRefPath = argv[3];
  const uint32_t n = static_cast<uint32_t>(std::strtoul(argv[4], nullptr, 10));

  std::vector<PackedGlyphInputV1> glyphs = readBinary<PackedGlyphInputV1>(glyphsPath, n);
  std::vector<uint32_t> scoresRef = readBinary<uint32_t>(scoresRefPath, n);
  std::vector<uint64_t> keysRef = readBinary<uint64_t>(keysRefPath, n);

  PackedGlyphInputV1* d_glyphs = nullptr;
  uint32_t* d_scores = nullptr;
  uint64_t* d_keys = nullptr;
  CUDA_CHECK(cudaMalloc(&d_glyphs, n * sizeof(PackedGlyphInputV1)));
  CUDA_CHECK(cudaMalloc(&d_scores, n * sizeof(uint32_t)));
  CUDA_CHECK(cudaMalloc(&d_keys, n * sizeof(uint64_t)));

  CUDA_CHECK(cudaMemcpy(d_glyphs, glyphs.data(), n * sizeof(PackedGlyphInputV1), cudaMemcpyHostToDevice));

  const int threadsPerBlock = 256;
  const int blocks = static_cast<int>((n + threadsPerBlock - 1) / threadsPerBlock);

  glyphScoreV1Kernel<<<blocks, threadsPerBlock>>>(d_glyphs, n, d_scores);
  CUDA_CHECK(cudaGetLastError());
  residencyKeyPackV1Kernel<<<blocks, threadsPerBlock>>>(d_glyphs, n, d_keys);
  CUDA_CHECK(cudaGetLastError());
  CUDA_CHECK(cudaDeviceSynchronize());

  std::vector<uint32_t> scoresGpu(n);
  std::vector<uint64_t> keysGpu(n);
  CUDA_CHECK(cudaMemcpy(scoresGpu.data(), d_scores, n * sizeof(uint32_t), cudaMemcpyDeviceToHost));
  CUDA_CHECK(cudaMemcpy(keysGpu.data(), d_keys, n * sizeof(uint64_t), cudaMemcpyDeviceToHost));

  bool scoreExactMatch = true;
  size_t firstScoreMismatchIndex = 0;
  for (size_t i = 0; i < n; ++i) {
    if (scoresGpu[i] != scoresRef[i]) {
      if (scoreExactMatch) firstScoreMismatchIndex = i;
      scoreExactMatch = false;
    }
  }

  bool keyExactMatch = true;
  size_t firstKeyMismatchIndex = 0;
  for (size_t i = 0; i < n; ++i) {
    if (keysGpu[i] != keysRef[i]) {
      if (keyExactMatch) firstKeyMismatchIndex = i;
      keyExactMatch = false;
    }
  }

  const bool overallExact = scoreExactMatch && keyExactMatch;

  std::printf(
      "{\"schema\":\"atlas.cutile-ace-level2.result.v1\",\"test\":\"CUTILE-ACE-01-LEVEL2\","
      "\"n\":%u,"
      "\"glyphScoreV1ExactMatch\":%s,\"glyphScoreV1FirstMismatchIndex\":%zu,"
      "\"residencyKeyPackV1ExactMatch\":%s,\"residencyKeyPackV1FirstMismatchIndex\":%zu,"
      "\"RESULT\":\"%s\"}\n",
      n,
      scoreExactMatch ? "true" : "false", scoreExactMatch ? static_cast<size_t>(0) : firstScoreMismatchIndex,
      keyExactMatch ? "true" : "false", keyExactMatch ? static_cast<size_t>(0) : firstKeyMismatchIndex,
      overallExact ? "DRY_RUN_PROVEN" : "FAIL");

  CUDA_CHECK(cudaFree(d_glyphs));
  CUDA_CHECK(cudaFree(d_scores));
  CUDA_CHECK(cudaFree(d_keys));

  return overallExact ? 0 : 1;
}
