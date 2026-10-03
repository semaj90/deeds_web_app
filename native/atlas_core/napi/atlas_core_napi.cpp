#include <node_api.h>
#include "atlas_core.h"

#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

namespace {
constexpr size_t kMaxInputBytes = 32u * 1024u * 1024u;
constexpr uint32_t kMaxInflight = 2u;
constexpr uint64_t kContextMemoryLimit = 32u * 1024u * 1024u;
std::atomic<uint32_t> g_inflight{0u};

struct PageRankWork {
  napi_async_work async_work = nullptr;
  napi_deferred deferred = nullptr;
  std::vector<uint64_t> offsets;
  std::vector<uint32_t> columns;
  std::vector<float> weights;
  double damping = 0.85;
  double tolerance = 1e-10;
  uint32_t max_iterations = 100u;
  atlas_status_t status = ATLAS_STATUS_INTERNAL_ERROR;
  atlas_pagerank_result_v1_t result{};
  atlas_execution_receipt_t receipt{};
  bool admitted = false;
};

void throwType(napi_env env, const char *message) {
  napi_throw_type_error(env, nullptr, message);
}

bool readTypedArray(napi_env env, napi_value value, napi_typedarray_type expected,
                    size_t *length, void **data) {
  napi_typedarray_type type;
  if (napi_get_typedarray_info(env, value, &type, length, data, nullptr, nullptr) != napi_ok ||
      type != expected) return false;
  return true;
}

void initializeBorrowedBuffer(atlas_buffer_t *buffer, void *data, uint64_t bytes) {
  std::memset(buffer, 0, sizeof(*buffer));
  buffer->struct_size = static_cast<uint32_t>(sizeof(*buffer));
  buffer->abi_version = ATLAS_ABI_VERSION_1;
  buffer->data = data;
  buffer->byte_length = bytes;
  buffer->capacity = bytes;
  buffer->allocator_id = 0u;
}

void executePageRank(napi_env, void *raw) {
  auto *work = static_cast<PageRankWork *>(raw);
  atlas_context_options_t context_options{};
  atlas_pagerank_options_v1_t options{};
  atlas_csr_graph_v1_t graph{};
  atlas_context_t *context = nullptr;

  work->status = atlas_context_options_init(&context_options);
  if (work->status != ATLAS_STATUS_OK) return;
  context_options.memory_limit_bytes = kContextMemoryLimit;
  work->status = atlas_context_create(&context_options, &context);
  if (work->status != ATLAS_STATUS_OK) return;

  work->status = atlas_csr_graph_init_v1(&graph);
  if (work->status == ATLAS_STATUS_OK) {
    graph.row_count = static_cast<uint64_t>(work->offsets.size() - 1u);
    graph.edge_count = static_cast<uint64_t>(work->columns.size());
    initializeBorrowedBuffer(&graph.row_offsets, work->offsets.data(),
        static_cast<uint64_t>(work->offsets.size() * sizeof(uint64_t)));
    initializeBorrowedBuffer(&graph.column_indices, work->columns.data(),
        static_cast<uint64_t>(work->columns.size() * sizeof(uint32_t)));
    initializeBorrowedBuffer(&graph.edge_weights, work->weights.data(),
        static_cast<uint64_t>(work->weights.size() * sizeof(float)));
    work->status = atlas_pagerank_options_init_v1(&options);
  }
  if (work->status == ATLAS_STATUS_OK) {
    options.damping = work->damping;
    options.tolerance = work->tolerance;
    options.max_iterations = work->max_iterations;
    work->status = atlas_pagerank_result_init_v1(&work->result);
  }
  if (work->status == ATLAS_STATUS_OK) {
    work->receipt.struct_size = static_cast<uint32_t>(sizeof(work->receipt));
    work->receipt.abi_version = ATLAS_ABI_VERSION_1;
    work->status = atlas_execution_receipt_init(&work->receipt);
  }
  if (work->status == ATLAS_STATUS_OK) {
    work->status = atlas_pagerank(context, &graph, &options, &work->result, &work->receipt);
  }
  if (graph.struct_size != 0u) {
    initializeBorrowedBuffer(&graph.row_offsets, nullptr, 0u);
    initializeBorrowedBuffer(&graph.column_indices, nullptr, 0u);
    initializeBorrowedBuffer(&graph.edge_weights, nullptr, 0u);
    atlas_csr_graph_release_v1(&graph);
  }
  if (context != nullptr) atlas_context_destroy(&context);
}

napi_value makeError(napi_env env, const std::string &message) {
  napi_value text, error;
  if (napi_create_string_utf8(env, message.c_str(), message.size(), &text) != napi_ok ||
      napi_create_error(env, nullptr, text, &error) != napi_ok) return nullptr;
  return error;
}

void completePageRank(napi_env env, napi_status async_status, void *raw) {
  std::unique_ptr<PageRankWork> work(static_cast<PageRankWork *>(raw));
  if (work->async_work != nullptr) napi_delete_async_work(env, work->async_work);
  if (work->admitted) g_inflight.fetch_sub(1u, std::memory_order_release);

  if (async_status != napi_ok && work->status == ATLAS_STATUS_OK) {
    work->status = ATLAS_STATUS_INTERNAL_ERROR;
  }
  if (work->status != ATLAS_STATUS_OK) {
    const char *status = atlas_status_string(work->status);
    napi_reject_deferred(env, work->deferred,
        makeError(env, status == nullptr ? "atlas_core PageRank failed" : status));
    if (work->result.struct_size != 0u) atlas_pagerank_result_release_v1(&work->result);
    return;
  }

  const size_t count = static_cast<size_t>(work->result.node_count);
  napi_value array_buffer, scores, response, value;
  void *output = nullptr;
  napi_status status = napi_create_arraybuffer(env, count * sizeof(double), &output, &array_buffer);
  if (status == napi_ok) {
    std::memcpy(output, work->result.scores.data, count * sizeof(double));
    status = napi_create_typedarray(env, napi_float64_array, count, array_buffer, 0u, &scores);
  }
  if (status == napi_ok) status = napi_create_object(env, &response);
  if (status == napi_ok) status = napi_set_named_property(env, response, "scores", scores);
  if (status == napi_ok) status = napi_create_uint32(env, work->result.iterations, &value);
  if (status == napi_ok) status = napi_set_named_property(env, response, "iterations", value);
  if (status == napi_ok) status = napi_get_boolean(env, work->result.converged != 0u, &value);
  if (status == napi_ok) status = napi_set_named_property(env, response, "converged", value);
  if (status == napi_ok) status = napi_create_double(env, work->result.final_residual, &value);
  if (status == napi_ok) status = napi_set_named_property(env, response, "finalResidual", value);
  if (status == napi_ok) status = napi_create_string_utf8(env, "cpu", NAPI_AUTO_LENGTH, &value);
  if (status == napi_ok) status = napi_set_named_property(env, response, "backend", value);
  if (status == napi_ok) status = napi_resolve_deferred(env, work->deferred, response);
  else napi_reject_deferred(env, work->deferred, makeError(env, "could not construct PageRank result"));
  if (work->result.struct_size != 0u) atlas_pagerank_result_release_v1(&work->result);
}

napi_value AtlasPageRank(napi_env env, napi_callback_info info) {
  size_t argc = 6u;
  napi_value argv[6];
  if (napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) != napi_ok || argc != 6u) {
    throwType(env, "atlasPageRank expects rowOffsets, columnIndices, edgeWeights, damping, tolerance, maxIterations");
    return nullptr;
  }

