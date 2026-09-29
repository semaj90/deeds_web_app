#include "atlas_core.h"

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <limits>
#include <new>
#include <vector>

namespace {
std::atomic<uint64_t> gPagerankOperationId{1u};

bool validV1(uint32_t size, uint32_t version, size_t expected) {
  return size >= expected && version == ATLAS_ABI_VERSION_1;
}

bool mulOverflow(uint64_t left, uint64_t right, uint64_t *result) {
  if (right != 0u && left > UINT64_MAX / right) return true;
  *result = left * right;
  return false;
}

bool addOverflow(uint64_t left, uint64_t right, uint64_t *result) {
  if (left > UINT64_MAX - right) return true;
  *result = left + right;
  return false;
}

bool emptyResult(const atlas_pagerank_result_v1_t *result) {
  const atlas_buffer_t &scores = result->scores;
  return result->node_count == 0u && result->iterations == 0u &&
      result->converged == 0u && result->final_residual == 0.0 &&
      result->reserved[0] == 0u && result->reserved[1] == 0u && result->reserved[2] == 0u &&
      scores.struct_size >= sizeof(scores) && scores.abi_version == ATLAS_ABI_VERSION_1 &&
      scores.data == nullptr && scores.byte_length == 0u && scores.capacity == 0u &&
      scores.allocator_id == 0u && scores.reserved == 0u;
}

atlas_status_t finish(
    atlas_execution_receipt_t *receipt,
    atlas_status_t status,
    uint64_t startedAt) {
  const auto now = std::chrono::steady_clock::now().time_since_epoch();
  const uint64_t endedAt = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(now).count());
  receipt->operation_id = gPagerankOperationId.fetch_add(1u, std::memory_order_relaxed);
  receipt->backend = ATLAS_BACKEND_CPU;
  receipt->status = status;
  receipt->execution_ns = endedAt >= startedAt ? endedAt - startedAt : 0u;
  return status;
}

atlas_status_t validateGraph(const atlas_csr_graph_v1_t *graph) {
  if (graph == nullptr || !validV1(graph->struct_size, graph->abi_version, sizeof(*graph)) ||
      graph->row_count == 0u || graph->row_count > UINT32_MAX) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  uint64_t offsetCount = 0u;
  uint64_t offsetBytes = 0u;
  uint64_t columnBytes = 0u;
  uint64_t weightBytes = 0u;
  if (addOverflow(graph->row_count, 1u, &offsetCount) ||
      mulOverflow(offsetCount, sizeof(uint64_t), &offsetBytes) ||
      mulOverflow(graph->edge_count, sizeof(uint32_t), &columnBytes) ||
      mulOverflow(graph->edge_count, sizeof(float), &weightBytes)) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  const atlas_buffer_t *buffers[] = {
      &graph->row_offsets, &graph->column_indices, &graph->edge_weights};
  const uint64_t expected[] = {offsetBytes, columnBytes, weightBytes};
  for (size_t index = 0; index < 3u; ++index) {
    if (!validV1(buffers[index]->struct_size, buffers[index]->abi_version,
            sizeof(atlas_buffer_t)) || buffers[index]->byte_length != expected[index] ||
        buffers[index]->capacity < expected[index] ||
        buffers[index]->reserved != 0u ||
        (expected[index] != 0u && buffers[index]->data == nullptr)) {
      return ATLAS_STATUS_INVALID_ARGUMENT;
    }
  }

  const auto *offsets = static_cast<const uint64_t *>(graph->row_offsets.data);
  const auto *columns = static_cast<const uint32_t *>(graph->column_indices.data);
  const auto *weights = static_cast<const float *>(graph->edge_weights.data);
  if (offsets[0] != 0u || offsets[graph->row_count] != graph->edge_count) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  for (uint64_t row = 0u; row < graph->row_count; ++row) {
    if (offsets[row] > offsets[row + 1u] || offsets[row + 1u] > graph->edge_count) {
      return ATLAS_STATUS_INVALID_ARGUMENT;
    }
    uint32_t previous = 0u;
    bool hasPrevious = false;
    for (uint64_t edge = offsets[row]; edge < offsets[row + 1u]; ++edge) {
      const uint32_t column = columns[edge];
      if (column >= graph->row_count || (hasPrevious && column <= previous) ||
          !std::isfinite(weights[edge]) || weights[edge] < 0.0f) {
        return ATLAS_STATUS_INVALID_ARGUMENT;
      }
      previous = column;
      hasPrevious = true;
    }
  }
  return ATLAS_STATUS_OK;
}
}  // namespace

