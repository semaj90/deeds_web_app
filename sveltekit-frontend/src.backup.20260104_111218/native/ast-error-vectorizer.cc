/**
 * Phase 72: AST Error Vectorizer with LibTorch + cuBLAS
 *
 * Converts TypeScript/Svelte errors into dense vectors for GPU clustering
 *
 * Pipeline:
 * 1. Parse error messages → token sequences
 * 2. LibTorch BERT embeddings → 768-d vectors
 * 3. cuBLAS batch normalization
 * 4. Export to Phase 72 clustering pipeline
 */

#include <torch/torch.h>
#include <torch/script.h>
#include <cuda_runtime.h>
#include <cublas_v2.h>
#include <napi.h>
#include <vector>
#include <string>
#include <sstream>
#include <fstream>
#include <algorithm>
#include "error-logger.hpp"

#define EMBEDDING_DIM 768
#define MAX_SEQ_LEN 512

namespace phase72 {

/**
 * BERT Tokenizer (simplified)
 */
class SimpleTokenizer {
public:
  std::vector<int64_t> tokenize(const std::string& text) {
    std::vector<int64_t> tokens;
    std::istringstream iss(text);
    std::string word;

    while (iss >> word) {
      // Simplified: hash words to vocabulary range
      size_t hash = std::hash<std::string>{}(word);
      tokens.push_back(static_cast<int64_t>(hash % 30000)); // BERT vocab size
    }

    // Pad or truncate to MAX_SEQ_LEN
    if (tokens.size() > MAX_SEQ_LEN) {
      tokens.resize(MAX_SEQ_LEN);
    } else {
      tokens.resize(MAX_SEQ_LEN, 0); // Pad with zeros
    }

    return tokens;
  }
};

/**
 * AST Error Vectorizer
 */
class ASTErrorVectorizer {
private:
  torch::jit::script::Module model;
  SimpleTokenizer tokenizer;
  cublasHandle_t cublas_handle;
  bool use_gpu;

public:
  ASTErrorVectorizer() : use_gpu(false) {
    // Initialize cuBLAS
    cublasStatus_t status = cublasCreate(&cublas_handle);
    if (status != CUBLAS_STATUS_SUCCESS) {
      CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Failed to create cuBLAS handle", "CUBLAS_INIT_ERROR", "CUBLAS");
      use_gpu = false;
    } else {
      use_gpu = torch::cuda::is_available();
      CPP_LOG_INFO(use_gpu ? "GPU acceleration enabled" : "CPU fallback", "CUBLAS");
    }
  }

  ~ASTErrorVectorizer() {
    if (cublas_handle) {
      cublasDestroy(cublas_handle);
    }
  }

  /**
   * Load pretrained BERT model
   */
  bool loadModel(const std::string& model_path) {
    try {
      model = torch::jit::load(model_path);
      model.eval();

      if (use_gpu) {
        model.to(torch::kCUDA);
      }

      CPP_LOG_INFO("Loaded BERT model from " + model_path, "TORCH");
      return true;

    } catch (const c10::Error& e) {
      CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Failed to load model: " + std::string(e.what()), "MODEL_LOAD_ERROR", "TORCH");
      return false;
    }
  }

  /**
   * Generate embedding for single error message
   */
  std::vector<float> generateEmbedding(const std::string& error_message) {
    try {
      // Tokenize error message
      auto tokens = tokenizer.tokenize(error_message);

      // Convert to tensor
      torch::Tensor input_tensor = torch::tensor(tokens, torch::kInt64).unsqueeze(0);

      if (use_gpu) {
        input_tensor = input_tensor.to(torch::kCUDA);
      }

      // Forward pass through BERT
      std::vector<torch::jit::IValue> inputs;
      inputs.push_back(input_tensor);

      torch::Tensor output = model.forward(inputs).toTensor();

      // Mean pooling over sequence dimension
      torch::Tensor pooled = output.mean(1).squeeze();

      // Normalize with cuBLAS (GPU) or torch (CPU)
      if (use_gpu && cublas_handle) {
        pooled = normalizeWithCuBLAS(pooled);
      } else {
        pooled = torch::nn::functional::normalize(pooled, torch::nn::functional::NormalizeFuncOptions().p(2).dim(0));
      }

      // Convert to CPU and extract values
      pooled = pooled.to(torch::kCPU);
      auto accessor = pooled.accessor<float, 1>();

      std::vector<float> embedding(EMBEDDING_DIM);
      for (int i = 0; i < EMBEDDING_DIM; ++i) {
        embedding[i] = accessor[i];
      }

      return embedding;

    } catch (const c10::Error& e) {
      CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Embedding failed: " + std::string(e.what()), "EMBEDDING_ERROR", "TORCH");
      return std::vector<float>(EMBEDDING_DIM, 0.0f);
    }
  }

