/**
 * N-API Native Addon: tensorrt_bridge
 *
 * Exposes GPU-accelerated functions to Node.js via TypedArrays:
 *   - bridgeSIMD(json: string) → number
 *   - checkCudaAvailable() → number (1 = CUDA, 0 = CPU)
 *   - graphSimilarity(Float32Array, n, dim) → Float32Array[n*n]
 *   - clusterEmbeddings(Float32Array, n, dim, k, maxIters) → Int32Array[n]
 *   - computeCaseEmbedding(Float32Array weights, Float32Array embeddings, n, dim) → Float32Array[dim]
 *
 * ArrayBuffer Pool:
 *   All typed-array outputs are backed by a thread_local free-list pool
 *   (g_ab_pool) keyed by power-of-2 byte capacity.  When V8 GCs the JS
 *   ArrayBuffer, pool_finalizer() either returns the raw allocation to the
 *   bucket (if not full) or free()s it.  This eliminates the per-call
 *   malloc/free churn that dominated profiling on RTX 3060 Ti (sm_86).
 *
 *   Sizing: min bucket = 64 bytes (one cache line); max 8 buffers per bucket;
 *   no global cap — pool naturally self-sizes to the hot working set.
 */

#include <cassert>
#if __has_include(<node_api.h>)
#include <node_api.h>
#else
#include <cstddef>
#include <cstdint>
#include <cstdlib>

using napi_env             = void*;
using napi_value           = void*;
using napi_callback_info   = void*;
using napi_status          = int32_t;
using napi_valuetype       = int32_t;
using napi_typedarray_type = int32_t;
using napi_finalize        = void(*)(napi_env env, void* finalize_data, void* finalize_hint);

enum : uint8_t { napi_ok = 0, napi_generic_failure = 1 };
enum : uint8_t { napi_string = 1 };
enum : uint8_t { napi_float32_array = 0, napi_int32_array = 4 };

#define NAPI_AUTO_LENGTH ((size_t)-1)

extern "C" {
napi_status napi_get_cb_info(napi_env, napi_callback_info, size_t*, napi_value*, napi_value*, void**);
napi_status napi_throw_error(napi_env, const char*, const char*);
napi_status napi_throw_type_error(napi_env, const char*, const char*);
napi_status napi_typeof(napi_env, napi_value, napi_valuetype*);
napi_status napi_get_value_string_utf8(napi_env, napi_value, char*, size_t, size_t*);
napi_status napi_get_value_int32(napi_env, napi_value, int32_t*);
napi_status napi_get_value_double(napi_env, napi_value, double*);
napi_status napi_create_int32(napi_env, int32_t, napi_value*);
napi_status napi_create_double(napi_env, double, napi_value*);
napi_status napi_create_function(napi_env, const char*, size_t, napi_value(*)(napi_env, napi_callback_info), void*, napi_value*);
napi_status napi_set_named_property(napi_env, napi_value, const char*, napi_value);
napi_status napi_get_typedarray_info(napi_env, napi_value, napi_typedarray_type*, size_t*, void**, napi_value*, size_t*);
napi_status napi_create_typedarray(napi_env, napi_typedarray_type, size_t, napi_value, size_t, napi_value*);
napi_status napi_create_arraybuffer(napi_env, size_t, void**, napi_value*);
napi_status napi_create_external_arraybuffer(napi_env, void*, size_t, napi_finalize, void*, napi_value*);
napi_status napi_create_object(napi_env, napi_value*);
}

#ifndef NAPI_MODULE
#define NAPI_MODULE(modname, regfunc)
#endif
#endif

#include <unordered_map>
#include <vector>
#include <cstring>

#include "gpu_error_codes.h"

// External C functions from other compilation units
extern "C" int bridgeSIMDToTensorRT(const char* json);

// pytorch_graph.cc (pageRank, attention, reward, softmax, topK, kMeans, SOM)
extern "C" int pageRankGPU(const float* adj, int n, float damping, int iters, float* out, int out_len);
extern "C" int attentionScoreGPU(const float* query, int dim, const float* keys, int n, float* out, int out_len);
extern "C" int rewardScoreGPU(const float* gen, const float* ref, int n, int dim, float* out, int out_len);
extern "C" int softmaxGPU(const float* logits, int n, float* out, int out_len);
extern "C" int topKIndicesGPU(const float* scores, int n, int k, int* out, int out_len);
extern "C" int kmeansWithCentroids(const float* embeddings, int n, int dim, int k, int max_iters,
                                    int* assignments_out, int assignments_len,
                                    float* centroids_out, int centroids_len,
                                    int* out_reseeded_count);
extern "C" int trainSOM(const float* data, int n, int dim, int grid_w, int grid_h,
                         int iters, float lr_init, float lr_final,
                         float radius_init, float radius_final,
                         float* weights_out, int weights_len, int* bmu_out, int bmu_len);

