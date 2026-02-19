#pragma once

#include <memory>
#include <string>
#include <vector>
#include <cuda_runtime.h>

namespace legalai {
namespace qlora {

struct TrainingConfig {
    int lora_rank = 8;
    float lora_alpha = 16.0f;
    float learning_rate = 2e-4f;
    int batch_size = 4;
    int max_steps = 1000;
    bool use_nf4 = true;
    bool fused_operations = true;
    int gradient_accumulation_steps = 1;
};

class QLoRATrainer {
public:
    QLoRATrainer(const TrainingConfig& config);
    ~QLoRATrainer();

    bool initialize(const std::string& model_path, const std::string& dataset_path);
    bool startTraining();
    bool stopTraining();
    bool saveCheckpoint(const std::string& path);

    // CUDA kernel interfaces
    cudaError_t quantizeWeightsNF4(float* weights, size_t size);
    cudaError_t fusedLoRAForward(const float* input, const float* lora_weights,
                                float* output, size_t batch_size, size_t seq_len, size_t hidden_size);

private:
    TrainingConfig config_;
    bool initialized_ = false;
    bool training_ = false;

    // CUDA resources
    cudaStream_t stream_;
    void* model_weights_ = nullptr;
    void* lora_weights_ = nullptr;
    void* optimizer_states_ = nullptr;
};

} // namespace qlora
} // namespace legalai