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

}