// LibTorch graph analysis (libtorch_graph.cc)
extern "C" int graphSimilarity(const float* embeddings, int n, int dim, float* output, int output_len);
extern "C" int clusterEmbeddings(const float* embeddings, int n, int dim, int k, int max_iters, int* assignments, int assignments_len, int* out_reseeded_count);
extern "C" int computeCaseEmbedding(const float* weights, int n, const float* embeddings, int dim, float* output, int output_len);
extern "C" int checkCudaAvailable();
extern "C" int getCudaMemory(int64_t* free_bytes, int64_t* total_bytes);
extern "C" int batchCosineSimilarity(const float* query, int dim, const float* corpus, int n, float* scores, int scores_len);
extern "C" int graphSimilarityHalf(const float* embeddings, int n, int dim, float* output, int output_len);

// LSTM bridge (lstm_bridge.cc → lstm_gpu.cu)
extern "C" int bridge_run_lstm(const float* a, const float* b, float* out, int n);
extern "C" int bridge_dot_product(const float* a, const float* b, float* out, int n);
extern "C" int bridge_scale(const float* in, float* out, float scalar, int n);
extern "C" int bridge_relu(const float* in, float* out, int n);

// SOM cache (som_cache.cu)
extern "C" void runSOMCache(const float* in, float* out, int n);

// simdjson bridge (simdjson_bridge.cc)
extern "C" napi_value RegisterSimdJsonParse(napi_env env, napi_callback_info info);
extern "C" napi_value RegisterSimdJsonValidate(napi_env env, napi_callback_info info);
extern "C" napi_value RegisterSimdJsonExtractNumbers(napi_env env, napi_callback_info info);
extern "C" napi_value RegisterSimdJsonBackend(napi_env env, napi_callback_info info);

// ── ArrayBuffer pool ─────────────────────────────────────────────────────────
//
// Strategy: napi_create_external_arraybuffer transfers ownership of a raw
// malloc'd region to V8.  When V8 GCs the backing store, pool_finalizer fires
// and either recycles the region into g_ab_pool or free()s it.
//
// thread_local is correct here: all N-API callbacks for a given V8 isolate
// execute on the same OS thread, so there is no concurrent access to the pool.
// Worker threads (worker_threads module) each get their own thread_local
// instance automatically — no mutex needed anywhere.
//
// Bucket key = power-of-2 byte capacity (min 64 bytes = one cache line).
// Minimum 64 bytes ensures natural alignment for AVX2 loads (32-byte aligned
// addresses within 64-byte regions), which matters for sm_86 GPU data prep.

static constexpr size_t AB_POOL_MAX_PER_BUCKET = 8;

static thread_local std::unordered_map<size_t, std::vector<void*>> g_ab_pool;

// Portable branch-prediction hints.
// MSVC takes the first branch (no __builtin_expect).
// GCC/Clang (Linux/WSL2 target, CUDA host compiler) take the second.
// The _MSC_VER guard avoids C4067 "unexpected tokens after #if" that MSVC
// emits when it encounters __has_builtin(__builtin_expect) in the condition.
#if defined(_MSC_VER)
#  define AB_LIKELY(x)   (x)
#  define AB_UNLIKELY(x) (x)
#elif defined(__has_builtin) && __has_builtin(__builtin_expect)
#  define AB_LIKELY(x)   __builtin_expect(!!(x), 1)
#  define AB_UNLIKELY(x) __builtin_expect(!!(x), 0)
#else
#  define AB_LIKELY(x)   (x)
#  define AB_UNLIKELY(x) (x)
#endif

// Round up n to the next power of 2, minimum 64 (one L1 cache line).
static inline size_t ab_next_pow2(size_t n) {
    if (n <= 64u) return 64u;
    size_t p = 64u;
    while (p < n) p <<= 1u;
    return p;
}

// V8 GC finalizer — called when the JS ArrayBuffer becomes unreachable.
// hint encodes the power-of-2 capacity so we return to the correct bucket.
static void pool_finalizer(napi_env /*env*/, void* data, void* hint) {
    const size_t cap = reinterpret_cast<size_t>(hint);
    auto& bucket = g_ab_pool[cap];
    if (bucket.size() < AB_POOL_MAX_PER_BUCKET) {
        bucket.push_back(data);  // recycle — no free()
    } else {
        free(data);              // bucket full — release to OS
    }
}

// Acquire a buffer of at least `bytes` from the pool (or malloc a new one).
// Zeros only the *used* portion so callers get clean output without paying
// to zero the entire power-of-2 allocation.
static void* pool_acquire(size_t bytes, size_t* cap_out) {
    const size_t cap = ab_next_pow2(bytes);
    *cap_out = cap;
    auto& bucket = g_ab_pool[cap];
    // Hot path: pool hit — AB_LIKELY keeps the branch predictor on the fast lane.
    if (AB_LIKELY(!bucket.empty())) {
        void* ptr = bucket.back();
        bucket.pop_back();
        memset(ptr, 0, bytes);  // zero used region only
        return ptr;
    }
    // Cold path (first call per bucket size) — allocate a fresh block.
    // malloc on x86-64 returns 16-byte-aligned memory; sufficient for AVX2
    // unaligned loads used inside the GPU kernels.
    void* ptr = malloc(cap);
    if (AB_LIKELY(ptr != nullptr)) { memset(ptr, 0, bytes); }
    return ptr;
}

