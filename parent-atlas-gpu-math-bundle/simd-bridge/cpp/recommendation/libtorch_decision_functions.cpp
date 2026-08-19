// Parent Atlas LibTorch decision-function reference module.
//
// This file is intentionally readable first. It provides CPU/CUDA tensor
// references for decision/output functions before promotion to Triton,
// TensorRT-RTX plugins, CUTLASS, or custom CUDA kernels.
//
// TODO(TEST-LATER): add this translation unit to the isolated LibTorch CMake
// target and prove CPU<->CUDA parity on deterministic fixtures.

#include <torch/torch.h>
#include <tuple>

namespace atlas::decision {

at::Tensor softmax(const at::Tensor& logits, int64_t dim) {
  return at::softmax(logits, dim, c10::nullopt);
}

at::Tensor log_softmax(const at::Tensor& logits, int64_t dim) {
  return at::log_softmax(logits, dim, c10::nullopt);
}

at::Tensor sigmoid(const at::Tensor& logits) {
  return at::sigmoid(logits);
}

std::tuple<at::Tensor, at::Tensor> topk(const at::Tensor& values, int64_t k, int64_t dim) {
  return at::topk(values, k, dim, true, true);
}

at::Tensor argmax(const at::Tensor& values, int64_t dim) {
  return at::argmax(values, dim, false);
}

// Sparsemax reference: projection onto the probability simplex.
// Algorithm follows the standard sort/cumulative-threshold formulation.
at::Tensor sparsemax(const at::Tensor& logits, int64_t dim) {
  auto sorted_tuple = at::sort(logits, dim, /*descending=*/true);
  auto z = std::get<0>(sorted_tuple);
  auto z_cumsum = at::cumsum(z, dim);
  const auto d = logits.size(dim);
  auto shape = std::vector<int64_t>(logits.dim(), 1);
  shape[dim] = d;
  auto range = at::arange(1, d + 1, logits.options()).view(shape);
  auto support = (1 + range * z) > z_cumsum;
  auto k = at::sum(support.to(at::kLong), dim, true).clamp_min(1);
  auto tau_sum = at::gather(z_cumsum, dim, (k - 1).to(at::kLong));
  auto tau = (tau_sum - 1) / k.to(logits.scalar_type());
  return at::clamp_min(logits - tau, 0);
}

// Experimental squared normalization. This is NOT a drop-in pretrained
// attention replacement. Promotion requires a model-specific quality/training
// receipt. Kept here only so CPU/CUDA/Triton/WebGPU can share one reference.
at::Tensor squaremax_experimental(const at::Tensor& logits, int64_t dim) {
  auto min_values = std::get<0>(at::min(logits, dim, true));
  auto shifted = logits - min_values;
  auto squared = shifted * shifted;
  auto denom = at::sum(squared, dim, true);
  auto uniform = at::ones_like(squared) / static_cast<double>(logits.size(dim));
  return at::where(denom > 0, squared / denom.clamp_min(1e-20), uniform);
}

at::Tensor lerp(const at::Tensor& a, const at::Tensor& b, double t) {
  const double u = std::max(0.0, std::min(1.0, t));
  return a + (b - a) * u;
}

}  // namespace atlas::decision