  /**
   * Batch generate embeddings for multiple errors
   */
  std::vector<std::vector<float>> generateBatchEmbeddings(const std::vector<std::string>& error_messages) {
    std::vector<std::vector<float>> embeddings;
    embeddings.reserve(error_messages.size());

    for (const auto& msg : error_messages) {
      embeddings.push_back(generateEmbedding(msg));
    }

    return embeddings;
  }

private:
  /**
   * L2 normalization using cuBLAS
   */
  torch::Tensor normalizeWithCuBLAS(torch::Tensor input) {
    float* d_data = input.data_ptr<float>();
    int n = input.numel();

    // Compute L2 norm using cuBLAS
    float norm = 0.0f;
    cublasStatus_t status = cublasSnrm2(cublas_handle, n, d_data, 1, &norm);

    if (status != CUBLAS_STATUS_SUCCESS || norm == 0.0f) {
      CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Normalization failed", "CUBLAS_NORM_ERROR", "CUBLAS");
      return input;
    }

    // Scale by 1/norm
    float alpha = 1.0f / norm;
    status = cublasSscal(cublas_handle, n, &alpha, d_data, 1);

    if (status != CUBLAS_STATUS_SUCCESS) {
      CPP_LOG_ERROR(__FILE__, __LINE__, 0, "Scaling failed", "CUBLAS_SCALE_ERROR", "CUBLAS");
    }

    return input;
  }
};

// ==================== N-API Bindings ====================

/**
 * N-API wrapper for Node.js integration
 */
class ASTVectorizerAddon : public Napi::ObjectWrap<ASTVectorizerAddon> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "ASTVectorizer", {
      InstanceMethod("loadModel", &ASTVectorizerAddon::LoadModel),
      InstanceMethod("generateEmbedding", &ASTVectorizerAddon::GenerateEmbedding),
      InstanceMethod("generateBatch", &ASTVectorizerAddon::GenerateBatch),
      InstanceMethod("getErrorCount", &ASTVectorizerAddon::GetErrorCount),
      InstanceMethod("exportErrors", &ASTVectorizerAddon::ExportErrors)
    });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("ASTVectorizer", func);
    return exports;
  }

  ASTVectorizerAddon(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<ASTVectorizerAddon>(info) {
    vectorizer = new ASTErrorVectorizer();
  }

  ~ASTVectorizerAddon() {
    delete vectorizer;
  }

private:
  ASTErrorVectorizer* vectorizer;

  Napi::Value LoadModel(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string model_path = info[0].As<Napi::String>().Utf8Value();
    bool success = vectorizer->loadModel(model_path);

    return Napi::Boolean::New(env, success);
  }

  Napi::Value GenerateEmbedding(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "String expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    std::string error_message = info[0].As<Napi::String>().Utf8Value();
    auto embedding = vectorizer->generateEmbedding(error_message);

    Napi::Array result = Napi::Array::New(env, embedding.size());
    for (size_t i = 0; i < embedding.size(); ++i) {
      result[i] = Napi::Number::New(env, embedding[i]);
    }

    return result;
  }

  Napi::Value GenerateBatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsArray()) {
      Napi::TypeError::New(env, "Array expected").ThrowAsJavaScriptException();
      return env.Null();
    }

    Napi::Array input = info[0].As<Napi::Array>();
    std::vector<std::string> error_messages;

    for (uint32_t i = 0; i < input.Length(); ++i) {
      Napi::Value val = input[i];
      if (val.IsString()) {
        error_messages.push_back(val.As<Napi::String>().Utf8Value());
      }
    }

    auto embeddings = vectorizer->generateBatchEmbeddings(error_messages);

    Napi::Array result = Napi::Array::New(env, embeddings.size());
    for (size_t i = 0; i < embeddings.size(); ++i) {
      Napi::Array emb_array = Napi::Array::New(env, embeddings[i].size());
      for (size_t j = 0; j < embeddings[i].size(); ++j) {
        emb_array[j] = Napi::Number::New(env, embeddings[i][j]);
      }
      result[i] = emb_array;
    }

    return result;
  }

  Napi::Value GetErrorCount(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    int count = ErrorLogger::getLogger().getErrorCount();
    return Napi::Number::New(env, count);
  }

  Napi::Value ExportErrors(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    // Export to temp file and read it back
    std::string temp_file = "temp_errors.json";
    ErrorLogger::getLogger().exportToJson(temp_file);
    std::ifstream file(temp_file);
    std::string json((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    return Napi::String::New(env, json);
  }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  return ASTVectorizerAddon::Init(env, exports);
}

NODE_API_MODULE(ast_error_vectorizer, Init)

} // namespace phase72