// Create an external ArrayBuffer backed by a pooled allocation.
// Replaces every napi_create_arraybuffer call in this file.
// AB_UNLIKELY on null: malloc rarely fails in a healthy Node.js process —
// keeps the happy-path instructions in the L1 I-cache.
static napi_status create_pooled_ab(napi_env env, size_t bytes,
                                     void** out_data, napi_value* out_ab) {
    size_t cap = 0;
    void* ptr = pool_acquire(bytes, &cap);
    if (AB_UNLIKELY(ptr == nullptr)) { return napi_generic_failure; }
    *out_data = ptr;
    // hint = capacity as void* — recovered in pool_finalizer to pick bucket.
    return napi_create_external_arraybuffer(
        env, ptr, bytes,
        pool_finalizer,
        reinterpret_cast<void*>(cap),
        out_ab
    );
}

// ── Helpers ──────────────────────────────────────────────────────────

static napi_value throw_type_error(napi_env env, const char *msg) {
  napi_throw_type_error(env, nullptr, msg);
  return nullptr;
}

static napi_value throw_error(napi_env env, const char *msg) {
  napi_throw_error(env, nullptr, msg);
  return nullptr;
}

static napi_status registerFn(napi_env env, napi_value exports,
                               const char* name,
                               napi_value (*cb)(napi_env, napi_callback_info)) {
  napi_value fn;
  napi_status s = napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, nullptr, &fn);
  if (s != napi_ok) return s;
  return napi_set_named_property(env, exports, name, fn);
}

// ── BridgeSIMD(json: string) → number ───────────────────────────────

static napi_value BridgeSIMD(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 1) return throw_type_error(env, "Expected one argument (JSON string)");

  napi_valuetype t;
  napi_typeof(env, argv[0], &t);
  if (t != napi_string) return throw_type_error(env, "Expected a JSON string");

  size_t str_len = 0;
  napi_get_value_string_utf8(env, argv[0], nullptr, 0, &str_len);
  std::vector<char> buf(str_len + 1);
  napi_get_value_string_utf8(env, argv[0], buf.data(), buf.size(), &str_len);
  buf[str_len] = '\0';

  int r = bridgeSIMDToTensorRT(buf.data());
  napi_value result;
  napi_create_int32(env, r, &result);
  return result;
}

// ── CheckCuda() → number (1=CUDA, 0=CPU) ────────────────────────────

static napi_value CheckCuda(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  napi_create_int32(env, checkCudaAvailable(), &result);
  return result;
}

// ── GraphSimilarity(Float32Array, n, dim) → Float32Array[n*n] ────────

static napi_value GraphSimilarityWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 3) return throw_type_error(env, "graphSimilarity(Float32Array, n, dim)");

  // Get typed array data
  napi_typedarray_type arr_type;
  size_t arr_len;
  void* arr_data;
  napi_get_typedarray_info(env, argv[0], &arr_type, &arr_len, &arr_data, nullptr, nullptr);

  int32_t n, dim;
  napi_get_value_int32(env, argv[1], &n);
  napi_get_value_int32(env, argv[2], &dim);

  if (n <= 0 || dim <= 0 || (size_t)(n * dim) > arr_len)
    return throw_type_error(env, "Invalid dimensions for embeddings array");

  // Allocate output: n*n float32 values — pooled
  int output_len = n * n;
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)output_len * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "graphSimilarity: output allocation failed");

  int rc = graphSimilarity((const float*)arr_data, n, dim, (float*)out_data, output_len);
  if (rc != 0) return throw_error(env, "graphSimilarity failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, output_len, arraybuffer, 0, &result);
  return result;
}

// ── ClusterEmbeddings(Float32Array, n, dim, k, maxIters) → Int32Array[n] ─

static napi_value ClusterEmbeddingsWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value argv[5];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 5) return throw_type_error(env, "clusterEmbeddings(Float32Array, n, dim, k, maxIters)");

  napi_typedarray_type arr_type;
  size_t arr_len;
  void* arr_data;
  napi_get_typedarray_info(env, argv[0], &arr_type, &arr_len, &arr_data, nullptr, nullptr);

  int32_t n, dim, k, max_iters;
  napi_get_value_int32(env, argv[1], &n);
  napi_get_value_int32(env, argv[2], &dim);
  napi_get_value_int32(env, argv[3], &k);
  napi_get_value_int32(env, argv[4], &max_iters);

  if (n <= 0 || dim <= 0 || k <= 0 || (size_t)(n * dim) > arr_len)
    return throw_type_error(env, "Invalid dimensions for cluster input");

  // Allocate output: n int32 assignments — pooled
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)n * sizeof(int32_t), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "clusterEmbeddings: output allocation failed");

  int rc = clusterEmbeddings((const float*)arr_data, n, dim, k, max_iters, (int*)out_data, n);
  if (rc != 0) return throw_error(env, "clusterEmbeddings failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_int32_array, n, arraybuffer, 0, &result);
  return result;
}

