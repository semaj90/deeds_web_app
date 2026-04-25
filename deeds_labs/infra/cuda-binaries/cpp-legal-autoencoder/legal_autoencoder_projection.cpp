// legal_autoencoder_projection.cpp
// Tiny C++/CUDA service for autoencoder projection using exported weights
// Dependencies: CUDA, cuBLAS

#include <iostream>
#include <fstream>
#include <vector>
#include <string>
#include <cstdint>
#include <cuda_runtime.h>
#include <cublas_v2.h>

// Error checking macro
#define CUDA_CHECK(call) \
    do { \
        cudaError_t err = call; \
        if (err != cudaSuccess) { \
            std::cerr << "CUDA error at " << __FILE__ << ":" << __LINE__ << ": " \
                      << cudaGetErrorString(err) << std::endl; \
            exit(1); \
        } \
    } while(0)

#define CUBLAS_CHECK(call) \
    do { \
        cublasStatus_t err = call; \
        if (err != CUBLAS_STATUS_SUCCESS) { \
            std::cerr << "cuBLAS error at " << __FILE__ << ":" << __LINE__ << std::endl; \
            exit(1); \
        } \
    } while(0)

class LegalAutoencoderProjection {
private:
    // Model dimensions
    int input_dim_;
    int latent_dim_;

    // cuBLAS handle
    cublasHandle_t cublas_handle_;

    // Device memory for weights
    float *d_encoder_weights_[6];  // 3 layers × 2 (weight + bias)
    float *d_decoder_weights_[6];  // 3 layers × 2 (weight + bias)

    // Weight dimensions
    int weight_dims_[6][2];  // [layer][rows, cols]

    // Temporary buffers
    float *d_input_;
    float *d_latent_;
    float *d_output_;
    float *d_temp1_;
    float *d_temp2_;

    // Layer normalization parameters (gamma, beta)
    float *d_ln_gamma_[3];
    float *d_ln_beta_[3];

public:
    LegalAutoencoderProjection(int input_dim = 3840, int latent_dim = 512)
        : input_dim_(input_dim), latent_dim_(latent_dim) {

        // Initialize cuBLAS
        CUBLAS_CHECK(cublasCreate(&cublas_handle_));

        // Allocate weight arrays
        for (int i = 0; i < 6; ++i) {
            d_encoder_weights_[i] = nullptr;
            d_decoder_weights_[i] = nullptr;
        }

        // Set weight dimensions (3840→2048→1024→512)
        weight_dims_[0][0] = 2048; weight_dims_[0][1] = 3840;  // encoder layer 1 weight
        weight_dims_[1][0] = 2048; weight_dims_[1][1] = 1;     // encoder layer 1 bias
        weight_dims_[2][0] = 1024; weight_dims_[2][1] = 2048;  // encoder layer 2 weight
        weight_dims_[3][0] = 1024; weight_dims_[3][1] = 1;     // encoder layer 2 bias
        weight_dims_[4][0] = 512;  weight_dims_[4][1] = 1024;  // encoder layer 3 weight
        weight_dims_[5][0] = 512;  weight_dims_[5][1] = 1;     // encoder layer 3 bias

        // Decoder dimensions (512→1024→2048→3840)
        int decoder_offset = 6;
        weight_dims_[decoder_offset + 0][0] = 1024; weight_dims_[decoder_offset + 0][1] = 512;   // decoder layer 1 weight
        weight_dims_[decoder_offset + 1][0] = 1024; weight_dims_[decoder_offset + 1][1] = 1;     // decoder layer 1 bias
        weight_dims_[decoder_offset + 2][0] = 2048; weight_dims_[decoder_offset + 2][1] = 1024;  // decoder layer 2 weight
        weight_dims_[decoder_offset + 3][0] = 2048; weight_dims_[decoder_offset + 3][1] = 1;     // decoder layer 2 bias
        weight_dims_[decoder_offset + 4][0] = 3840; weight_dims_[decoder_offset + 4][1] = 2048;  // decoder layer 3 weight
        weight_dims_[decoder_offset + 5][0] = 3840; weight_dims_[decoder_offset + 5][1] = 1;     // decoder layer 3 bias
    }

    ~LegalAutoencoderProjection() {
        // Free device memory
        for (int i = 0; i < 6; ++i) {
            if (d_encoder_weights_[i]) cudaFree(d_encoder_weights_[i]);
            if (d_decoder_weights_[i]) cudaFree(d_decoder_weights_[i]);
        }
        for (int i = 0; i < 3; ++i) {
            if (d_ln_gamma_[i]) cudaFree(d_ln_gamma_[i]);
            if (d_ln_beta_[i]) cudaFree(d_ln_beta_[i]);
        }

        if (d_input_) cudaFree(d_input_);
        if (d_latent_) cudaFree(d_latent_);
        if (d_output_) cudaFree(d_output_);
        if (d_temp1_) cudaFree(d_temp1_);
        if (d_temp2_) cudaFree(d_temp2_);

        cublasDestroy(cublas_handle_);
    }