  size_t offset_count = 0u, edge_count = 0u, weight_count = 0u;
  void *offset_data = nullptr, *column_data = nullptr, *weight_data = nullptr;
  if (!readTypedArray(env, argv[0], napi_biguint64_array, &offset_count, &offset_data) ||
      !readTypedArray(env, argv[1], napi_uint32_array, &edge_count, &column_data) ||
      !readTypedArray(env, argv[2], napi_float32_array, &weight_count, &weight_data) ||
      offset_count < 2u || edge_count != weight_count) {
    throwType(env, "expected BigUint64Array offsets, Uint32Array columns, and equal-length Float32Array weights");
    return nullptr;
  }

  double damping, tolerance;
  uint32_t max_iterations;
  if (napi_get_value_double(env, argv[3], &damping) != napi_ok || !std::isfinite(damping) ||
      damping < 0.0 || damping >= 1.0 ||
      napi_get_value_double(env, argv[4], &tolerance) != napi_ok || !std::isfinite(tolerance) ||
      tolerance <= 0.0 ||
      napi_get_value_uint32(env, argv[5], &max_iterations) != napi_ok || max_iterations == 0u ||
      max_iterations > 10000u) {
    throwType(env, "invalid PageRank options (damping [0,1), positive tolerance, iterations 1..10000)");
    return nullptr;
  }