// ── ComputeCaseEmbedding(Float32Array weights, Float32Array embeddings, n, dim) → Float32Array[dim] ─

static napi_value ComputeCaseEmbeddingWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 4;
  napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 4) return throw_type_error(env, "computeCaseEmbedding(Float32Array weights, Float32Array embeddings, n, dim)");

  // Weights array
  size_t w_len;
  void* w_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &w_len, &w_data, nullptr, nullptr);

  // Embeddings array
  size_t e_len;
  void* e_data;
  napi_get_typedarray_info(env, argv[1], nullptr, &e_len, &e_data, nullptr, nullptr);

  int32_t n, dim;
  napi_get_value_int32(env, argv[2], &n);
  napi_get_value_int32(env, argv[3], &dim);

  if (n <= 0 || dim <= 0 || (size_t)n > w_len || (size_t)(n * dim) > e_len)
    return throw_type_error(env, "Invalid dimensions for weighted embedding input");

  // Allocate output: dim float32 values — pooled
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)dim * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "computeCaseEmbedding: output allocation failed");

  int rc = computeCaseEmbedding((const float*)w_data, n, (const float*)e_data, dim, (float*)out_data, dim);
  if (rc != 0) return throw_error(env, "computeCaseEmbedding failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, dim, arraybuffer, 0, &result);
  return result;
}

// ── LSTMAdd(Float32Array a, Float32Array b, n) → Float32Array[n] ─────

static napi_value LSTMAddWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 3) return throw_type_error(env, "lstmAdd(Float32Array a, Float32Array b, n)");

  size_t a_len;
  void* a_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &a_len, &a_data, nullptr, nullptr);

  size_t b_len;
  void* b_data;
  napi_get_typedarray_info(env, argv[1], nullptr, &b_len, &b_data, nullptr, nullptr);

  int32_t n;
  napi_get_value_int32(env, argv[2], &n);

  if (n <= 0 || (size_t)n > a_len || (size_t)n > b_len)
    return throw_type_error(env, "Invalid length for LSTM add input");

  // Pooled output
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "lstmAdd: output allocation failed");

  int rc = bridge_run_lstm((const float*)a_data, (const float*)b_data, (float*)out_data, n);
  if (rc != 0) return throw_error(env, "LSTM add failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, arraybuffer, 0, &result);
  return result;
}

// ── SOMCache(Float32Array in, n) → Float32Array[n] ───────────────────

static napi_value SOMCacheWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 2) return throw_type_error(env, "somCache(Float32Array in, n)");

  size_t in_len;
  void* in_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &in_len, &in_data, nullptr, nullptr);

  int32_t n;
  napi_get_value_int32(env, argv[1], &n);

  if (n <= 0 || (size_t)n > in_len)
    return throw_type_error(env, "Invalid length for SOM cache input");

  // Pooled output
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "somCache: output allocation failed");

  runSOMCache((const float*)in_data, (float*)out_data, n);

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, arraybuffer, 0, &result);
  return result;
}

// ── DotProduct(Float32Array a, Float32Array b, n) → Float32Array[1] ──

static napi_value DotProductWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 3) return throw_type_error(env, "dotProduct(Float32Array a, Float32Array b, n)");

  size_t a_len;
  void* a_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &a_len, &a_data, nullptr, nullptr);

  size_t b_len;
  void* b_data;
  napi_get_typedarray_info(env, argv[1], nullptr, &b_len, &b_data, nullptr, nullptr);

  int32_t n;
  napi_get_value_int32(env, argv[2], &n);

  if (n <= 0 || (size_t)n > a_len || (size_t)n > b_len)
    return throw_type_error(env, "Invalid length for dot product input");

  // Pooled output — min bucket is 64 bytes, 1 float fits with margin
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "dotProduct: output allocation failed");

  int rc = bridge_dot_product((const float*)a_data, (const float*)b_data, (float*)out_data, n);
  if (rc != 0) return throw_error(env, "dotProduct failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, 1, arraybuffer, 0, &result);
  return result;
}

// ── Scale(Float32Array in, scalar, n) → Float32Array[n] ──────────────

