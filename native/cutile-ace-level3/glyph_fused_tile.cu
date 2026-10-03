// CUTILE-ACE-01 LEVEL 3 -- fused cuTile challenger kernel (WSL2 only).
//
// Attempts to fuse GlyphScoreV1 + ResidencySortKeyV1 packing into ONE
// cuda::tiles-based kernel, per parent-atlas-gpu-mini-fabric-01's LEVEL 1/2/3
// discipline: LEVEL 1 (CUB, ACE-RADIX-01) and LEVEL 2 (simple unfused CUDA,
// this repo's native/cutile-ace-level2/glyph_kernels_bench.cu) already
// DRY_RUN_PROVEN. This is the first attempt at LEVEL 3 -- a real cuda::tiles
// programming-model exercise, not a stub.
//
// This file targets WSL2's atlas-rapids-cu13 conda environment (CUDA 13.3,
// a genuine 4064-line cuda::tiles C++20 API), NOT this dev host's
// Windows-native CUDA 13.0 toolkit (whose crt/cuda_tile.h is a 60-line
// compiler-intrinsic stub only -- see ACE-RADIX-01's finding, root CLAUDE.md).
//
// Per next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md
// step 4: a passing compile is NOT proof by itself -- this file is only
// "PASS" once it also exact-matches the SAME CPU oracles LEVEL 1/2 used
// (scripts/atlas/ace-radix-01/glyph-score-v1.mjs,
// generateAceRadix01FixtureV1()'s packedKeys), at runtime, on real hardware.

#include <cuda_tile.h>
#include <cuda_runtime.h>

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <vector>

using namespace cuda::tiles;

#define CUDA_CHECK(expr)                                                                   \
  do {                                                                                      \
    cudaError_t _err = (expr);                                                              \
    if (_err != cudaSuccess) {                                                               \
      std::fprintf(stderr, "CUDA error %s at %s:%d: %s\n", #expr, __FILE__, __LINE__,         \
                   cudaGetErrorString(_err));                                                \
      std::exit(1);                                                                          \
    }                                                                                        \
  } while (0)

// MUST match native/cutile-ace-level2/glyph_kernels_bench.cu's named
// constants exactly -- same rule as LEVEL 2 (design.md Decision 1).
// LEVEL 2 used __device__ __constant__ (legal in plain CUDA kernels); tile
// code rejects that ("a non-__tile__ variable cannot be used in tile code",
// found by compiling) -- constexpr compile-time literals are the tile-code
// equivalent and still satisfy "weights are named constants".
constexpr uint32_t GLYPH_SCORE_W_PAGERANK = 4;
constexpr uint32_t GLYPH_SCORE_W_RECENCY = 3;
constexpr uint32_t GLYPH_SCORE_W_RESIDENCY = 2;
constexpr uint32_t GLYPH_SCORE_W_LOD = 1;
constexpr uint32_t GLYPH_SCORE_W_FEATURE_POPCOUNT = 50;
constexpr uint32_t GLYPH_SCORE_W_FLAG_POPCOUNT = 50;

// Raw glyph record -- MUST match the 16-byte layout LEVEL 2 uses (and the
// .mjs writer produces). Structure-of-arrays would be more tile-idiomatic,
// but this keeps the SAME input binary format as LEVEL 2 so both kernels
// read byte-identical fixtures -- no new fixture generation for LEVEL 3.
#pragma pack(push, 1)
struct PackedGlyphInputV1 {
  uint32_t projectionOrdinal;
  uint16_t featureBits;
  uint8_t lod;
  uint8_t residency;
  uint16_t pagerankQuantized;
  uint16_t recency;
  uint16_t somCell; // read but never used -- not a utility signal
  uint16_t flags;
};
#pragma pack(pop)
static_assert(sizeof(PackedGlyphInputV1) == 16, "PackedGlyphInputV1 must be exactly 16 bytes");

constexpr int TILE_WIDTH = 256;
using IntTile = tile<int32_t, shape<TILE_WIDTH>>;
using U32Tile = tile<uint32_t, shape<TILE_WIDTH>>;
using U64Tile = tile<uint64_t, shape<TILE_WIDTH>>;

