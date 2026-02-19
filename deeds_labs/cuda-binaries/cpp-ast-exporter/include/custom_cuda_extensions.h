#pragma once

#include <torch/torch.h>
#include <cublasLt.h>
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <utility>

// Phase SIMDJSON: Custom CUDA Extensions Header
// Advanced CUDA kernels with tensor core operations and memory management

class CustomCudaExtensions {
public:
    CustomCudaExtensions(bool use_tensor_cores = true, size_t memory_pool_size = 1024 * 1024 * 1024);
    ~CustomCudaExtensions();

    // Tensor core operations
    torch::Tensor tensor_core_matmul(const torch::Tensor& a, const torch::Tensor& b);

    // Custom attention mechanisms
    torch::Tensor fused_attention(const torch::Tensor& query,
                                 const torch::Tensor& key,
                                 const torch::Tensor& value,
                                 int head_dim = 64);

    // Optimized normalization
    torch::Tensor fast_layer_norm(const torch::Tensor& input,
                                 const torch::Tensor& weight,
                                 const torch::Tensor& bias);

    // Fast activation functions
    torch::Tensor fast_gelu(const torch::Tensor& input);
    torch::Tensor fast_silu(const torch::Tensor& input);

    // Memory management
    void* allocate_from_pool(size_t size);
    void free_from_pool(void* ptr);

    // Benchmarking and profiling
    std::unordered_map<std::string, float> benchmark_cuda_ops(int matrix_size = 4096, int iterations = 100);
    std::pair<size_t, size_t> get_memory_info();

private:
    cublasLtHandle_t cublasLt_handle_;
    torch::Device device_;
    cudaStream_t stream_;
    dim3 block_size_;
    dim3 grid_size_;
    std::vector<void*> memory_pools_;
    size_t pool_size_;

    // Helper functions
    void initialize_memory_pools();
    void create_matrix_layout(cublasLtMatrixLayout_t& layout, const torch::Tensor& tensor);

    // CUDA kernel launchers
    void launch_fused_attention_kernel(const float* query, const float* key, const float* value,
                                     float* output, int batch_size, int seq_len, int head_dim);
    void launch_fast_layer_norm_kernel(const float* input, const float* weight, const float* bias,
                                     float* output, int num_elements, int feature_dim);
    void launch_fast_gelu_kernel(const float* input, float* output, int num_elements);
    void launch_fast_silu_kernel(const float* input, float* output, int num_elements);
};

// Factory function
std::unique_ptr<CustomCudaExtensions> create_cuda_extensions(bool use_tensor_cores = true);

// Model optimization utilities
torch::nn::Module optimize_model_with_cuda_extensions(torch::nn::Module& model,
                                                     CustomCudaExtensions& cuda_ext);
torch::Tensor profile_gpu_memory(CustomCudaExtensions& cuda_ext);

// CUDA kernel declarations
extern "C" {
    __global__ void fused_attention_kernel(const float* query, const float* key, const float* value,
                                         float* output, int batch_size, int seq_len, int head_dim);

    __global__ void fast_layer_norm_kernel(const float* input, const float* weight, const float* bias,
                                         float* output, int num_elements, int feature_dim);

    __global__ void fast_gelu_kernel(const float* input, float* output, int num_elements);

    __global__ void fast_silu_kernel(const float* input, float* output, int num_elements);
}