static napi_value ScaleWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 3;
  napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 3) return throw_type_error(env, "scale(Float32Array in, scalar, n)");

  size_t in_len;
  void* in_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &in_len, &in_data, nullptr, nullptr);

  // Get scalar as double then cast to float
  double scalar_d;
  napi_get_value_double(env, argv[1], &scalar_d);
  float scalar = (float)scalar_d;

  int32_t n;
  napi_get_value_int32(env, argv[2], &n);

  if (n <= 0 || (size_t)n > in_len)
    return throw_type_error(env, "Invalid length for scale input");

  // Pooled output
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "scale: output allocation failed");

  int rc = bridge_scale((const float*)in_data, (float*)out_data, scalar, n);
  if (rc != 0) return throw_error(env, "scale failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, arraybuffer, 0, &result);
  return result;
}

// ── ReLU(Float32Array in, n) → Float32Array[n] ──────────────────────

static napi_value ReLUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 2) return throw_type_error(env, "relu(Float32Array in, n)");

  size_t in_len;
  void* in_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &in_len, &in_data, nullptr, nullptr);

  int32_t n;
  napi_get_value_int32(env, argv[1], &n);

  if (n <= 0 || (size_t)n > in_len)
    return throw_type_error(env, "Invalid length for ReLU input");

  // Pooled output
  void* out_data;
  napi_value arraybuffer;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &arraybuffer) != napi_ok)
    return throw_error(env, "relu: output allocation failed");

  int rc = bridge_relu((const float*)in_data, (float*)out_data, n);
  if (rc != 0) return throw_error(env, "relu failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, arraybuffer, 0, &result);
  return result;
}

// ── GetCudaMemory(BigInt64Array free, BigInt64Array total) → number ──

static napi_value GetCudaMemoryWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 2;
  napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 2) return throw_type_error(env, "getCudaMemory(BigInt64Array free, BigInt64Array total)");

  size_t f_len;
  void* f_data;
  napi_get_typedarray_info(env, argv[0], nullptr, &f_len, &f_data, nullptr, nullptr);

  size_t t_len;
  void* t_data;
  napi_get_typedarray_info(env, argv[1], nullptr, &t_len, &t_data, nullptr, nullptr);

  if (f_len < 1 || t_len < 1)
    return throw_type_error(env, "Output arrays must have at least 1 element");

  int rc = getCudaMemory((int64_t*)f_data, (int64_t*)t_data);
  napi_value result;
  napi_create_int32(env, rc, &result);
  return result;
}

// ── BatchCosineSimilarity(Float32Array query, dim, Float32Array corpus, n, Float32Array scores, scoresLen) → number ─

static napi_value BatchCosineSimilarityWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 6;
  napi_value argv[6];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 6) return throw_type_error(env, "batchCosineSimilarity(query, dim, corpus, n, scores, scoresLen)");

  void* q_data;
  napi_get_typedarray_info(env, argv[0], nullptr, nullptr, &q_data, nullptr, nullptr);

  int32_t dim;
  napi_get_value_int32(env, argv[1], &dim);

  void* c_data;
  napi_get_typedarray_info(env, argv[2], nullptr, nullptr, &c_data, nullptr, nullptr);

  int32_t n;
  napi_get_value_int32(env, argv[3], &n);

  void* s_data;
  napi_get_typedarray_info(env, argv[4], nullptr, nullptr, &s_data, nullptr, nullptr);

  int32_t scores_len;
  napi_get_value_int32(env, argv[5], &scores_len);

  int rc = batchCosineSimilarity((const float*)q_data, dim, (const float*)c_data, n, (float*)s_data, scores_len);
  napi_value result;
  napi_create_int32(env, rc, &result);
  return result;
}

// ── GraphSimilarityHalf(Float32Array embeddings, n, dim, Float32Array output, outputLen) → number ─

static napi_value GraphSimilarityHalfWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 5;
  napi_value argv[5];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);

  if (argc < 5) return throw_type_error(env, "graphSimilarityHalf(embeddings, n, dim, output, outputLen)");

  void* in_data;
  napi_get_typedarray_info(env, argv[0], nullptr, nullptr, &in_data, nullptr, nullptr);

  int32_t n, dim;
  napi_get_value_int32(env, argv[1], &n);
  napi_get_value_int32(env, argv[2], &dim);

  void* out_data;
  napi_get_typedarray_info(env, argv[3], nullptr, nullptr, &out_data, nullptr, nullptr);

  int32_t output_len;
  napi_get_value_int32(env, argv[4], &output_len);

  int rc = graphSimilarityHalf((const float*)in_data, n, dim, (float*)out_data, output_len);
  napi_value result;
  napi_create_int32(env, rc, &result);
  return result;
}

// ── PageRankGPU(Float32Array adj, n, damping, iters) → Float32Array[n] ──────

