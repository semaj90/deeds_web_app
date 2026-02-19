#include <NvInfer.h>
#include <cuda_runtime_api.h>
#include <stdio.h>
#include <stdlib.h> // For malloc, free
#include <string.h> // For memcpy
#include <time.h>   // For clock

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

extern "C" int loadTRTEngine(const char* path) {
    FILE* f = fopen(path, "rb");
    if (!f) {
        fprintf(stderr, "Error: Failed to open engine file %s\n", path);
        return -1;
    }
    fseek(f, 0, SEEK_END);
    long sz = ftell(f);
    rewind(f);
    void* data = malloc(sz);
    if (!data) {
        fprintf(stderr, "Error: Failed to allocate memory for engine data\n");
        fclose(f);
        return -1;
    }
    fread(data, 1, sz, f);
    fclose(f);

    runtime = nvinfer1::createInferRuntime(gLogger);
    if (!runtime) {
        fprintf(stderr, "Error: Failed to create TensorRT runtime\n");
        free(data);
        return -1;
    }
    engine = runtime->deserializeCudaEngine(data, sz);
    if (!engine) {
        fprintf(stderr, "Error: Failed to deserialize CUDA engine\n");
        runtime->destroy();
        free(data);
        return -1;
    }
    context = engine->createExecutionContext();
    if (!context) {
        fprintf(stderr, "Error: Failed to create execution context\n");
        engine->destroy();
        runtime->destroy();
        free(data);
        return -1;
    }
    free(data);
    return 0;
}

// Placeholder for tokenization and actual inference logic
// This function needs significant expansion to handle real tokenization,
// input tensor creation, and binding to the TensorRT engine.
// For now, it simulates the process.
extern "C" float runEmbedding(const char* text, float* out, int maxLen) {
    if (!context || !engine) {
        fprintf(stderr, "Error: TensorRT engine not loaded or context not created.\n");
        return -1.0f;
    }

    cudaStream_t stream;
    cudaStreamCreate(&stream);

    // --- REAL INFERENCE IMPLEMENTATION ---

    // 1. Tokenize 'text' into input IDs and create an attention mask.
    //    This is a critical step that requires a tokenizer library (e.g., SentencePiece, Hugging Face tokenizers).
    //    You need to replace this with actual tokenization logic based on your model.
    //    For demonstration, we'll use dummy token IDs and attention mask.
    int* hostInputIds = (int*)malloc(maxLen * sizeof(int));
    int* hostAttentionMask = (int*)malloc(maxLen * sizeof(int));
    if (!hostInputIds || !hostAttentionMask) {
        fprintf(stderr, "Error: Failed to allocate host memory for tokenization.\n");
        cudaStreamDestroy(stream);
        free(hostInputIds);
        free(hostAttentionMask);
        return -1.0f;
    }

    // Dummy tokenization: fill with sequential IDs and all 1s for attention mask.
    // Replace this loop with your actual tokenizer output.
    for (int i = 0; i < maxLen; ++i) {
        hostInputIds[i] = i % 100; // Example: dummy token IDs
        hostAttentionMask[i] = 1;  // All tokens are attended
    }
    // If the text is shorter than maxLen, pad and set attention mask accordingly.

    // 2. Get input/output binding indices and dimensions from the engine.
    //    Adjust binding names ("input_ids", "attention_mask", "output_embeddings") if your model uses different ones.
    int inputIdsIdx = engine->getBindingIndex("input_ids");
    int attentionMaskIdx = engine->getBindingIndex("attention_mask");
    int outputEmbeddingsIdx = engine->getBindingIndex("output_embeddings");

    if (inputIdsIdx == -1 || attentionMaskIdx == -1 || outputEmbeddingsIdx == -1) {
        fprintf(stderr, "Error: One or more binding names not found in engine. "
                        "Expected 'input_ids', 'attention_mask', 'output_embeddings'. "
                        "Please check your TensorRT engine's binding names.\n");
        cudaStreamDestroy(stream);
        free(hostInputIds);
        free(hostAttentionMask);
        return -1.0f;
    }

    nvinfer1::Dims outputEmbeddingsDims = engine->getBindingDimensions(outputEmbeddingsIdx);

    // Assuming batch size 1 and sequence length maxLen for inputs.
    size_t inputIdsSize = maxLen * sizeof(int);
    size_t attentionMaskSize = maxLen * sizeof(int);

    // Calculate output buffer size. 'out' must be pre-allocated by the caller to this size.
    size_t outputEmbeddingsSize = 1;
    for (int i = 0; i < outputEmbeddingsDims.nbDims; ++i) {
        outputEmbeddingsSize *= outputEmbeddingsDims.d[i];
    }
    outputEmbeddingsSize *= sizeof(float); // Assuming float output type

    // 3. Allocate device memory for inputs and outputs.
    void* buffers[engine->getNbBindings()];
    cudaMalloc(&buffers[inputIdsIdx], inputIdsSize);
    cudaMalloc(&buffers[attentionMaskIdx], attentionMaskSize);
    cudaMalloc(&buffers[outputEmbeddingsIdx], outputEmbeddingsSize);

    if (!buffers[inputIdsIdx] || !buffers[attentionMaskIdx] || !buffers[outputEmbeddingsIdx]) {
        fprintf(stderr, "Error: Failed to allocate device memory.\n");
        cudaStreamDestroy(stream);
        free(hostInputIds);
        free(hostAttentionMask);
        if (buffers[inputIdsIdx]) cudaFree(buffers[inputIdsIdx]);
        if (buffers[attentionMaskIdx]) cudaFree(buffers[attentionMaskIdx]);
        if (buffers[outputEmbeddingsIdx]) cudaFree(buffers[outputEmbeddingsIdx]);
        return -1.0f;
    }

    // 4. Copy tokenized input from host to device.
    cudaMemcpyAsync(buffers[inputIdsIdx], hostInputIds, inputIdsSize, cudaMemcpyHostToDevice, stream);
    cudaMemcpyAsync(buffers[attentionMaskIdx], hostAttentionMask, attentionMaskSize, cudaMemcpyHostToDevice, stream);

    // 5. Execute inference.
    cudaEvent_t startEvent, endEvent;
    cudaEventCreate(&startEvent);
    cudaEventCreate(&endEvent);

    cudaEventRecord(startEvent, stream);
    context->enqueueV2(buffers, stream, nullptr); // Execute inference
    cudaEventRecord(endEvent, stream);
    cudaEventSynchronize(endEvent);

    float milliseconds = 0;
    cudaEventElapsedTime(&milliseconds, startEvent, endEvent);

    // 6. Copy output from device to host 'out'.
    //    Ensure 'out' (passed as a parameter) has enough allocated memory on the host side
    //    to receive the output (size: outputEmbeddingsSize / sizeof(float)).
    cudaMemcpyAsync(out, buffers[outputEmbeddingsIdx], outputEmbeddingsSize, cudaMemcpyDeviceToHost, stream);
    cudaStreamSynchronize(stream); // Ensure copy is complete before returning

    // 7. Free device memory.
    cudaFree(buffers[inputIdsIdx]);
    cudaFree(buffers[attentionMaskIdx]);
    cudaFree(buffers[outputEmbeddingsIdx]);

    // 8. Clean up host memory and events.
    free(hostInputIds);
    free(hostAttentionMask);
    cudaEventDestroy(startEvent);
    cudaEventDestroy(endEvent);
    cudaStreamDestroy(stream);

    // --- END REAL INFERENCE IMPLEMENTATION ---

    return milliseconds; // Returns inference latency in ms
}
