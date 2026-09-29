#include "atlas_core.h"

#include <torch/torch.h>
#include <torch/cuda.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <exception>
#include <limits>
#include <new>
#include <queue>
#include <utility>
#include <vector>

namespace {
constexpr uint64_t kDefaultWorkspaceBytes = UINT64_C(512) * 1024u * 1024u;
std::atomic<uint64_t> gOperationId{1u};

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

bool outputIsEmpty(const atlas_csr_graph_v1_t *graph) {
  const atlas_buffer_t *buffers[] = {
      &graph->row_offsets, &graph->column_indices, &graph->edge_weights};
  if (graph->row_count != 0u || graph->edge_count != 0u) return false;
  for (const atlas_buffer_t *buffer : buffers) {
    if (buffer->struct_size < sizeof(*buffer) ||
        buffer->abi_version != ATLAS_ABI_VERSION_1 || buffer->data != nullptr ||
        buffer->byte_length != 0u || buffer->capacity != 0u ||
        buffer->allocator_id != 0u || buffer->reserved != 0u) return false;
  }
  return true;
}

void discardOutput(atlas_csr_graph_v1_t *graph) {
  atlas_buffer_release(&graph->row_offsets);
  atlas_buffer_release(&graph->column_indices);
  atlas_buffer_release(&graph->edge_weights);
  graph->row_count = 0u;
  graph->edge_count = 0u;
}

atlas_status_t finish(
    atlas_execution_receipt_t *receipt,
    atlas_status_t status,
    atlas_backend_t backend,
    uint64_t startedAt,
    uint64_t hostToDeviceBytes = 0u,
    uint64_t deviceToHostBytes = 0u) {
  const auto now = std::chrono::steady_clock::now().time_since_epoch();
  const uint64_t endedAt = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(now).count());
  receipt->operation_id = gOperationId.fetch_add(1u, std::memory_order_relaxed);
  receipt->backend = backend;
  receipt->status = status;
  receipt->execution_ns = endedAt >= startedAt ? endedAt - startedAt : 0u;
  receipt->host_to_device_bytes = hostToDeviceBytes;
  receipt->device_to_host_bytes = deviceToHostBytes;
  receipt->used_cpu_fallback = 0u;
  return status;
}

struct Neighbor {
  float score;
  uint32_t ordinal;
};

bool better(const Neighbor &left, const Neighbor &right) {
  return left.score > right.score ||
      (left.score == right.score && left.ordinal < right.ordinal);
}

struct BetterNeighbor {
  bool operator()(const Neighbor &left, const Neighbor &right) const {
    return better(left, right);
  }
};

}  // namespace

