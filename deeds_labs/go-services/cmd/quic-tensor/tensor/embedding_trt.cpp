#include <NvInfer.h>
#include <cuda_runtime_api.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h> // For malloc, free
#include <string.h> // For memcpy
#include <vector>


// A simple logger for TensorRT
class Logger : public nvinfer1::ILogger {
public:
    void log(Severity severity, const char* msg) noexcept override {
        // For warnings and errors, print to stderr
        if (severity <= Severity::kERROR) {
            fprintf(stderr, "TRT Error: %s\n", msg);
        } else if (severity <= Severity::kWARNING) {
            fprintf(stderr, "TRT Warning: %s\n", msg);
        }
        // For info and verbose, print to stdout
        else {
            fprintf(stdout, "TRT Info: %s\n", msg);
        }
    }
} gLogger;

static nvinfer1::IRuntime* runtime = NULL;
static nvinfer1::ICudaEngine* engine = NULL;
static nvinfer1::IExecutionContext* context = NULL;

// Helper macros / functions for error checking (minimal)
static inline bool checkCuda(cudaError_t code, const char *msg) {
  if (code != cudaSuccess) {
    fprintf(stderr, "CUDA Error (%s): %s\n", msg, cudaGetErrorString(code));
    return false;
  }
  return true;
}

extern "C" int loadTRTEngine(const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        fprintf(stderr, "Error: Failed to open engine file %s\n", path);
        return -1;
    }
    if (fseek(f, 0, SEEK_END) != 0) {
      fclose(f);
      fprintf(stderr, "Error: fseek failed for engine file %s\n", path);
      return -1;
    }
    long sz = ftell(f);
    if (sz <= 0) {
      fclose(f);
      fprintf(stderr, "Error: engine file %s has invalid size\n", path);
      return -1;
    }
    rewind(f);
    void *data = malloc((size_t)sz);
    if (!data) {
        fprintf(stderr, "Error: Failed to allocate memory for engine data\n");
        fclose(f);
        return -1;
    }
    size_t read = fread(data, 1, (size_t)sz, f);
    fclose(f);
    if (read != (size_t)sz) {
      fprintf(stderr, "Error: Failed to read full engine file (%zu != %zu)\n",
              read, (size_t)sz);
      free(data);
      return -1;
    }

    runtime = nvinfer1::createInferRuntime(gLogger);
    if (!runtime) {
        fprintf(stderr, "Error: Failed to create TensorRT runtime\n");
        free(data);
        return -1;
    }
    engine = runtime->deserializeCudaEngine(data, (size_t)sz);
    if (!engine) {
        fprintf(stderr, "Error: Failed to deserialize CUDA engine\n");
        runtime->destroy();
        runtime = nullptr;
        free(data);
        return -1;
    }
    context = engine->createExecutionContext();
    if (!context) {
        fprintf(stderr, "Error: Failed to create execution context\n");
        engine->destroy();
        engine = nullptr;
        runtime->destroy();
        runtime = nullptr;
        free(data);
        return -1;
    }
    free(data);
    return 0;
}

// Add an unload helper so callers can cleanup
extern "C" void unloadTRTEngine() {
  if (context) {
    context->destroy();
    context = nullptr;
  }
  if (engine) {
    engine->destroy();
    engine = nullptr;
  }
  if (runtime) {
    runtime->destroy();
    runtime = nullptr;
  }
}