    bool loadWeights(const std::string& weight_file) {
        std::ifstream file(weight_file, std::ios::binary);
        if (!file) {
            std::cerr << "Failed to open weight file: " << weight_file << std::endl;
            return false;
        }

        // Read header
        uint32_t magic, version, input_dim, latent_dim;
        file.read(reinterpret_cast<char*>(&magic), 4);
        file.read(reinterpret_cast<char*>(&version), 4);
        file.read(reinterpret_cast<char*>(&input_dim), 4);
        file.read(reinterpret_cast<char*>(&latent_dim), 4);

        if (magic != 0x4145 || version != 1) {
            std::cerr << "Invalid weight file format" << std::endl;
            return false;
        }

        if (input_dim != input_dim_ || latent_dim != latent_dim_) {
            std::cerr << "Dimension mismatch in weight file" << std::endl;
            return false;
        }

        // Load encoder weights
        for (int i = 0; i < 6; ++i) {
            loadTensor(file, &d_encoder_weights_[i], weight_dims_[i]);
        }

        // Load decoder weights
        for (int i = 0; i < 6; ++i) {
            loadTensor(file, &d_decoder_weights_[i], weight_dims_[i + 6]);
        }

        // Initialize LayerNorm parameters (gamma=1, beta=0)
        for (int i = 0; i < 3; ++i) {
            int hidden_dim = (i == 0) ? 2048 : (i == 1) ? 1024 : 512;
            std::vector<float> gamma(hidden_dim, 1.0f);
            std::vector<float> beta(hidden_dim, 0.0f);

            CUDA_CHECK(cudaMalloc(&d_ln_gamma_[i], hidden_dim * sizeof(float)));
            CUDA_CHECK(cudaMalloc(&d_ln_beta_[i], hidden_dim * sizeof(float)));
            CUDA_CHECK(cudaMemcpy(d_ln_gamma_[i], gamma.data(), hidden_dim * sizeof(float), cudaMemcpyHostToDevice));
            CUDA_CHECK(cudaMemcpy(d_ln_beta_[i], beta.data(), hidden_dim * sizeof(float), cudaMemcpyHostToDevice));
        }

        // Allocate temporary buffers
        CUDA_CHECK(cudaMalloc(&d_input_, input_dim_ * sizeof(float)));
        CUDA_CHECK(cudaMalloc(&d_latent_, latent_dim_ * sizeof(float)));
        CUDA_CHECK(cudaMalloc(&d_output_, input_dim_ * sizeof(float)));
        CUDA_CHECK(cudaMalloc(&d_temp1_, 2048 * sizeof(float)));
        CUDA_CHECK(cudaMalloc(&d_temp2_, 2048 * sizeof(float)));

        std::cout << "Successfully loaded weights from " << weight_file << std::endl;
        return true;
    }

private:
    void loadTensor(std::ifstream& file, float** d_tensor, int dims[2]) {
        uint32_t ndims;
        file.read(reinterpret_cast<char*>(&ndims), 4);

        std::vector<uint32_t> shape(ndims);
        for (uint32_t i = 0; i < ndims; ++i) {
            file.read(reinterpret_cast<char*>(&shape[i]), 4);
        }

        size_t num_elements = 1;
        for (uint32_t dim : shape) {
            num_elements *= dim;
        }

        std::vector<float> host_data(num_elements);
        file.read(reinterpret_cast<char*>(host_data.data()), num_elements * sizeof(float));

        CUDA_CHECK(cudaMalloc(d_tensor, num_elements * sizeof(float)));
        CUDA_CHECK(cudaMemcpy(*d_tensor, host_data.data(), num_elements * sizeof(float), cudaMemcpyHostToDevice));
    }

    // GELU activation kernel
    __device__ __forceinline__ float gelu(float x) {
        return 0.5f * x * (1.0f + tanhf(0.7978845608028654f * (x + 0.044715f * x * x * x)));
    }

    // Layer normalization kernel
    __global__ void layer_norm_kernel(const float* input, float* output,
                                    const float* gamma, const float* beta,
                                    int batch_size, int hidden_dim) {
        int idx = blockIdx.x * blockDim.x + threadIdx.x;
        if (idx >= batch_size * hidden_dim) return;

        int batch_idx = idx / hidden_dim;
        int dim_idx = idx % hidden_dim;

        // Compute mean and variance for this batch element
        float mean = 0.0f;
        float var = 0.0f;

        for (int d = 0; d < hidden_dim; ++d) {
            float val = input[batch_idx * hidden_dim + d];
            mean += val;
            var += val * val;
        }
        mean /= hidden_dim;
        var = var / hidden_dim - mean * mean;

        // Normalize
        float val = input[idx];
        output[idx] = gamma[dim_idx] * (val - mean) / sqrtf(var + 1e-5f) + beta[dim_idx];
    }