extern "C" atlas_status_t atlas_similarity_graph_build(
    const atlas_context_t *context,
    const atlas_similarity_graph_request_v1_t *request,
    atlas_csr_graph_v1_t *out_graph,
    atlas_execution_receipt_t *receipt) {
  if (receipt == nullptr || receipt->struct_size < sizeof(*receipt) ||
      receipt->abi_version != ATLAS_ABI_VERSION_1) return ATLAS_STATUS_INVALID_ARGUMENT;
  atlas_execution_receipt_init(receipt);
  const auto start = std::chrono::steady_clock::now().time_since_epoch();
  const uint64_t startedAt = static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(start).count());
  if (context == nullptr || out_graph == nullptr ||
      out_graph->struct_size < sizeof(*out_graph) ||
      out_graph->abi_version != ATLAS_ABI_VERSION_1 || !outputIsEmpty(out_graph)) {
    return finish(receipt, ATLAS_STATUS_INVALID_ARGUMENT, ATLAS_BACKEND_CPU, startedAt);
  }

  atlas_representation_validation_receipt_v1_t validation{};
  atlas_representation_validation_receipt_init_v1(&validation);
  const atlas_status_t validationStatus =
      atlas_similarity_graph_request_validate_v1(request, &validation);
  if (validationStatus != ATLAS_STATUS_OK) {
    return finish(receipt, validationStatus, ATLAS_BACKEND_CPU, startedAt);
  }

  atlas_context_options_t contextOptions{};
  contextOptions.struct_size = static_cast<uint32_t>(sizeof(contextOptions));
  contextOptions.abi_version = ATLAS_ABI_VERSION_1;
  atlas_status_t status = atlas_context_get_options_v1(context, &contextOptions);
  if (status != ATLAS_STATUS_OK) {
    return finish(receipt, status, ATLAS_BACKEND_CPU, startedAt);
  }

  const bool useCuda = contextOptions.cuda_device >= 0;
  if (useCuda && !torch::cuda::is_available()) {
    return finish(receipt, ATLAS_STATUS_CUDA_UNAVAILABLE,
        ATLAS_BACKEND_LIBTORCH_CUDA, startedAt);
  }
  const atlas_backend_t backend = useCuda ? ATLAS_BACKEND_LIBTORCH_CUDA : ATLAS_BACKEND_CPU;

  const uint64_t n = request->row_count;
  const uint64_t dim = request->dimension;
  const uint64_t k = request->max_neighbors_per_row;
  uint64_t normalizedBytes = 0u;
  uint64_t offsetCount = 0u;
  uint64_t offsetBytes = 0u;
  uint64_t edgeCapacity = 0u;
  uint64_t edgeArrayBytes = 0u;
  uint64_t weightBytes = 0u;
  uint64_t neighborScratchBytes = 0u;
  if (mulOverflow(n, dim, &normalizedBytes) ||
      mulOverflow(normalizedBytes, sizeof(float), &normalizedBytes) ||
      addOverflow(n, 1u, &offsetCount) ||
      mulOverflow(offsetCount, sizeof(uint64_t), &offsetBytes) ||
      mulOverflow(n, k, &edgeCapacity) ||
      mulOverflow(edgeCapacity, sizeof(uint32_t), &edgeArrayBytes) ||
      mulOverflow(edgeCapacity, sizeof(float), &weightBytes) ||
      mulOverflow(k, 2u * sizeof(Neighbor), &neighborScratchBytes)) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }
  uint64_t outputBytes = 0u;
  if (addOverflow(edgeArrayBytes, weightBytes, &outputBytes)) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }

  atlas_context_options_t effectiveOptions = contextOptions;
  const uint64_t budget = effectiveOptions.memory_limit_bytes == 0u
      ? kDefaultWorkspaceBytes : effectiveOptions.memory_limit_bytes;
  uint64_t fixedBytes = normalizedBytes;
  if (addOverflow(fixedBytes, useCuda ? normalizedBytes : 0u, &fixedBytes)) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }
  if (addOverflow(fixedBytes, offsetBytes, &fixedBytes) ||
      addOverflow(fixedBytes, outputBytes, &fixedBytes) ||
      addOverflow(fixedBytes, neighborScratchBytes, &fixedBytes) ||
      addOverflow(fixedBytes, n * sizeof(float), &fixedBytes)) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }
  const uint64_t bytesPerScoreRow = n * sizeof(float);
  if (fixedBytes > budget || (k > 0u && n > 1u &&
      (bytesPerScoreRow > UINT64_MAX / 2u ||
       budget - fixedBytes < bytesPerScoreRow * 2u))) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }
  const uint64_t tileRows = k == 0u || n <= 1u ? 1u : std::max<uint64_t>(1u,
      std::min<uint64_t>(n, (budget - fixedBytes) / (bytesPerScoreRow * 2u)));

  // Validate and normalize before allocating any caller-visible output. Double
  // accumulation keeps the norm check safe for the full finite float32 range.
  std::vector<float> normalizedValues;
  try {
    normalizedValues.resize(static_cast<size_t>(n * dim));
    for (uint64_t row = 0u; row < n; ++row) {
      double squaredNorm = 0.0;
      const uint64_t base = row * dim;
      for (uint64_t column = 0u; column < dim; ++column) {
        const float value = request->row_major_values[base + column];
        if (!std::isfinite(value)) {
          return finish(receipt, ATLAS_STATUS_INVALID_ARGUMENT, backend, startedAt);
        }
        squaredNorm += static_cast<double>(value) * static_cast<double>(value);
      }
      if (!(squaredNorm > 0.0) || !std::isfinite(squaredNorm)) {
        return finish(receipt, ATLAS_STATUS_INVALID_ARGUMENT, backend, startedAt);
      }
      const double inverseNorm = 1.0 / std::sqrt(squaredNorm);
      for (uint64_t column = 0u; column < dim; ++column) {
        normalizedValues[base + column] = static_cast<float>(
            static_cast<double>(request->row_major_values[base + column]) * inverseNorm);
      }
    }
  } catch (const std::bad_alloc &) {
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  }

  status = atlas_buffer_allocate(offsetBytes, &out_graph->row_offsets);
  if (status != ATLAS_STATUS_OK) return finish(receipt, status, backend, startedAt);
  status = atlas_buffer_allocate(edgeArrayBytes, &out_graph->column_indices);
  if (status != ATLAS_STATUS_OK) {
    discardOutput(out_graph);
    return finish(receipt, status, backend, startedAt);
  }
  status = atlas_buffer_allocate(weightBytes, &out_graph->edge_weights);
  if (status != ATLAS_STATUS_OK) {
    discardOutput(out_graph);
    return finish(receipt, status, backend, startedAt);
  }

  uint64_t deviceToHostBytes = 0u;
  try {
    auto cpuOptions = torch::TensorOptions().dtype(torch::kFloat32).device(torch::kCPU);
    torch::Tensor normalized = torch::from_blob(
        normalizedValues.data(),
        {static_cast<int64_t>(n), static_cast<int64_t>(dim)}, cpuOptions);

    if (useCuda) {
      normalized = normalized.to(torch::Device(torch::kCUDA, contextOptions.cuda_device));
    }
    const torch::Tensor transposed = normalized.transpose(0, 1);
    auto *rowOffsets = static_cast<uint64_t *>(out_graph->row_offsets.data);
    auto *columns = static_cast<uint32_t *>(out_graph->column_indices.data);
    auto *weights = static_cast<float *>(out_graph->edge_weights.data);
    for (uint64_t offset = 0u; offset <= n; ++offset) rowOffsets[offset] = 0u;
    uint64_t edgeCount = 0u;

    for (uint64_t begin = 0u; k > 0u && n > 1u && begin < n; begin += tileRows) {
      const uint64_t count = std::min<uint64_t>(tileRows, n - begin);
      torch::Tensor scoreBlock = torch::mm(
          normalized.narrow(0, static_cast<int64_t>(begin), static_cast<int64_t>(count)),
          transposed);
      torch::Tensor hostScores = useCuda ? scoreBlock.to(torch::kCPU).contiguous()
                                         : scoreBlock.contiguous();
      if (useCuda) deviceToHostBytes += count * n * sizeof(float);
      const float *tile = hostScores.data_ptr<float>();

      for (uint64_t localRow = 0u; localRow < count; ++localRow) {
        const uint64_t sourceOrdinal = begin + localRow;
        std::vector<Neighbor> heapStorage;
        heapStorage.reserve(static_cast<size_t>(k));
        std::priority_queue<Neighbor, std::vector<Neighbor>, BetterNeighbor> best(
            BetterNeighbor{}, std::move(heapStorage));
        const float *scores = tile + localRow * n;
        for (uint64_t target = 0u; target < n; ++target) {
          if (target == sourceOrdinal || scores[target] < request->threshold) continue;
          const Neighbor candidate{scores[target], static_cast<uint32_t>(target)};
          if (best.size() < k) {
            best.push(candidate);
          } else if (k > 0u && better(candidate, best.top())) {
            best.pop();
            best.push(candidate);
          }
        }

        std::vector<Neighbor> selected;
        selected.reserve(best.size());
        while (!best.empty()) {
          selected.push_back(best.top());
          best.pop();
        }
        std::sort(selected.begin(), selected.end(), [](const Neighbor &left, const Neighbor &right) {
          return left.ordinal < right.ordinal;
        });
        for (const Neighbor &neighbor : selected) {
          columns[edgeCount] = neighbor.ordinal;
          weights[edgeCount] = neighbor.score;
          ++edgeCount;
        }
        rowOffsets[sourceOrdinal + 1u] = edgeCount;
      }
    }

    out_graph->row_count = n;
    out_graph->edge_count = edgeCount;
    out_graph->column_indices.byte_length = edgeCount * sizeof(uint32_t);
    out_graph->edge_weights.byte_length = edgeCount * sizeof(float);
    return finish(receipt, ATLAS_STATUS_OK, backend, startedAt,
        useCuda ? normalizedBytes : 0u, deviceToHostBytes);
  } catch (const c10::Error &) {
    discardOutput(out_graph);
    return finish(receipt, ATLAS_STATUS_CUDA_ERROR, backend, startedAt);
  } catch (const std::bad_alloc &) {
    discardOutput(out_graph);
    return finish(receipt, ATLAS_STATUS_OUT_OF_MEMORY, backend, startedAt);
  } catch (const std::exception &) {
    discardOutput(out_graph);
    return finish(receipt, ATLAS_STATUS_INTERNAL_ERROR, backend, startedAt);
  }
}
