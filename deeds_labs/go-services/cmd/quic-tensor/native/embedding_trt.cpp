#ifdef _MSC_VER
#define _CRT_SECURE_NO_WARNINGS
#endif

#include <NvInfer.h>
#include <cuda_runtime.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>

// A simple logger for TensorRT
class Logger : public nvinfer1::ILogger {
public:
	void log(nvinfer1::ILogger::Severity severity, const char* msg) noexcept override {
		// For warnings and errors, print to stderr
		if (severity <= nvinfer1::ILogger::Severity::kERROR) {
			fprintf(stderr, "TRT Error: %s\n", msg);
		} else if (severity <= nvinfer1::ILogger::Severity::kWARNING) {
			fprintf(stderr, "TRT Warning: %s\n", msg);
		} else {
			fprintf(stdout, "TRT Info: %s\n", msg);
		}
	}
} gLogger;

static nvinfer1::IRuntime* runtime = nullptr;
static nvinfer1::ICudaEngine* engine = nullptr;
static nvinfer1::IExecutionContext* context = nullptr;

// Load a serialized TensorRT engine from disk
extern "C" int loadTRTEngine(const char* path) {
	std::FILE* f = nullptr;
#if defined(_MSC_VER)
	if (fopen_s(&f, path, "rb") != 0) f = nullptr;
#else
	f = std::fopen(path, "rb");
#endif
	if (!f) {
		fprintf(stderr, "Error: Failed to open engine file %s\n", path);
		return -1;
	}
	fseek(f, 0, SEEK_END);
	long sz = ftell(f);
	rewind(f);
	if (sz <= 0) {
		fprintf(stderr, "Error: Engine file empty or unreadable: %s\n", path);
		fclose(f);
		return -1;
	}
	void* data = std::malloc(sz);
	if (!data) {
		fprintf(stderr, "Error: Failed to allocate memory for engine data\n");
		fclose(f);
		return -1;
	}
	size_t read = fread(data, 1, sz, f);
	fclose(f);
	if (read != (size_t)sz) {
		fprintf(stderr, "Error: Failed to read entire engine file\n");
		std::free(data);
		return -1;
	}

	runtime = nvinfer1::createInferRuntime(gLogger);
	if (!runtime) {
		fprintf(stderr, "Error: Failed to create TensorRT runtime\n");
		std::free(data);
		return -1;
	}
	engine = runtime->deserializeCudaEngine(data, static_cast<size_t>(sz));
	if (!engine) {
		fprintf(stderr, "Error: Failed to deserialize CUDA engine\n");
		runtime->destroy();
		runtime = nullptr;
		std::free(data);
		return -1;
	}
	context = engine->createExecutionContext();
	if (!context) {
		fprintf(stderr, "Error: Failed to create execution context\n");
		engine->destroy();
		engine = nullptr;
		runtime->destroy();
		runtime = nullptr;
		std::free(data);
		return -1;
	}
	std::free(data);
	return 0;
}

// Run inference: input_ids and attention_mask are host pointers; out must point to host memory large enough for the output
// Returns inference latency in milliseconds or negative on error.
extern "C" float runEmbedding(const int* input_ids, const int* attention_mask, int maxLen, float* out) {
	if (!context || !engine) {
		fprintf(stderr, "Error: TensorRT engine not loaded or context not created.\n");
		return -1.0f;
	}
	if (!input_ids || !attention_mask || !out || maxLen <= 0) {
		fprintf(stderr, "Error: Invalid input pointers or maxLen\n");
		return -1.0f;
	}

	cudaStream_t stream = nullptr;
	if (cudaStreamCreate(&stream) != cudaSuccess) {
		fprintf(stderr, "Error: Failed to create CUDA stream\n");
		return -1.0f;
	}

	// Resolve binding indices (names must match the engine)
	int inputIdsIdx = engine->getBindingIndex("input_ids");
	int attentionMaskIdx = engine->getBindingIndex("attention_mask");
	int outputEmbeddingsIdx = engine->getBindingIndex("output_embeddings");

	if (inputIdsIdx == -1 || attentionMaskIdx == -1 || outputEmbeddingsIdx == -1) {
		fprintf(stderr, "Error: One or more binding names not found in engine. "
						"Expected 'input_ids', 'attention_mask', 'output_embeddings'.\n");
		cudaStreamDestroy(stream);
		return -1.0f;
	}

	// Compute sizes
	size_t inputIdsSize = static_cast<size_t>(maxLen) * sizeof(int);
	size_t attentionMaskSize = static_cast<size_t>(maxLen) * sizeof(int);

	nvinfer1::Dims outDims = engine->getBindingDimensions(outputEmbeddingsIdx);
	if (outDims.nbDims <= 0) {
		fprintf(stderr, "Error: output binding has invalid dimensions\n");
		cudaStreamDestroy(stream);
		return -1.0f;
	}
	size_t outElemCount = 1;
	for (int i = 0; i < outDims.nbDims; ++i) outElemCount *= static_cast<size_t>(outDims.d[i]);
	size_t outputEmbeddingsSize = outElemCount * sizeof(float);

	// Prepare device buffers
	std::vector<void*> buffers(engine->getNbBindings(), nullptr);
	if (cudaMalloc(&buffers[inputIdsIdx], inputIdsSize) != cudaSuccess ||
		cudaMalloc(&buffers[attentionMaskIdx], attentionMaskSize) != cudaSuccess ||
		cudaMalloc(&buffers[outputEmbeddingsIdx], outputEmbeddingsSize) != cudaSuccess) {
		fprintf(stderr, "Error: Failed to allocate device memory for one or more bindings\n");
		// free any allocated buffers
		for (void* b : buffers) if (b) cudaFree(b);
		cudaStreamDestroy(stream);
		return -1.0f;
	}

	// Copy inputs to device
	if (cudaMemcpyAsync(buffers[inputIdsIdx], input_ids, inputIdsSize, cudaMemcpyHostToDevice, stream) != cudaSuccess ||
		cudaMemcpyAsync(buffers[attentionMaskIdx], attention_mask, attentionMaskSize, cudaMemcpyHostToDevice, stream) != cudaSuccess) {
		fprintf(stderr, "Error: cudaMemcpyAsync host->device failed\n");
		for (void* b : buffers) if (b) cudaFree(b);
		cudaStreamDestroy(stream);
		return -1.0f;
	}

	// Timing events
	cudaEvent_t startEvent = nullptr, endEvent = nullptr;
	cudaEventCreate(&startEvent);
	cudaEventCreate(&endEvent);

	cudaEventRecord(startEvent, stream);
	// Execute inference (assumes batch=1 and bindings prepared)
	bool ok = context->enqueueV2(buffers.data(), stream, nullptr);
	cudaEventRecord(endEvent, stream);
	cudaEventSynchronize(endEvent);

	float milliseconds = -1.0f;
	if (!ok) {
		fprintf(stderr, "Error: context->enqueueV2 failed\n");
	} else {
		cudaEventElapsedTime(&milliseconds, startEvent, endEvent);
		// Copy output back to host
		if (cudaMemcpyAsync(out, buffers[outputEmbeddingsIdx], outputEmbeddingsSize, cudaMemcpyDeviceToHost, stream) != cudaSuccess) {
			fprintf(stderr, "Error: cudaMemcpyAsync device->host failed\n");
			milliseconds = -1.0f;
		}
		cudaStreamSynchronize(stream);
	}

	// Cleanup
	for (void* b : buffers) if (b) cudaFree(b);
	cudaEventDestroy(startEvent);
	cudaEventDestroy(endEvent);
	cudaStreamDestroy(stream);

	return milliseconds;
}