// Placeholder for tokenization and actual inference logic
// This function needs significant expansion to handle real tokenization,
// input tensor creation, and binding to the TensorRT engine.
// For now, it simulates the process.
extern "C" float runEmbedding(const int *input_ids, const int *attention_mask,
                              int maxLen, float *out) {
  if (!context || !engine) {
    fprintf(stderr,
            "Error: TensorRT engine not loaded or context not created.\n");
    return -1.0f;
  }

  cudaStream_t stream = nullptr;
  if (!checkCuda(cudaStreamCreate(&stream), "cudaStreamCreate")) {
    return -1.0f;
  }

  // 2. Get input/output binding indices and dimensions from the engine.
  int inputIdsIdx = engine->getBindingIndex("input_ids");
  int attentionMaskIdx = engine->getBindingIndex("attention_mask");
  int outputEmbeddingsIdx = engine->getBindingIndex("output_embeddings");

  if (inputIdsIdx == -1 || attentionMaskIdx == -1 ||
      outputEmbeddingsIdx == -1) {
    fprintf(stderr,
            "Error: One or more binding names not found in engine. "
            "Expected 'input_ids', 'attention_mask', 'output_embeddings'. "
            "Please check your TensorRT engine's binding names.\n");
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  nvinfer1::Dims outputEmbeddingsDims =
      engine->getBindingDimensions(outputEmbeddingsIdx);

  // Assuming batch size 1 and sequence length maxLen for inputs.
  size_t inputIdsSize = (size_t)maxLen * sizeof(int);
  size_t attentionMaskSize = (size_t)maxLen * sizeof(int);

  // Calculate output buffer size. Handle dims.nbDims == 0 guard.
  size_t outputEmbeddingsCount = 1;
  if (outputEmbeddingsDims.nbDims <= 0) {
    // fallback: assume 1 element if dims unknown
    outputEmbeddingsCount = 1;
  } else {
    for (int i = 0; i < outputEmbeddingsDims.nbDims; ++i) {
      // if any dimension is <=0 treat as 1 to avoid size_t underflow
      int d = outputEmbeddingsDims.d[i] > 0 ? outputEmbeddingsDims.d[i] : 1;
      outputEmbeddingsCount *= (size_t)d;
    }
  }
  size_t outputEmbeddingsSize = outputEmbeddingsCount * sizeof(float);

  // 3. Allocate device memory for inputs and outputs.
  const int nbBindings = engine->getNbBindings();
  std::vector<void *> buffers(nbBindings, nullptr);

  bool allocOk = true;
  if (!checkCuda(cudaMalloc(&buffers[inputIdsIdx], inputIdsSize),
                 "cudaMalloc input_ids"))
    allocOk = false;
  if (!checkCuda(cudaMalloc(&buffers[attentionMaskIdx], attentionMaskSize),
                 "cudaMalloc attention_mask"))
    allocOk = false;
  if (!checkCuda(
          cudaMalloc(&buffers[outputEmbeddingsIdx], outputEmbeddingsSize),
          "cudaMalloc output_embeddings"))
    allocOk = false;

  if (!allocOk) {
    fprintf(stderr, "Error: Failed to allocate device memory.\n");
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  // 4. Copy tokenized input from host to device.
  if (!checkCuda(cudaMemcpyAsync(buffers[inputIdsIdx], input_ids, inputIdsSize,
                                 cudaMemcpyHostToDevice, stream),
                 "cudaMemcpyAsync input_ids")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaStreamDestroy(stream);
    return -1.0f;
  }
  if (!checkCuda(cudaMemcpyAsync(buffers[attentionMaskIdx], attention_mask,
                                 attentionMaskSize, cudaMemcpyHostToDevice,
                                 stream),
                 "cudaMemcpyAsync attention_mask")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  // 5. Execute inference.
  cudaEvent_t startEvent = nullptr, endEvent = nullptr;
  if (!checkCuda(cudaEventCreate(&startEvent), "cudaEventCreate start") ||
      !checkCuda(cudaEventCreate(&endEvent), "cudaEventCreate end")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    if (startEvent)
      cudaEventDestroy(startEvent);
    if (endEvent)
      cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  if (!checkCuda(cudaEventRecord(startEvent, stream),
                 "cudaEventRecord start")) {
    // cleanup
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  // Note: enqueueV2 returns bool in newer TRT versions; it may throw otherwise.
  if (!context->enqueueV2(buffers.data(), stream, nullptr)) {
    fprintf(stderr, "Error: context->enqueueV2 failed\n");
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  if (!checkCuda(cudaEventRecord(endEvent, stream), "cudaEventRecord end")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }
  if (!checkCuda(cudaEventSynchronize(endEvent), "cudaEventSynchronize end")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  float milliseconds = 0;
  if (!checkCuda(cudaEventElapsedTime(&milliseconds, startEvent, endEvent),
                 "cudaEventElapsedTime")) {
    milliseconds = -1.0f;
  }

  // 6. Copy output from device to host 'out'.
  if (!checkCuda(cudaMemcpyAsync(out, buffers[outputEmbeddingsIdx],
                                 outputEmbeddingsSize, cudaMemcpyDeviceToHost,
                                 stream),
                 "cudaMemcpyAsync output")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }
  if (!checkCuda(cudaStreamSynchronize(stream), "cudaStreamSynchronize")) {
    for (void *b : buffers)
      if (b)
        cudaFree(b);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);
    return -1.0f;
  }

  // 7. Free device memory.
  for (void *b : buffers)
    if (b)
      cudaFree(b);

  // 8. Clean up events & stream.
  cudaEventDestroy(startEvent);
  cudaEventDestroy(endEvent);
  cudaStreamDestroy(stream);

  return milliseconds; // Returns inference latency in ms
}