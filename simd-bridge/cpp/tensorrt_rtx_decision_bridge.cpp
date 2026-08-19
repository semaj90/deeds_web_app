// Parent Atlas TensorRT-RTX decision-function bridge.
//
// Native TensorRT/TensorRT-RTX supports SoftMax, activation functions including
// Sigmoid, and TopK. Argmax is represented as TopK(k=1). Sparsemax/Squaremax/
// polynomial alternatives are not assumed to be native; they require an
// explicit plugin/composition and quality receipt before production use.
//
// TODO(TEST-LATER): include TensorRTRTX.cmake in the main native build only after
// the Windows GPU environment receipt proves a TensorRT-RTX 1.6 compatible CUDA
// toolkit/package pair.

#include <cstdint>
#include <stdexcept>
#include <string>

namespace atlas::tensorrt_rtx {

enum class DecisionFunction {
  kSoftmax,
  kSigmoid,
  kTopK,
  kArgmax,
  kSparsemax,
  kSquaremax,
  kPolynomial,
};

struct DecisionBuildRequest {
  DecisionFunction function;
  int32_t axis{-1};
  int32_t top_k{1};
  bool quality_receipt_proven{false};
};

struct DecisionBuildCapability {
  bool native_supported{false};
  bool requires_plugin{false};
  const char* native_operator{nullptr};
};

DecisionBuildCapability capability_for(DecisionFunction fn) {
  switch (fn) {
    case DecisionFunction::kSoftmax:
      return {true, false, "ISoftMaxLayer"};
    case DecisionFunction::kSigmoid:
      return {true, false, "IActivationLayer(SIGMOID)"};
    case DecisionFunction::kTopK:
    case DecisionFunction::kArgmax:
      return {true, false, "ITopKLayer"};
    case DecisionFunction::kSparsemax:
    case DecisionFunction::kSquaremax:
    case DecisionFunction::kPolynomial:
      return {false, true, nullptr};
  }
  return {};
}

void validate_build_request(const DecisionBuildRequest& request) {
  if ((request.function == DecisionFunction::kTopK || request.function == DecisionFunction::kArgmax) && request.top_k < 1) {
    throw std::invalid_argument("TopK/Argmax requires top_k >= 1");
  }
  const auto cap = capability_for(request.function);
  if (cap.requires_plugin && !request.quality_receipt_proven) {
    throw std::runtime_error("Custom TensorRT-RTX decision function requires quality receipt before plugin promotion");
  }
}

// TODO(TENSORRT-RTX): once the native SDK is proven, add builders that accept an
// INetworkDefinition/ITensor and emit the corresponding native layer. Keep this
// file independent from retrieval/ranking identity; it is only an executor.

}  // namespace atlas::tensorrt_rtx
