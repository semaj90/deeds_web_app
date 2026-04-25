#pragma once

#include <torch/torch.h>
#include <cusparseLt.h>
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <tuple>

// Phase SIMDJSON: Advanced Sparse Operations Engine Header
// Utilizes cuSPARSELt for high-performance sparse matrix operations

class SparseOperations {
public:
    SparseOperations(bool use_cuda = true);
    ~SparseOperations();

    // Sparse matrix conversion
    std::tuple<torch::Tensor, torch::Tensor, torch::Tensor>
    dense_to_sparse_csr(const torch::Tensor& dense);

    // Sparse matrix operations
    torch::Tensor sparse_matmul(const torch::Tensor& sparse_a,
                               const torch::Tensor& dense_b,
                               const std::string& cache_key = "");
    torch::Tensor sparse_matvec(const torch::Tensor& sparse_a,
                               const torch::Tensor& vector_b);

    // Weight pruning
    torch::Tensor prune_weights(const torch::Tensor& weights, float sparsity_ratio = 0.8f);
    torch::Tensor structured_prune(const torch::Tensor& weights,
                                  int prune_channels = 0,
                                  std::string prune_axis = "output");

    // Benchmarking
    std::unordered_map<std::string, float> benchmark_sparse_ops(const torch::Tensor& dense_matrix,
                                                               int iterations = 100);

private:
    cusparseLtHandle_t cusparseLt_handle_;
    torch::Device device_;
    bool use_cuda_;

    // cuSPARSELt resources
    std::unordered_map<std::string, cusparseLtMatDescriptor_t> mat_descriptors_;
    std::unordered_map<std::string, cusparseLtMatmulDescriptor_t> matmul_descriptors_;
    std::unordered_map<std::string, cusparseLtMatmulPlan_t> matmul_plans_;
    std::vector<void*> temp_buffers_;

    // Helper functions
    void create_matrix_descriptor(cusparseLtMatDescriptor_t& desc,
                                 const torch::Tensor& tensor,
                                 cusparseOrder_t order,
                                 bool is_sparse);

    // CPU fallbacks
    std::tuple<torch::Tensor, torch::Tensor, torch::Tensor>
    cpu_dense_to_sparse_csr(const torch::Tensor& dense);
    torch::Tensor cpu_sparse_matmul(const torch::Tensor& sparse_a, const torch::Tensor& dense_b);
    torch::Tensor cpu_sparse_matvec(const torch::Tensor& sparse_a, const torch::Tensor& vector_b);
    torch::Tensor execute_cached_matmul(const std::string& cache_key,
                                       const torch::Tensor& sparse_a,
                                       const torch::Tensor& dense_b);
};

// Factory function
std::unique_ptr<SparseOperations> create_sparse_operations(bool use_cuda = true);

// Model sparsification utilities
torch::nn::Module sparsify_model(torch::nn::Module& model,
                                SparseOperations& sparse_ops,
                                float sparsity_ratio = 0.8f);
torch::Tensor calculate_model_sparsity(torch::nn::Module& model);