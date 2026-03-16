/**
 * N-API Native Addon: tensorrt_bridge
 *
 * Exposes GPU-accelerated functions to Node.js via TypedArrays:
 *   - bridgeSIMD(json: string) → number
 *   - checkCudaAvailable() → number (1 = CUDA, 0 = CPU)
 *   - graphSimilarity(Float32Array, n, dim) → Float32Array[n*n]
 *   - clusterEmbeddings(Float32Array, n, dim, k, maxIters) → Int32Array[n]
 *   - computeCaseEmbedding(Float32Array weights, Float32Array embeddings, n, dim) → Float32Array[dim]
 */

#include <cassert>
#if __has_include(<node_api.h>)
#include <node_api.h>
#else
#include <cstddef>
#include <cstdint>
#include <cstdlib>

typedef void *napi_env;
typedef void *napi_value;
typedef void *napi_callback_info;
typedef int32_t napi_status;
typedef int32_t napi_valuetype;
typedef int32_t napi_typedarray_type;

enum { napi_ok = 0 };
enum { napi_string = 1 };
enum { napi_float32_array = 0, napi_int32_array = 4 };

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
napi_status napi_create_function(napi_env, const char*, size_t, napi_value(*)(napi_env, napi_callback_info), void*, napi_value*);
napi_status napi_set_named_property(napi_env, napi_value, const char*, napi_value);
napi_status napi_get_typedarray_info(napi_env, napi_value, napi_typedarray_type*, size_t*, void**, napi_value*, size_t*);
napi_status napi_create_typedarray(napi_env, napi_typedarray_type, size_t, napi_value, size_t, napi_value*);
napi_status napi_create_arraybuffer(napi_env, size_t, void**, napi_value*);
}

#ifndef NAPI_MODULE
#define NAPI_MODULE(modname, regfunc)
#endif
#endif

#include <vector>
#include <cstring>

// External C functions from other compilation units
extern "C" int bridgeSIMDToTensorRT(const char* json);

// LibTorch graph analysis (libtorch_graph.cc)
extern "C" int graphSimilarity(const float* embeddings, int n, int dim, float* output, int output_len);
extern "C" int clusterEmbeddings(const float* embeddings, int n, int dim, int k, int max_iters, int* assignments, int assignments_len);
extern "C" int computeCaseEmbedding(const float* weights, int n, const float* embeddings, int dim, float* output, int output_len);
extern "C" int checkCudaAvailable();

// LSTM bridge (lstm_bridge.cc → lstm_gpu.cu)
extern "C" int bridge_run_lstm(const float* a, const float* b, float* out, int n);
extern "C" int bridge_dot_product(const float* a, const float* b, float* out, int n);
extern "C" int bridge_scale(const float* in, float* out, float scalar, int n);
extern "C" int bridge_relu(const float* in, float* out, int n);

// SOM cache (som_cache.cu)
extern "C" void runSOMCache(const float* in, float* out, int n);

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

  // Allocate output: n*n float32 values
  int output_len = n * n;
  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, output_len * sizeof(float), &out_data, &arraybuffer);

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

  // Allocate output: n int32 assignments
  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, n * sizeof(int32_t), &out_data, &arraybuffer);

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

  // Allocate output: dim float32 values
  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, dim * sizeof(float), &out_data, &arraybuffer);

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

  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, n * sizeof(float), &out_data, &arraybuffer);

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

  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, n * sizeof(float), &out_data, &arraybuffer);

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

  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, sizeof(float), &out_data, &arraybuffer);

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

  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, n * sizeof(float), &out_data, &arraybuffer);

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

  void* out_data;
  napi_value arraybuffer;
  napi_create_arraybuffer(env, n * sizeof(float), &out_data, &arraybuffer);

  int rc = bridge_relu((const float*)in_data, (float*)out_data, n);
  if (rc != 0) return throw_error(env, "relu failed (GPU/CPU error)");

  napi_value result;
  napi_create_typedarray(env, napi_float32_array, n, arraybuffer, 0, &result);
  return result;
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
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
