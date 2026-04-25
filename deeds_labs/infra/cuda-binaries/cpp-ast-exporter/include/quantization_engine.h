#pragma once

#include <torch/torch.h>
#include <memory>
#include <string>
#include <vector>
#include <unordered_map>
#include <tuple>

// Phase SIMDJSON: Advanced Quantization Engine Header
// Supports INT8/INT4 quantization, QAT, PTQ, and mixed precision

class QuantizationEngine {
public:
    QuantizationEngine(bool use_cuda = true, float calibration_threshold = 0.01f);

    // INT8 Quantization
    torch::Tensor quantize_int8(const torch::Tensor& input, const std::string& name = "");
    torch::Tensor dequantize_int8(const torch::Tensor& quantized,
                                  const std::string& name = "",
                                  float scale = 0.0f,
                                  float zero_point = 0.0f);

    // INT4 Quantization with double quantization
    torch::Tensor quantize_int4(const torch::Tensor& input,
                                const std::string& name = "",
                                bool use_double_quant = true);
    torch::Tensor dequantize_int4(const torch::Tensor& packed,
                                  const std::string& name = "");

    // Quantization-Aware Training preparation
    torch::nn::Module prepare_qat(torch::nn::Module model);

    // Post-Training Quantization with calibration
    torch::nn::Module quantize_ptq(torch::nn::Module model,
                                   const std::vector<torch::Tensor>& calibration_data);

    // Mixed Precision Quantization (FP16 + INT8)
    torch::Tensor mixed_precision_quantize(const torch::Tensor& input, float fp16_threshold = 0.1f);

private:
    torch::Device device_;
    bool use_cuda_;
    float calibration_threshold_;

    // Quantization parameters cache
    std::unordered_map<std::string, torch::Tensor> scale_cache_;
    std::unordered_map<std::string, torch::Tensor> zero_point_cache_;

    // INT4 quantization parameters
    struct INT4Params {
        float scale;
        int8_t zero_point;
        bool use_double_quant;
    };
    std::unordered_map<std::string, INT4Params> int4_params_;

    // Helper functions
    torch::Tensor pack_int4_to_int8(const torch::Tensor& input);
    torch::Tensor unpack_int8_to_int4(const torch::Tensor& packed);
    void collect_activation_stats(torch::nn::Module& model,
                                 const torch::Tensor& data,
                                 std::unordered_map<std::string, std::vector<float>>& stats);
    torch::nn::Module apply_ptq_quantization(torch::nn::Module& model,
                                           const std::unordered_map<std::string, std::vector<float>>& stats);
};

// Factory function
std::unique_ptr<QuantizationEngine> create_quantization_engine(bool use_cuda = true);

// Utility functions
torch::Tensor quantize_model_weights(torch::nn::Module& model, QuantizationEngine& quantizer);
torch::Tensor benchmark_quantization_speed(const torch::Tensor& input,
                                          QuantizationEngine& quantizer,
                                          int iterations = 100);