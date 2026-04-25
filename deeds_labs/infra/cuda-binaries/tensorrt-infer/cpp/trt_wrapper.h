#pragma once
#include "NvInfer.h"

#ifdef __cplusplus
extern "C" {
#endif

nvinfer1::IRuntime* trtCreateRuntime();
nvinfer1::ICudaEngine* trtDeserializeEngine(nvinfer1::IRuntime*, void*, size_t);
nvinfer1::IExecutionContext* trtCreateContext(nvinfer1::ICudaEngine*);
bool trtEnqueueV2(nvinfer1::IExecutionContext*, void**, cudaStream_t);

#ifdef __cplusplus
}
#endif