static napi_value PageRankGPUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 4; napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 4) return throw_type_error(env, "pageRankGPU(Float32Array adj, n, damping, iters)");
  void* adj_data; size_t adj_len;
  napi_get_typedarray_info(env, argv[0], nullptr, &adj_len, &adj_data, nullptr, nullptr);
  int32_t n; napi_get_value_int32(env, argv[1], &n);
  double damping_d; napi_get_value_double(env, argv[2], &damping_d); float damping = (float)damping_d;
  int32_t iters; napi_get_value_int32(env, argv[3], &iters);
  if (n <= 0 || (size_t)(n * n) > adj_len) return throw_type_error(env, "adj must have n*n elements");
  // Pooled output
  void* out_data; napi_value ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &ab) != napi_ok)
    return throw_error(env, "pageRankGPU: output allocation failed");
  if (pageRankGPU((const float*)adj_data, n, damping, iters, (float*)out_data, n) != 0)
    return throw_error(env, "pageRankGPU failed");
  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, ab, 0, &result);
  return result;
}

// ── AttentionScoreGPU(Float32Array query, dim, Float32Array keys, n) → Float32Array[n] ─

static napi_value AttentionScoreGPUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 4; napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 4) return throw_type_error(env, "attentionScoreGPU(query, dim, keys, n)");
  void* q_data; napi_get_typedarray_info(env, argv[0], nullptr, nullptr, &q_data, nullptr, nullptr);
  int32_t dim; napi_get_value_int32(env, argv[1], &dim);
  void* k_data; napi_get_typedarray_info(env, argv[2], nullptr, nullptr, &k_data, nullptr, nullptr);
  int32_t n; napi_get_value_int32(env, argv[3], &n);
  if (dim <= 0 || n <= 0) return throw_type_error(env, "dim and n must be positive");
  // Pooled output
  void* out_data; napi_value ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &ab) != napi_ok)
    return throw_error(env, "attentionScoreGPU: output allocation failed");
  if (attentionScoreGPU((const float*)q_data, dim, (const float*)k_data, n, (float*)out_data, n) != 0)
    return throw_error(env, "attentionScoreGPU failed");
  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, ab, 0, &result);
  return result;
}

// ── RewardScoreGPU(Float32Array gen, Float32Array ref, n, dim) → Float32Array[n] ─

static napi_value RewardScoreGPUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 4; napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 4) return throw_type_error(env, "rewardScoreGPU(gen, ref, n, dim)");
  void* g_data; napi_get_typedarray_info(env, argv[0], nullptr, nullptr, &g_data, nullptr, nullptr);
  void* r_data; napi_get_typedarray_info(env, argv[1], nullptr, nullptr, &r_data, nullptr, nullptr);
  int32_t n; napi_get_value_int32(env, argv[2], &n);
  int32_t dim; napi_get_value_int32(env, argv[3], &dim);
  if (n <= 0 || dim <= 0) return throw_type_error(env, "n and dim must be positive");
  // Pooled output
  void* out_data; napi_value ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &ab) != napi_ok)
    return throw_error(env, "rewardScoreGPU: output allocation failed");
  if (rewardScoreGPU((const float*)g_data, (const float*)r_data, n, dim, (float*)out_data, n) != 0)
    return throw_error(env, "rewardScoreGPU failed");
  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, ab, 0, &result);
  return result;
}

// ── SoftmaxGPU(Float32Array logits, n) → Float32Array[n] ────────────────────

static napi_value SoftmaxGPUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 2; napi_value argv[2];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 2) return throw_type_error(env, "softmaxGPU(Float32Array logits, n)");
  void* in_data; size_t in_len;
  napi_get_typedarray_info(env, argv[0], nullptr, &in_len, &in_data, nullptr, nullptr);
  int32_t n; napi_get_value_int32(env, argv[1], &n);
  if (n <= 0 || (size_t)n > in_len) return throw_type_error(env, "n exceeds array length");
  // Pooled output
  void* out_data; napi_value ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(float), &out_data, &ab) != napi_ok)
    return throw_error(env, "softmaxGPU: output allocation failed");
  if (softmaxGPU((const float*)in_data, n, (float*)out_data, n) != 0)
    return throw_error(env, "softmaxGPU failed");
  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, ab, 0, &result);
  return result;
}

// ── TopKIndicesGPU(Float32Array scores, n, k) → Int32Array[k] ───────────────

static napi_value TopKIndicesGPUWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 3; napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 3) return throw_type_error(env, "topKIndicesGPU(Float32Array scores, n, k)");
  void* s_data; size_t s_len;
  napi_get_typedarray_info(env, argv[0], nullptr, &s_len, &s_data, nullptr, nullptr);
  int32_t n; napi_get_value_int32(env, argv[1], &n);
  int32_t k; napi_get_value_int32(env, argv[2], &k);
  if (n <= 0 || k <= 0 || k > n || (size_t)n > s_len) return throw_type_error(env, "invalid n/k");
  // Pooled output
  void* out_data; napi_value ab;
  if (create_pooled_ab(env, (size_t)k * sizeof(int32_t), &out_data, &ab) != napi_ok)
    return throw_error(env, "topKIndicesGPU: output allocation failed");
  if (topKIndicesGPU((const float*)s_data, n, k, (int*)out_data, k) != 0)
    return throw_error(env, "topKIndicesGPU failed");
  napi_value result;
  napi_create_typedarray(env, napi_int32_array, k, ab, 0, &result);
  return result;
}