    // Linear layer + GELU kernel
    __global__ void linear_gelu_kernel(const float* input, float* output,
                                     const float* weight, const float* bias,
                                     int batch_size, int out_dim, int in_dim) {
        int idx = blockIdx.x * blockDim.x + threadIdx.x;
        if (idx >= batch_size * out_dim) return;

        int batch_idx = idx / out_dim;
        int out_idx = idx % out_dim;

        float sum = bias[out_idx];
        for (int i = 0; i < in_dim; ++i) {
            sum += input[batch_idx * in_dim + i] * weight[out_idx * in_dim + i];
        }

        output[idx] = gelu(sum);
    }

public:
    // Encode input to latent space
    std::vector<float> encode(const std::vector<float>& input) {
        if (input.size() != static_cast<size_t>(input_dim_)) {
            throw std::runtime_error("Input dimension mismatch");
        }

        // Copy input to device
        CUDA_CHECK(cudaMemcpy(d_input_, input.data(), input_dim_ * sizeof(float), cudaMemcpyHostToDevice));

        // Encoder forward pass
        // Layer 1: 3840 → 2048
        linear_gelu_kernel<<<(2048 + 255) / 256, 256>>>(
            d_input_, d_temp1_, d_encoder_weights_[0], d_encoder_weights_[1], 1, 2048, 3840);

        // LayerNorm + GELU
        layer_norm_kernel<<<(2048 + 255) / 256, 256>>>(
            d_temp1_, d_temp1_, d_ln_gamma_[0], d_ln_beta_[0], 1, 2048);

        // Layer 2: 2048 → 1024
        linear_gelu_kernel<<<(1024 + 255) / 256, 256>>>(
            d_temp1_, d_temp2_, d_encoder_weights_[2], d_encoder_weights_[3], 1, 1024, 2048);

        // LayerNorm + GELU
        layer_norm_kernel<<<(1024 + 255) / 256, 256>>>(
            d_temp2_, d_temp2_, d_ln_gamma_[1], d_ln_beta_[1], 1, 1024);

        // Layer 3: 1024 → 512
        linear_gelu_kernel<<<(512 + 255) / 256, 256>>>(
            d_temp2_, d_latent_, d_encoder_weights_[4], d_encoder_weights_[5], 1, 512, 1024);

        // LayerNorm + GELU (final latent)
        layer_norm_kernel<<<(512 + 255) / 256, 256>>>(
            d_latent_, d_latent_, d_ln_gamma_[2], d_ln_beta_[2], 1, 512);

        // Copy result back to host
        std::vector<float> latent(latent_dim_);
        CUDA_CHECK(cudaMemcpy(latent.data(), d_latent_, latent_dim_ * sizeof(float), cudaMemcpyDeviceToHost));

        return latent;
    }

    // Batch encode multiple inputs
    std::vector<std::vector<float>> encodeBatch(const std::vector<std::vector<float>>& inputs) {
        int batch_size = inputs.size();
        std::vector<std::vector<float>> results;

        for (const auto& input : inputs) {
            results.push_back(encode(input));
        }

        return results;
    }
};

// Simple HTTP server using cpp-httplib (single header)
#include "httplib.h"

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "Usage: " << argv[0] << " <weight_file.bin>" << std::endl;
        return 1;
    }

    std::string weight_file = argv[1];

    // Initialize autoencoder
    LegalAutoencoderProjection autoencoder;

    if (!autoencoder.loadWeights(weight_file)) {
        std::cerr << "Failed to load weights" << std::endl;
        return 1;
    }

    // Start HTTP server
    httplib::Server server;

    // Health check endpoint
    server.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        res.set_content("{\"status\": \"healthy\"}", "application/json");
    });

    // Encode endpoint
    server.Post("/encode", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse JSON input
            auto json = nlohmann::json::parse(req.body);
            std::vector<float> input = json["embedding"];

            // Encode
            auto latent = autoencoder.encode(input);

            // Return result
            nlohmann::json response = {
                {"latent", latent}
            };
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            nlohmann::json error = {
                {"error", e.what()}
            };
            res.status = 400;
            res.set_content(error.dump(), "application/json");
        }
    });

    // Batch encode endpoint
    server.Post("/encode_batch", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            // Parse JSON input
            auto json = nlohmann::json::parse(req.body);
            std::vector<std::vector<float>> inputs = json["embeddings"];

            // Batch encode
            auto latents = autoencoder.encodeBatch(inputs);

            // Return result
            nlohmann::json response = {
                {"latents", latents}
            };
            res.set_content(response.dump(), "application/json");

        } catch (const std::exception& e) {
            nlohmann::json error = {
                {"error", e.what()}
            };
            res.status = 400;
            res.set_content(error.dump(), "application/json");
        }
    });

    std::cout << "Legal Autoencoder Projection Service starting on port 8081..." << std::endl;
    std::cout << "Endpoints:" << std::endl;
    std::cout << "  GET  /health" << std::endl;
    std::cout << "  POST /encode (single embedding)" << std::endl;
    std::cout << "  POST /encode_batch (multiple embeddings)" << std::endl;

    server.listen("0.0.0.0", 8081);

    return 0;
}