// cuda::tiles has no popcount builtin (verified via grep against the real
// 4064-line header -- not assumed missing). Standard SWAR bit-count,
// vectorized elementwise across the tile via ordinary arithmetic/bitwise
// tile operators (which the header DOES define). Values here only ever
// occupy the low 16 bits (featureBits/flags are uint16_t), so the 32-bit
// SWAR algorithm's high bits are always zero and safe to ignore.
//
// Real constraint found by compiling: __tile__ builtin operators (&, >>, -,
// +, *, ...) may only be invoked from within a __global__ tile-kernel body,
// NOT from a plain __device__ helper function -- nvcc rejected the first
// attempt at factoring this into a separate function ("calling a __tile__
// function ... from a __device__ function is not allowed"). Inlined via a
// macro instead of a helper function to keep this logic written once.
#define TILE_POPCOUNT32(vName)                                     \
  do {                                                              \
    (vName) = (vName) - (((vName) >> 1) & 0x55555555u);              \
    (vName) = ((vName) & 0x33333333u) + (((vName) >> 2) & 0x33333333u); \
    (vName) = ((vName) + ((vName) >> 4)) & 0x0F0F0F0Fu;               \
    (vName) = ((vName) * 0x01010101u) >> 24;                          \
  } while (0)

// Fused kernel: for each of TILE_WIDTH elements in this block's tile,
// compute BOTH GlyphScoreV1 AND the ResidencySortKeyV1 pack in one pass over
// the loaded glyph fields -- the actual "fusion" LEVEL 3 exists to prove
// (score -> key-pack in a single kernel launch/tile load, rather than LEVEL
// 2's two separate kernel launches each re-reading the glyph array).
__tile_global__ void fusedGlyphScoreAndKeyPackTileKernel(
    const uint32_t* projectionOrdinal,
    const uint16_t* featureBits,
    const uint8_t* lod,
    const uint8_t* residency,
    const uint16_t* pagerankQuantized,
    const uint16_t* recency,
    const uint16_t* flags,
    uint32_t n,
    uint32_t* outScores,
    uint64_t* outKeys) {
  // Tile code cannot read gridDim/blockDim/blockIdx/threadIdx directly
  // (verified by compiling -- nvcc rejects it: "accessing ... is
  // unsupported in tile code"). cuda::tiles::bid() is the tile-native
  // equivalent of blockIdx, confirmed against the header's own bid()
  // definition (cuda_tile.h:1783).
  IntTile localIdx = iota<IntTile>();
  int32_t base = static_cast<int32_t>(bid().x) * TILE_WIDTH;
  IntTile globalIdx = localIdx + base;
  auto mask = globalIdx < static_cast<int32_t>(n);

  auto ordinalTile = load_masked(projectionOrdinal + globalIdx, mask, 0u);
  auto featureTile = load_masked(featureBits + globalIdx, mask, static_cast<uint16_t>(0));
  auto lodTile = load_masked(lod + globalIdx, mask, static_cast<uint8_t>(0));
  auto residencyTile = load_masked(residency + globalIdx, mask, static_cast<uint8_t>(0));
  auto pagerankTile = load_masked(pagerankQuantized + globalIdx, mask, static_cast<uint16_t>(0));
  auto recencyTile = load_masked(recency + globalIdx, mask, static_cast<uint16_t>(0));
  auto flagsTile = load_masked(flags + globalIdx, mask, static_cast<uint16_t>(0));

  U32Tile pagerankU32 = pagerankTile;
  U32Tile recencyU32 = recencyTile;
  U32Tile residencyU32 = residencyTile;
  U32Tile lodU32 = lodTile;
  U32Tile featureU32 = featureTile;
  U32Tile flagsU32 = flagsTile;

  U32Tile featurePopcount = featureU32;
  TILE_POPCOUNT32(featurePopcount);
  U32Tile flagsPopcount = flagsU32;
  TILE_POPCOUNT32(flagsPopcount);

  U32Tile score =
      pagerankU32 * GLYPH_SCORE_W_PAGERANK +
      recencyU32 * GLYPH_SCORE_W_RECENCY +
      residencyU32 * 257u * GLYPH_SCORE_W_RESIDENCY +
      lodU32 * 257u * GLYPH_SCORE_W_LOD +
      featurePopcount * GLYPH_SCORE_W_FEATURE_POPCOUNT +
      flagsPopcount * GLYPH_SCORE_W_FLAG_POPCOUNT;

  U64Tile tierU64 = residencyU32;
  U64Tile lodU64 = lodU32;
  U64Tile utilityBucket = pagerankU32 / 257u;
  U64Tile recencyBucket = recencyU32 / 257u;
  U64Tile ordinalU64 = ordinalTile;

  U64Tile packedKey = (tierU64 << 56) | (lodU64 << 48) | (utilityBucket << 40) | (recencyBucket << 32) | ordinalU64;

  store_masked(outScores + globalIdx, score, mask);
  store_masked(outKeys + globalIdx, packedKey, mask);
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

  // Unpack the 16-byte interleaved format into SoA host arrays for the
  // tile kernel's per-field pointer arguments.
  std::vector<uint32_t> h_ordinal(n);
  std::vector<uint16_t> h_feature(n), h_recency(n), h_pagerank(n), h_flags(n);
  std::vector<uint8_t> h_lod(n), h_residency(n);
  for (uint32_t i = 0; i < n; ++i) {
    h_ordinal[i] = glyphs[i].projectionOrdinal;
    h_feature[i] = glyphs[i].featureBits;
    h_lod[i] = glyphs[i].lod;
    h_residency[i] = glyphs[i].residency;
    h_pagerank[i] = glyphs[i].pagerankQuantized;
    h_recency[i] = glyphs[i].recency;
    h_flags[i] = glyphs[i].flags;
  }

  uint32_t *d_ordinal, *d_scores;
  uint16_t *d_feature, *d_recency, *d_pagerank, *d_flags;
  uint8_t *d_lod, *d_residency;
  uint64_t* d_keys;
  CUDA_CHECK(cudaMalloc(&d_ordinal, n * sizeof(uint32_t)));
  CUDA_CHECK(cudaMalloc(&d_feature, n * sizeof(uint16_t)));
  CUDA_CHECK(cudaMalloc(&d_lod, n * sizeof(uint8_t)));
  CUDA_CHECK(cudaMalloc(&d_residency, n * sizeof(uint8_t)));
  CUDA_CHECK(cudaMalloc(&d_pagerank, n * sizeof(uint16_t)));
  CUDA_CHECK(cudaMalloc(&d_recency, n * sizeof(uint16_t)));
  CUDA_CHECK(cudaMalloc(&d_flags, n * sizeof(uint16_t)));
  CUDA_CHECK(cudaMalloc(&d_scores, n * sizeof(uint32_t)));
  CUDA_CHECK(cudaMalloc(&d_keys, n * sizeof(uint64_t)));

  CUDA_CHECK(cudaMemcpy(d_ordinal, h_ordinal.data(), n * sizeof(uint32_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_feature, h_feature.data(), n * sizeof(uint16_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_lod, h_lod.data(), n * sizeof(uint8_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_residency, h_residency.data(), n * sizeof(uint8_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_pagerank, h_pagerank.data(), n * sizeof(uint16_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_recency, h_recency.data(), n * sizeof(uint16_t), cudaMemcpyHostToDevice));
  CUDA_CHECK(cudaMemcpy(d_flags, h_flags.data(), n * sizeof(uint16_t), cudaMemcpyHostToDevice));

  const int blocks = static_cast<int>((n + TILE_WIDTH - 1) / TILE_WIDTH);
  fusedGlyphScoreAndKeyPackTileKernel<<<blocks, 1>>>(
      d_ordinal, d_feature, d_lod, d_residency, d_pagerank, d_recency, d_flags, n, d_scores, d_keys);
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

  std::printf(
      "{\"schema\":\"atlas.cutile-ace-level3.result.v1\",\"test\":\"CUTILE-ACE-01-LEVEL3\","
      "\"n\":%u,"
      "\"glyphScoreV1ExactMatch\":%s,\"glyphScoreV1FirstMismatchIndex\":%zu,"
      "\"residencyKeyPackV1ExactMatch\":%s,\"residencyKeyPackV1FirstMismatchIndex\":%zu,"
      "\"RESULT\":\"%s\"}\n",
      n,
      scoreExactMatch ? "true" : "false", scoreExactMatch ? static_cast<size_t>(0) : firstScoreMismatchIndex,
      keyExactMatch ? "true" : "false", keyExactMatch ? static_cast<size_t>(0) : firstKeyMismatchIndex,
      (scoreExactMatch && keyExactMatch) ? "DRY_RUN_PROVEN" : "FAIL");

  CUDA_CHECK(cudaFree(d_ordinal));
  CUDA_CHECK(cudaFree(d_feature));
  CUDA_CHECK(cudaFree(d_lod));
  CUDA_CHECK(cudaFree(d_residency));
  CUDA_CHECK(cudaFree(d_pagerank));
  CUDA_CHECK(cudaFree(d_recency));
  CUDA_CHECK(cudaFree(d_flags));
  CUDA_CHECK(cudaFree(d_scores));
  CUDA_CHECK(cudaFree(d_keys));
  return (scoreExactMatch && keyExactMatch) ? 0 : 1;
}
