#pragma once

#include <cuda_runtime.h>
#include <cstdint>

namespace legalai {
namespace qlora {
namespace cuda {

// NF4 quantization kernels
cudaError_t launchNF4QuantizeKernel(const float* input, uint8_t* output,
                                   size_t size, cudaStream_t stream = nullptr);

cudaError_t launchNF4DequantizeKernel(const uint8_t* input, float* output,
                                     size_t size, cudaStream_t stream = nullptr);

// Fused LoRA operations
cudaError_t launchFusedLoRAForwardKernel(const float* input, const float* lora_a,
                                        const float* lora_b, float* output,
                                        size_t batch_size, size_t seq_len,
                                        size_t hidden_size, size_t rank,
                                        cudaStream_t stream = nullptr);

// Gradient accumulation and optimization
cudaError_t launchGradientAccumulationKernel(float* gradients, const float* step_gradients,
                                           size_t size, int accumulation_steps,
                                           cudaStream_t stream = nullptr);

cudaError_t launchAdamWUpdateKernel(float* weights, const float* gradients,
                                   float* exp_avg, float* exp_avg_sq,
                                   float lr, float beta1, float beta2,
                                   float eps, float weight_decay,
                                   size_t size, cudaStream_t stream = nullptr);

} // namespace cuda
} // namespace qlora
} // namespace legalai