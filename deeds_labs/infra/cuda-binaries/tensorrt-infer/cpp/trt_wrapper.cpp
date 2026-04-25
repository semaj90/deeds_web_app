#include "NvInfer.h"
#include "cuda_runtime.h"
#include <stdio.h>

using namespace nvinfer1;

class Logger : public ILogger {
public:
    void log(Severity severity, const char* msg) noexcept override {
        if (severity <= Severity::kWARNING) {
            printf("[TensorRT] %s\n", msg);
        }
    }
} gLogger;

extern "C" {

IRuntime* trtCreateRuntime() {
    return createInferRuntime(gLogger);
}

ICudaEngine* trtDeserializeEngine(IRuntime* rt, void* data, size_t size) {
    return rt->deserializeCudaEngine(data, size);
}

IExecutionContext* trtCreateContext(ICudaEngine* engine) {
    return engine->createExecutionContext();
}

bool trtEnqueueV2(IExecutionContext* ctx, void** bindings, cudaStream_t stream) {
    return ctx->enqueueV2(bindings, stream, nullptr);
}

// CUDA Graph support for batch inference optimization
cudaGraph_t trtCreateCUDAGraph(IExecutionContext* ctx, void** bindings, cudaStream_t stream) {
    cudaGraph_t graph;
    cudaGraphExec_t graphExec;

    // Begin graph capture
    cudaStreamBeginCapture(stream, cudaStreamCaptureModeGlobal);

    // Execute inference (captured into graph)
    ctx->enqueueV2(bindings, stream, nullptr);

    // End capture
    cudaStreamEndCapture(stream, &graph);

    // Instantiate graph for replay
    cudaGraphInstantiate(&graphExec, graph, NULL, NULL, 0);

    // Return executable graph (cast to cudaGraph_t for simplicity)
    return (cudaGraph_t)graphExec;
}

// Replay CUDA Graph for fast batched inference
bool trtReplayCUDAGraph(cudaGraphExec_t graphExec, cudaStream_t stream) {
    cudaError_t err = cudaGraphLaunch(graphExec, stream);
    return err == cudaSuccess;
}

// Free CUDA Graph
void trtDestroyCUDAGraph(cudaGraph_t graph, cudaGraphExec_t graphExec) {
    cudaGraphExecDestroy(graphExec);
    cudaGraphDestroy(graph);
}

}