  if (offset_count > UINT32_MAX || offset_count > kMaxInputBytes / sizeof(uint64_t)) {
    throwType(env, "PageRank input exceeds bounded node/byte limits");
    return nullptr;
  }
  const size_t offset_bytes = offset_count * sizeof(uint64_t);
  const size_t bytes_per_edge = sizeof(uint32_t) + sizeof(float);
  if (edge_count > (kMaxInputBytes - offset_bytes) / bytes_per_edge) {
    throwType(env, "PageRank input exceeds bounded node/byte limits");
    return nullptr;
  }

  uint32_t current = g_inflight.load(std::memory_order_relaxed);
  do {
    if (current >= kMaxInflight) {
      napi_throw_error(env, "ATLAS_QUEUE_FULL", "atlas_core N-API work queue is full");
      return nullptr;
    }
  } while (!g_inflight.compare_exchange_weak(current, current + 1u, std::memory_order_acq_rel));

  std::unique_ptr<PageRankWork> work;
  try {
    work = std::make_unique<PageRankWork>();
  } catch (...) {
    g_inflight.fetch_sub(1u, std::memory_order_release);
    throwType(env, "unable to allocate bounded PageRank work item");
    return nullptr;
  }
  work->admitted = true;
  work->damping = damping;
  work->tolerance = tolerance;
  work->max_iterations = max_iterations;
  try {
    const auto *offsets = static_cast<const uint64_t *>(offset_data);
    const auto *columns = static_cast<const uint32_t *>(column_data);
    const auto *weights = static_cast<const float *>(weight_data);
    work->offsets.assign(offsets, offsets + offset_count);
    work->columns.assign(columns, columns + edge_count);
    work->weights.assign(weights, weights + weight_count);
  } catch (...) {
    g_inflight.fetch_sub(1u, std::memory_order_release);
    throwType(env, "unable to copy bounded PageRank input");
    return nullptr;
  }

  napi_value promise, resource_name;
  if (napi_create_promise(env, &work->deferred, &promise) != napi_ok ||
      napi_create_string_utf8(env, "atlas_core.atlasPageRank", NAPI_AUTO_LENGTH, &resource_name) != napi_ok ||
      napi_create_async_work(env, nullptr, resource_name, executePageRank, completePageRank,
          work.get(), &work->async_work) != napi_ok) {
    g_inflight.fetch_sub(1u, std::memory_order_release);
    throwType(env, "unable to schedule bounded atlas_core PageRank work");
    return nullptr;
  }
  if (napi_queue_async_work(env, work->async_work) != napi_ok) {
    napi_delete_async_work(env, work->async_work);
    g_inflight.fetch_sub(1u, std::memory_order_release);
    throwType(env, "unable to queue atlas_core PageRank work");
    return nullptr;
  }
  work.release();
  return promise;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_value function;
  if (napi_create_function(env, "atlasPageRank", NAPI_AUTO_LENGTH, AtlasPageRank,
          nullptr, &function) != napi_ok ||
      napi_set_named_property(env, exports, "atlasPageRank", function) != napi_ok) return nullptr;
  return exports;
}
}  // namespace

#if defined(ATLAS_CORE_NAPI_EMBEDDED)
extern "C" napi_callback atlas_core_napi_page_rank_callback(void) {
  return AtlasPageRank;
}
#else
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
#endif
