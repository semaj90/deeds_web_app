// Example usage of C++ error logger with LibTorch, CUDA, and native addons

#include "error-logger.hpp"
#include <torch/torch.h>
#include <cuda_runtime.h>
#include <napi.h>

using namespace ErrorLogger;

// Example 1: LibTorch inference with error logging
class LibTorchInference {
private:
    torch::jit::script::Module module_;

public:
    LibTorchInference(const std::string& model_path) {
        try {
            CPP_LOG_INFO("Loading LibTorch model: " + model_path, "LibTorch");
            module_ = torch::jit::load(model_path);
            module_.to(torch::kCUDA);
            CPP_LOG_INFO("Model loaded successfully on CUDA", "LibTorch");
        } catch (const c10::Error& e) {
            CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                "Failed to load model: " + std::string(e.what()), "", "LibTorch");
            throw;
        }
    }

    torch::Tensor forward(torch::Tensor input) {
        try {
            // Validate input
            TORCH_CHECK_ERROR(input.dim() == 2, "Input must be 2D tensor");
            TORCH_CHECK_ERROR(input.size(1) == 768, "Input must have 768 features");

            // Move to CUDA
            auto cuda_input = input.to(torch::kCUDA);

            // Forward pass
            std::vector<torch::jit::IValue> inputs;
            inputs.push_back(cuda_input);
            auto output = module_.forward(inputs).toTensor();

            return output.cpu();

        } catch (const c10::Error& e) {
            CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                "Forward pass failed: " + std::string(e.what()), "", "LibTorch");
            throw;
        }
    }
};

// Example 2: CUDA kernel with error logging
__global__ void vectorAddKernel(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

void cudaVectorAdd(const float* h_a, const float* h_b, float* h_c, int n) {
    float *d_a, *d_b, *d_c;
    size_t bytes = n * sizeof(float);

    try {
        CPP_LOG_INFO("Starting CUDA vector addition", "CUDA");

        // Allocate device memory
        CUDA_CHECK(cudaMalloc(&d_a, bytes));
        CUDA_CHECK(cudaMalloc(&d_b, bytes));
        CUDA_CHECK(cudaMalloc(&d_c, bytes));

        // Copy to device
        CUDA_CHECK(cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice));
        CUDA_CHECK(cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice));

        // Launch kernel
        int blockSize = 256;
        int gridSize = (n + blockSize - 1) / blockSize;
        vectorAddKernel<<<gridSize, blockSize>>>(d_a, d_b, d_c, n);

        // Check for kernel errors
        CUDA_CHECK(cudaGetLastError());
        CUDA_CHECK(cudaDeviceSynchronize());

        // Copy back to host
        CUDA_CHECK(cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost));

        CPP_LOG_INFO("CUDA vector addition completed", "CUDA");

        // Cleanup
        cudaFree(d_a);
        cudaFree(d_b);
        cudaFree(d_c);

    } catch (const std::exception& e) {
        CPP_LOG_CRITICAL("CUDA vector addition failed: " + std::string(e.what()), "CUDA");
        cudaFree(d_a);
        cudaFree(d_b);
        cudaFree(d_c);
        throw;
    }
}

// Example 3: N-API addon with error logging
class InferenceAddon : public Napi::ObjectWrap<InferenceAddon> {
private:
    LibTorchInference* inference_;

public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "InferenceAddon", {
            InstanceMethod("forward", &InferenceAddon::Forward),
            InstanceMethod("getErrorCount", &InferenceAddon::GetErrorCount),
            InstanceMethod("exportErrors", &InferenceAddon::ExportErrors)
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("InferenceAddon", func);
        return exports;
    }

    InferenceAddon(const Napi::CallbackInfo& info) : Napi::ObjectWrap<InferenceAddon>(info) {
        Napi::Env env = info.Env();

        try {
            if (info.Length() < 1 || !info[0].IsString()) {
                CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                    "Constructor requires model path as string argument", "", "N-API");
                throw Napi::TypeError::New(env, "Model path required");
            }

            std::string model_path = info[0].As<Napi::String>().Utf8Value();
            inference_ = new LibTorchInference(model_path);

        } catch (const std::exception& e) {
            CPP_LOG_CRITICAL("Failed to create InferenceAddon: " + std::string(e.what()), "N-API");
            throw Napi::Error::New(env, e.what());
        }
    }

    ~InferenceAddon() {
        delete inference_;
    }

    Napi::Value Forward(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        try {
            if (info.Length() < 1 || !info[0].IsTypedArray()) {
                CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                    "Forward requires Float32Array as argument", "", "N-API");
                throw Napi::TypeError::New(env, "Float32Array required");
            }

            auto input_array = info[0].As<Napi::Float32Array>();
            size_t length = input_array.ElementLength();

            // Create LibTorch tensor from N-API array
            auto options = torch::TensorOptions().dtype(torch::kFloat32);
            auto tensor = torch::from_blob(input_array.Data(), {1, static_cast<long>(length)}, options);

            // Run inference
            auto output = inference_->forward(tensor);

            // Convert back to N-API array
            auto output_array = Napi::Float32Array::New(env, output.numel());
            std::memcpy(output_array.Data(), output.data_ptr<float>(),
                       output.numel() * sizeof(float));

            CPP_LOG_INFO("Forward pass successful", "N-API");
            return output_array;

        } catch (const std::exception& e) {
            CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                "Forward pass failed: " + std::string(e.what()), "", "N-API");
            throw Napi::Error::New(env, e.what());
        }
    }

    Napi::Value GetErrorCount(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        return Napi::Number::New(env, getLogger().getErrorCount());
    }

    Napi::Value ExportErrors(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        try {
            std::string output_file = "logs/cpp-errors-export.json";
            if (info.Length() > 0 && info[0].IsString()) {
                output_file = info[0].As<Napi::String>().Utf8Value();
            }

            getLogger().exportToJson(output_file);
            CPP_LOG_INFO("Errors exported to: " + output_file, "N-API");

            return Napi::Boolean::New(env, true);

        } catch (const std::exception& e) {
            CPP_LOG_ERROR(__FILE__, __LINE__, 0,
                "Failed to export errors: " + std::string(e.what()), "", "N-API");
            return Napi::Boolean::New(env, false);
        }
    }
};

// N-API module initialization
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    // Initialize logger
    CPP_LOG_INFO("Initializing native C++ addon", "N-API");

    // Register addon class
    InferenceAddon::Init(env, exports);

    return exports;
}

NODE_API_MODULE(libtorch_inference, InitAll)
