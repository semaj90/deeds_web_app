#include <cassert>
#if __has_include(<node_api.h>)
#include <node_api.h>
#else
// Minimal fallback types & declarations so static analysis / non-node builds
// compile. These are intentionally minimal and only include what's needed by
// this file. When building as a real Node addon, the real <node_api.h> will be
// used instead.
#include <cstddef>
#include <cstdint>
#include <cstdlib>

typedef void *napi_env;
typedef void *napi_value;
typedef void *napi_callback_info;
typedef int32_t napi_status;
typedef int32_t napi_valuetype;

enum { napi_ok = 0 };
enum { napi_string = 1 };

#define NAPI_AUTO_LENGTH ((size_t)-1)

extern "C" {
napi_status napi_get_cb_info(napi_env env, napi_callback_info info,
                             size_t *argc, napi_value *argv,
                             napi_value *this_arg, void **data);
napi_status napi_throw_error(napi_env env, const char *code, const char *msg);
napi_status napi_throw_type_error(napi_env env, const char *code,
                                  const char *msg);
napi_status napi_typeof(napi_env env, napi_value value, napi_valuetype *result);
napi_status napi_get_value_string_utf8(napi_env env, napi_value value,
                                       char *buf, size_t bufsize,
                                       size_t *result);
napi_status napi_create_int32(napi_env env, int32_t value, napi_value *result);
napi_status napi_create_function(napi_env env, const char *utf8name,
                                 size_t length,
                                 napi_value (*cb)(napi_env, napi_callback_info),
                                 void *data, napi_value *result);
napi_status napi_set_named_property(napi_env env, napi_value object,
                                    const char *utf8name, napi_value value);
}

// Add a simple stub so non-Node builds / static analysis won't fail on the
// NAPI_MODULE(...) use at the bottom of this file.
#ifndef NAPI_MODULE
#define NAPI_MODULE(modname, regfunc) /* NAPI_MODULE stub for non-Node builds  \
                                       */
#endif

#endif

#include <vector>

extern "C" int bridgeSIMDToTensorRT(const char* json);

// LibTorch graph analysis functions (libtorch_graph.cc)
extern "C" int graphSimilarity(const float* embeddings, int n, int dim, float* output, int output_len);
extern "C" int clusterEmbeddings(const float* embeddings, int n, int dim, int k, int max_iters, int* assignments, int assignments_len);
extern "C" int computeCaseEmbedding(const float* weights, int n, const float* embeddings, int dim, float* output, int output_len);
extern "C" int checkCudaAvailable();

// Helper: throw a JS TypeError and return nullptr for convenience
static napi_value throw_type_error(napi_env env, const char *msg) {
  napi_throw_type_error(env, nullptr, msg);
  return nullptr;
}

static napi_value BridgeSIMD(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1];
  napi_value this_arg;
  void *data;

  napi_status status =
      napi_get_cb_info(env, info, &argc, argv, &this_arg, &data);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to get callback info");
    return nullptr;
  }

  if (argc < 1) {
    return throw_type_error(env, "Expected one argument (JSON string)");
  }

  napi_valuetype t;
  status = napi_typeof(env, argv[0], &t);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to get argument type");
    return nullptr;
  }

  if (t != napi_string)
    return throw_type_error(env, "Expected a JSON string as first argument");

  size_t str_len = 0;
  status = napi_get_value_string_utf8(env, argv[0], nullptr, 0, &str_len);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to get string length");
    return nullptr;
  }

  // Allocate buffer for string + null
  std::vector<char> buf(str_len + 1);
  status = napi_get_value_string_utf8(env, argv[0], buf.data(), buf.size(),
                                      &str_len);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to get string value");
    return nullptr;
  }
  buf[str_len] = '\0';

  // Call into the native bridge (user-provided)
  int r = bridgeSIMDToTensorRT(buf.data());

  napi_value result;
  status = napi_create_int32(env, r, &result);
  if (status != napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create int32 result");
    return nullptr;
  }
  return result;
}

// N-API wrapper: checkCudaAvailable() → boolean
static napi_value CheckCuda(napi_env env, napi_callback_info info) {
  (void)info;
  int available = checkCudaAvailable();
  napi_value result;
  napi_create_int32(env, available, &result);
  return result;
}

// Helper: register a named function on exports
static napi_status registerFn(napi_env env, napi_value exports,
                               const char* name,
                               napi_value (*cb)(napi_env, napi_callback_info)) {
  napi_value fn;
  napi_status s = napi_create_function(env, name, NAPI_AUTO_LENGTH, cb, nullptr, &fn);
  if (s != napi_ok) return s;
  return napi_set_named_property(env, exports, name, fn);
}

static napi_value Init(napi_env env, napi_value exports) {
  registerFn(env, exports, "bridgeSIMD", BridgeSIMD);
  registerFn(env, exports, "checkCudaAvailable", CheckCuda);
  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