// ── KmeansWithCentroids(Float32Array embeddings, n, dim, k, maxIters) → { assignments: Int32Array[n], centroids: Float32Array[k*dim] } ─
// TypeScript unpacks with Int32Array.from() and Float32Array.subarray().

static napi_value KmeansWithCentroidsWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 5; napi_value argv[5];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 5) return throw_type_error(env, "kmeansWithCentroids(Float32Array, n, dim, k, maxIters)");

  void* emb_data; size_t emb_len;
  napi_get_typedarray_info(env, argv[0], nullptr, &emb_len, &emb_data, nullptr, nullptr);
  int32_t n, dim, k, max_iters;
  napi_get_value_int32(env, argv[1], &n);
  napi_get_value_int32(env, argv[2], &dim);
  napi_get_value_int32(env, argv[3], &k);
  napi_get_value_int32(env, argv[4], &max_iters);
  if (n <= 0 || dim <= 0 || k <= 0 || (size_t)(n * dim) > emb_len)
    return throw_type_error(env, "kmeansWithCentroids: invalid dimensions");

  // Allocate assignments (int32) and centroids (float32) — both pooled
  void* a_data; napi_value a_ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(int32_t), &a_data, &a_ab) != napi_ok)
    return throw_error(env, "kmeansWithCentroids: assignments allocation failed");
  void* c_data; napi_value c_ab;
  if (create_pooled_ab(env, (size_t)k * dim * sizeof(float), &c_data, &c_ab) != napi_ok)
    return throw_error(env, "kmeansWithCentroids: centroids allocation failed");

  int rc = kmeansWithCentroids((const float*)emb_data, n, dim, k, max_iters,
                                (int*)a_data, n, (float*)c_data, k * dim);
  if (rc < 0) return throw_error(env, "kmeansWithCentroids failed");

  // Return [assignments: Int32Array, centroids: Float32Array] as a 2-element JS Array
  napi_value assignments, centroids;
  napi_create_typedarray(env, napi_int32_array,   (size_t)n,         a_ab, 0, &assignments);
  napi_create_typedarray(env, napi_float32_array, (size_t)(k * dim), c_ab, 0, &centroids);

  // Build result object { assignments, centroids }
  napi_value obj;
  napi_create_object(env, &obj);
  napi_set_named_property(env, obj, "assignments", assignments);
  napi_set_named_property(env, obj, "centroids", centroids);
  return obj;
}

// ── TrainSOM(Float32Array data, n, dim, gridW, gridH, iters, lrInit, lrFinal, radInit, radFinal) ─
// Returns { weights: Float32Array[gridW*gridH*dim], bmu: Int32Array[n] }

static napi_value TrainSOMWrapper(napi_env env, napi_callback_info info) {
  size_t argc = 10; napi_value argv[10];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc < 10) return throw_type_error(env, "trainSOM(data, n, dim, gridW, gridH, iters, lrInit, lrFinal, radInit, radFinal)");

  void* data_ptr; size_t data_len;
  napi_get_typedarray_info(env, argv[0], nullptr, &data_len, &data_ptr, nullptr, nullptr);
  int32_t n, dim, grid_w, grid_h, iters;
  napi_get_value_int32(env, argv[1], &n);
  napi_get_value_int32(env, argv[2], &dim);
  napi_get_value_int32(env, argv[3], &grid_w);
  napi_get_value_int32(env, argv[4], &grid_h);
  napi_get_value_int32(env, argv[5], &iters);
  double lr_i_d, lr_f_d, r_i_d, r_f_d;
  napi_get_value_double(env, argv[6], &lr_i_d);
  napi_get_value_double(env, argv[7], &lr_f_d);
  napi_get_value_double(env, argv[8], &r_i_d);
  napi_get_value_double(env, argv[9], &r_f_d);
  if (n <= 0 || dim <= 0 || grid_w <= 0 || grid_h <= 0 || iters <= 0)
    return throw_type_error(env, "trainSOM: invalid dimensions");

  const int neurons = grid_w * grid_h;
  // Pooled outputs
  void* w_data; napi_value w_ab;
  if (create_pooled_ab(env, (size_t)neurons * dim * sizeof(float), &w_data, &w_ab) != napi_ok)
    return throw_error(env, "trainSOM: weights allocation failed");
  void* b_data; napi_value b_ab;
  if (create_pooled_ab(env, (size_t)n * sizeof(int32_t), &b_data, &b_ab) != napi_ok)
    return throw_error(env, "trainSOM: bmu allocation failed");

  int rc = trainSOM((const float*)data_ptr, n, dim, grid_w, grid_h, iters,
                     (float)lr_i_d, (float)lr_f_d, (float)r_i_d, (float)r_f_d,
                     (float*)w_data, neurons * dim, (int*)b_data, n);
  if (rc < 0) return throw_error(env, "trainSOM failed");

  napi_value weights, bmu, obj;
  napi_create_typedarray(env, napi_float32_array, (size_t)neurons * dim, w_ab, 0, &weights);
  napi_create_typedarray(env, napi_int32_array,   (size_t)n,             b_ab, 0, &bmu);
  napi_create_object(env, &obj);
  napi_set_named_property(env, obj, "weights", weights);
  napi_set_named_property(env, obj, "bmu",     bmu);
  return obj;
}