extern "C" atlas_status_t atlas_pagerank_options_init_v1(
    atlas_pagerank_options_v1_t *options) {
  if (options == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(options, 0, sizeof(*options));
  options->struct_size = static_cast<uint32_t>(sizeof(*options));
  options->abi_version = ATLAS_ABI_VERSION_1;
  options->damping = 0.85;
  options->tolerance = 1e-12;
  options->max_iterations = 100u;
  return ATLAS_STATUS_OK;
}

extern "C" atlas_status_t atlas_pagerank_result_init_v1(
    atlas_pagerank_result_v1_t *result) {
  if (result == nullptr) return ATLAS_STATUS_INVALID_ARGUMENT;
  std::memset(result, 0, sizeof(*result));
  result->struct_size = static_cast<uint32_t>(sizeof(*result));
  result->abi_version = ATLAS_ABI_VERSION_1;
  return atlas_buffer_init(&result->scores);
}

extern "C" atlas_status_t atlas_pagerank_result_release_v1(
    atlas_pagerank_result_v1_t *result) {
  if (result == nullptr || !validV1(result->struct_size, result->abi_version, sizeof(*result))) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  const atlas_status_t status = atlas_buffer_release(&result->scores);
  if (status != ATLAS_STATUS_OK) return status;
  result->node_count = 0u;
  result->iterations = 0u;
  result->converged = 0u;
  result->final_residual = 0.0;
  return ATLAS_STATUS_OK;
}

extern "C" atlas_status_t atlas_pagerank(
    const atlas_context_t *context,
    const atlas_csr_graph_v1_t *graph,
    const atlas_pagerank_options_v1_t *options,
    atlas_pagerank_result_v1_t *out_result,
    atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr || !validV1(receipt->struct_size, receipt->abi_version, sizeof(*receipt))) {
    return ATLAS_STATUS_INVALID_ARGUMENT;
  }
  atlas_execution_receipt_init(receipt);
  const auto start = std::chrono::steady_clock::now().time_since_epoch();
  const uint64_t startedAt = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(start).count());
  if (context == nullptr || out_result == nullptr ||
      !validV1(out_result->struct_size, out_result->abi_version, sizeof(*out_result)) ||
      !emptyResult(out_result) || options == nullptr ||
      !validV1(options->struct_size, options->abi_version, sizeof(*options)) ||
      !std::isfinite(options->damping) || options->damping < 0.0 || options->damping >= 1.0 ||
      !std::isfinite(options->tolerance) || options->tolerance <= 0.0 ||
      options->max_iterations == 0u) {
    return finish(receipt, ATLAS_STATUS_INVALID_ARGUMENT, startedAt);
  }
  for (uint32_t value : options->reserved) {
    if (value != 0u) return finish(receipt, ATLAS_STATUS_INVALID_ARGUMENT, startedAt);
  }
  const atlas_status_t graphStatus = validateGraph(graph);
  if (graphStatus != ATLAS_STATUS_OK) return finish(receipt, graphStatus, startedAt);

  atlas_context_options_t contextOptions{};
  contextOptions.struct_size = static_cast<uint32_t>(sizeof(contextOptions));
  contextOptions.abi_version = ATLAS_ABI_VERSION_1;
  const atlas_status_t contextStatus = atlas_context_get_options_v1(context, &contextOptions);
  if (contextStatus != ATLAS_STATUS_OK) return finish(receipt, contextStatus, startedAt);

  const uint64_t n = graph->row_count;
  uint64_t scoreBytes = 0u;
  uint64_t workspaceBytes = 0u;
  if (mulOverflow(n, sizeof(double), &scoreBytes) ||
      mulOverflow(scoreBytes, 4u, &workspaceBytes)) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, startedAt);
  }
  const uint64_t budget = contextOptions.memory_limit_bytes == 0u
      ? UINT64_C(512) * 1024u * 1024u : contextOptions.memory_limit_bytes;
  if (workspaceBytes > budget || scoreBytes > static_cast<uint64_t>(std::numeric_limits<size_t>::max())) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, startedAt);
  }

  std::vector<double> outgoing;
  std::vector<double> current;
  std::vector<double> next;
  try {
    outgoing.assign(static_cast<size_t>(n), 0.0);
    current.assign(static_cast<size_t>(n), 1.0 / static_cast<double>(n));
    next.assign(static_cast<size_t>(n), 0.0);
    const auto *offsets = static_cast<const uint64_t *>(graph->row_offsets.data);
    const auto *weights = static_cast<const float *>(graph->edge_weights.data);
    for (uint64_t row = 0u; row < n; ++row) {
      for (uint64_t edge = offsets[row]; edge < offsets[row + 1u]; ++edge) {
        outgoing[row] += static_cast<double>(weights[edge]);
      }
    }
  } catch (const std::bad_alloc &) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, startedAt);
  }

  const uint64_t scoreCount = n;
  const atlas_status_t allocateStatus = atlas_buffer_allocate(scoreBytes, &out_result->scores);
  if (allocateStatus != ATLAS_STATUS_OK) return finish(receipt, allocateStatus, startedAt);

  const auto *offsets = static_cast<const uint64_t *>(graph->row_offsets.data);
  const auto *columns = static_cast<const uint32_t *>(graph->column_indices.data);
  const auto *weights = static_cast<const float *>(graph->edge_weights.data);
  const double damping = options->damping;
  const double teleport = (1.0 - damping) / static_cast<double>(n);
  double residual = 0.0;
  bool converged = false;
  uint32_t iterations = 0u;
  for (; iterations < options->max_iterations; ++iterations) {
    double danglingMass = 0.0;
    for (uint64_t row = 0u; row < n; ++row) {
      if (!(outgoing[row] > 0.0)) danglingMass += current[row];
    }
    std::fill(next.begin(), next.end(), teleport + damping * danglingMass / static_cast<double>(n));
    for (uint64_t row = 0u; row < n; ++row) {
      if (!(outgoing[row] > 0.0)) continue;
      const double scale = damping * current[row] / outgoing[row];
      for (uint64_t edge = offsets[row]; edge < offsets[row + 1u]; ++edge) {
        next[columns[edge]] += scale * static_cast<double>(weights[edge]);
      }
    }
    double scoreSum = 0.0;
    for (double score : next) scoreSum += score;
    if (!(scoreSum > 0.0) || !std::isfinite(scoreSum)) {
      atlas_buffer_release(&out_result->scores);
      return finish(receipt, ATLAS_STATUS_INTERNAL_ERROR, startedAt);
    }
    residual = 0.0;
    for (uint64_t node = 0u; node < n; ++node) {
      next[node] /= scoreSum;
      residual += std::abs(next[node] - current[node]);
    }
    current.swap(next);
    if (residual <= options->tolerance) {
      converged = true;
      ++iterations;
      break;
    }
  }

  std::memcpy(out_result->scores.data, current.data(), static_cast<size_t>(scoreBytes));
  out_result->node_count = scoreCount;
  out_result->iterations = iterations;
  out_result->converged = converged ? 1u : 0u;
  out_result->final_residual = residual;
  return finish(receipt, ATLAS_STATUS_OK, startedAt);
}