// ── PoolStats() → { totalBuckets, totalPooled, totalCapacityBytes } ──────────
//
// Exposes the ArrayBuffer pool's runtime state for Langfuse / admin dashboards.
// Call from TypeScript: addon.poolStats() → { totalBuckets, totalPooled, totalCapacityBytes }
//
//   totalBuckets       — number of distinct power-of-2 capacity buckets with >= 1 entry
//   totalPooled        — total buffers currently sitting in the pool (not in use by V8)
//   totalCapacityBytes — sum of (capacity × count) across all buckets (upper bound on
//                        reclaimed bytes; actual used bytes = sum of sizes at acquire time)
//
// This is deliberately read-only and lock-free: it reads thread_local g_ab_pool
// from the N-API callback thread (same thread that writes the pool).

static napi_value PoolStatsWrapper(napi_env env, napi_callback_info info) {
  (void)info;

  size_t totalBuckets = 0;
  size_t totalPooled  = 0;
  size_t totalCapacityBytes = 0;

  for (const auto& kv : g_ab_pool) {
    if (!kv.second.empty()) {
      totalBuckets++;
      totalPooled       += kv.second.size();
      totalCapacityBytes += kv.first * kv.second.size(); // capacity × count
    }
  }

  napi_value obj, vBuckets, vPooled, vBytes;
  napi_create_object(env, &obj);
  napi_create_int32(env, static_cast<int32_t>(totalBuckets), &vBuckets);
  napi_create_int32(env, static_cast<int32_t>(totalPooled),  &vPooled);
  // Use double for byte counts — may exceed 2^31 on memory-heavy workloads
  napi_create_double(env, static_cast<double>(totalCapacityBytes), &vBytes);
  napi_set_named_property(env, obj, "totalBuckets",       vBuckets);
  napi_set_named_property(env, obj, "totalPooled",        vPooled);
  napi_set_named_property(env, obj, "totalCapacityBytes", vBytes);
  return obj;
}

// ── Module Init ──────────────────────────────────────────────────────

static napi_value Init(napi_env env, napi_value exports) {
  registerFn(env, exports, "bridgeSIMD", BridgeSIMD);
  registerFn(env, exports, "checkCudaAvailable", CheckCuda);
  registerFn(env, exports, "graphSimilarity", GraphSimilarityWrapper);
  registerFn(env, exports, "clusterEmbeddings", ClusterEmbeddingsWrapper);
  registerFn(env, exports, "computeCaseEmbedding", ComputeCaseEmbeddingWrapper);
  registerFn(env, exports, "lstmAdd", LSTMAddWrapper);
  registerFn(env, exports, "somCache", SOMCacheWrapper);
  registerFn(env, exports, "dotProduct", DotProductWrapper);
  registerFn(env, exports, "scale", ScaleWrapper);
  registerFn(env, exports, "relu", ReLUWrapper);
  // GPU memory + advanced graph ops
  registerFn(env, exports, "getCudaMemory", GetCudaMemoryWrapper);
  registerFn(env, exports, "batchCosineSimilarity", BatchCosineSimilarityWrapper);
  registerFn(env, exports, "graphSimilarityHalf", GraphSimilarityHalfWrapper);
  // pytorch_graph: graph analysis + ML ops
  registerFn(env, exports, "pageRankGPU", PageRankGPUWrapper);
  registerFn(env, exports, "attentionScoreGPU", AttentionScoreGPUWrapper);
  registerFn(env, exports, "rewardScoreGPU", RewardScoreGPUWrapper);
  registerFn(env, exports, "softmaxGPU", SoftmaxGPUWrapper);
  registerFn(env, exports, "topKIndicesGPU", TopKIndicesGPUWrapper);
  registerFn(env, exports, "kmeansWithCentroids", KmeansWithCentroidsWrapper);
  registerFn(env, exports, "trainSOM", TrainSOMWrapper);
  // ArrayBuffer pool telemetry
  registerFn(env, exports, "poolStats", PoolStatsWrapper);
  // simdjson functions
  registerFn(env, exports, "simdJsonParse", RegisterSimdJsonParse);
  registerFn(env, exports, "simdJsonValidate", RegisterSimdJsonValidate);
  registerFn(env, exports, "simdJsonExtractNumbers", RegisterSimdJsonExtractNumbers);
  registerFn(env, exports, "simdJsonBackend", RegisterSimdJsonBackend);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
