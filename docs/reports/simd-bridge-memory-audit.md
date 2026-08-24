# SIMD Bridge Memory & VRAM Safety Audit

## Execution Overview
- **Run ID**: \`simd-audit-1787598731105\`
- **Timestamp**: 2026-08-24T19:12:11.105Z
- **Scanned Files**: \`binding.cc\`, \`cuda_graph_bridge.cu\`, \`cuvs_bridge.cc\`, \`gpu_error_codes.h\`, \`libtorch_stubs.cc\`, \`lstm_bridge.cc\`, \`lstm_gpu.cu\`, \`pytorch_graph.cc\`, \`pytorch_graph_fp16.cc\`, \`simdjson_bridge.cc\`, \`som_cache.cu\`, \`tensor_bridge.cc\`

## Summary Statistics
- **Total Findings**: 104
- **High Severity Risks**: 13
- **Medium Severity Risks**: 58
- **Low/Safe Allocations**: 57

### Classification Matrix
- **gpu_allocation (CUDA VRAM)**: 14
- **napi_buffer (GC / Host memory)**: 12
- **tensor_lifetime (LibTorch blocks)**: 0
- **missing_timeout (Deadlock vector)**: 45
- **missing_cpu_fallback (OOM safety)**: 2
- **possible_concurrent_gpu_job (Synch locks)**: 7
- **safe (Pooled recyclers)**: 24

---

## High & Medium Severity Findings Detail


### Finding #1: binding.cc:59 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`napi_status napi_create_external_arraybuffer(napi_env, void*, size_t, napi_finalize, void*, napi_value*);\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #2: binding.cc:156 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`// Strategy: napi_create_external_arraybuffer transfers ownership of a raw\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #3: binding.cc:246 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`return napi_create_external_arraybuffer(\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #4: cuda_graph_bridge.cu:113 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`if (it->second.d_input) cudaFree(it->second.d_input);\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #5: cuda_graph_bridge.cu:114 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`if (it->second.d_output) cudaFree(it->second.d_output);\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #6: cuda_graph_bridge.cu:124 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`if (!cudaOk(cudaMalloc(&e.d_input, e.input_bytes), "cudaMalloc input")) return -2;\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #7: cuda_graph_bridge.cu:125 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`if (!cudaOk(cudaMalloc(&e.d_output, e.output_bytes), "cudaMalloc output")) {\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #8: cuda_graph_bridge.cu:126 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`cudaFree(e.d_input);\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #9: cuda_graph_bridge.cu:136 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`cudaFree(e.d_input); cudaFree(e.d_output); return -3;\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #10: cuda_graph_bridge.cu:140 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`cudaStreamDestroy(stream); cudaFree(e.d_input); cudaFree(e.d_output); return -4;\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #11: cuda_graph_bridge.cu:148 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`cudaStreamDestroy(stream); cudaFree(e.d_input); cudaFree(e.d_output); return -5;\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #12: cuda_graph_bridge.cu:153 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`cudaStreamDestroy(stream); cudaFree(e.d_input); cudaFree(e.d_output); return -6;\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #13: cuda_graph_bridge.cu:205 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaStreamSynchronize\`
- **Trigger Snippet**: \`if (!cudaOk(cudaStreamSynchronize(stream), "StreamSync")) return -8;\`
- **Architectural Risk**: *"Synchronous GPU block (deadlock risk under concurrent jobs)"*


### Finding #14: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: replayGraphOnStream\`
- **Architectural Risk**: *"Native entrypoint "replayGraphOnStream" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #15: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: captureGraph\`
- **Architectural Risk**: *"Native entrypoint "captureGraph" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #16: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: replayGraph\`
- **Architectural Risk**: *"Native entrypoint "replayGraph" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #17: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: replayGraphOnStream\`
- **Architectural Risk**: *"Native entrypoint "replayGraphOnStream" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #18: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: cudaGraphCount\`
- **Architectural Risk**: *"Native entrypoint "cudaGraphCount" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #19: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: cudaStreamCount\`
- **Architectural Risk**: *"Native entrypoint "cudaStreamCount" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #20: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: captureGraph\`
- **Architectural Risk**: *"Native entrypoint "captureGraph" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #21: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: replayGraph\`
- **Architectural Risk**: *"Native entrypoint "replayGraph" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #22: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: replayGraphOnStream\`
- **Architectural Risk**: *"Native entrypoint "replayGraphOnStream" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #23: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: cudaGraphCount\`
- **Architectural Risk**: *"Native entrypoint "cudaGraphCount" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #24: cuda_graph_bridge.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: cudaStreamCount\`
- **Architectural Risk**: *"Native entrypoint "cudaStreamCount" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #25: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: graphSimilarity\`
- **Architectural Risk**: *"Native entrypoint "graphSimilarity" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #26: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: clusterEmbeddings\`
- **Architectural Risk**: *"Native entrypoint "clusterEmbeddings" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #27: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: computeCaseEmbedding\`
- **Architectural Risk**: *"Native entrypoint "computeCaseEmbedding" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #28: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: checkCudaAvailable\`
- **Architectural Risk**: *"Native entrypoint "checkCudaAvailable" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #29: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: pageRankGPU\`
- **Architectural Risk**: *"Native entrypoint "pageRankGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #30: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: attentionScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "attentionScoreGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #31: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: rewardScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "rewardScoreGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #32: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: softmaxGPU\`
- **Architectural Risk**: *"Native entrypoint "softmaxGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #33: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: topKIndicesGPU\`
- **Architectural Risk**: *"Native entrypoint "topKIndicesGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #34: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: kmeansWithCentroids\`
- **Architectural Risk**: *"Native entrypoint "kmeansWithCentroids" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #35: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: trainSOM\`
- **Architectural Risk**: *"Native entrypoint "trainSOM" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #36: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: batchCosineSimilarity\`
- **Architectural Risk**: *"Native entrypoint "batchCosineSimilarity" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #37: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: graphSimilarityHalf\`
- **Architectural Risk**: *"Native entrypoint "graphSimilarityHalf" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #38: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: getCudaMemory\`
- **Architectural Risk**: *"Native entrypoint "getCudaMemory" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #39: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: autoencoderEncodeGPU\`
- **Architectural Risk**: *"Native entrypoint "autoencoderEncodeGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #40: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: autoencoderDecodeGPU\`
- **Architectural Risk**: *"Native entrypoint "autoencoderDecodeGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #41: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: pcaProjectGPU\`
- **Architectural Risk**: *"Native entrypoint "pcaProjectGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #42: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_run_lstm\`
- **Architectural Risk**: *"Native entrypoint "bridge_run_lstm" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #43: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_dot_product\`
- **Architectural Risk**: *"Native entrypoint "bridge_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #44: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_scale\`
- **Architectural Risk**: *"Native entrypoint "bridge_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #45: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_relu\`
- **Architectural Risk**: *"Native entrypoint "bridge_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #46: lstm_gpu.cu:25 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`// Avoids cudaMalloc/cudaFree per call. Thread-local to avoid contention.\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #47: lstm_gpu.cu:25 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`// Avoids cudaMalloc/cudaFree per call. Thread-local to avoid contention.\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #48: lstm_gpu.cu:35 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`if (ptr) cudaFree(ptr);\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #49: lstm_gpu.cu:37 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`if (cudaMalloc((void**)&ptr, capacity * sizeof(float)) != cudaSuccess) {\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #50: lstm_gpu.cu:44 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`~CudaBuffer() { if (ptr) cudaFree(ptr); }\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #51: lstm_gpu.cu:118 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`err = cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #52: lstm_gpu.cu:143 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #53: lstm_gpu.cu:173 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #54: lstm_gpu.cu:194 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #55: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_lstm_add\`
- **Architectural Risk**: *"Native entrypoint "run_lstm_add" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #56: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_dot_product\`
- **Architectural Risk**: *"Native entrypoint "run_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #57: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_scale\`
- **Architectural Risk**: *"Native entrypoint "run_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #58: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_relu\`
- **Architectural Risk**: *"Native entrypoint "run_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #59: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_lstm_add\`
- **Architectural Risk**: *"Native entrypoint "run_lstm_add" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #60: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_dot_product\`
- **Architectural Risk**: *"Native entrypoint "run_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #61: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_scale\`
- **Architectural Risk**: *"Native entrypoint "run_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #62: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_relu\`
- **Architectural Risk**: *"Native entrypoint "run_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #63: pytorch_graph_fp16.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: attentionScoreGPU_fp16\`
- **Architectural Risk**: *"Native entrypoint "attentionScoreGPU_fp16" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #64: pytorch_graph_fp16.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: rewardScoreGPU_fp16\`
- **Architectural Risk**: *"Native entrypoint "rewardScoreGPU_fp16" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #65: pytorch_graph_fp16.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: batchCosineSimilarity_fp16\`
- **Architectural Risk**: *"Native entrypoint "batchCosineSimilarity_fp16" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #66: som_cache.cu:104 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #67: som_cache.cu:108 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #68: tensor_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: runSOMCache\`
- **Architectural Risk**: *"Native entrypoint "runSOMCache" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #69: tensor_bridge.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: runSOMCache\`
- **Architectural Risk**: *"Native entrypoint "runSOMCache" does not have an in-situ CPU execution fallback registered."*


### Finding #70: tensor_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridgeSIMDToTensorRT\`
- **Architectural Risk**: *"Native entrypoint "bridgeSIMDToTensorRT" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #71: tensor_bridge.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridgeSIMDToTensorRT\`
- **Architectural Risk**: *"Native entrypoint "bridgeSIMDToTensorRT" does not have an in-situ CPU execution fallback registered."*


---

## Safe / Thread-Local Recycling Architecture Analysis
The static analyzer successfully confirmed that [binding.cc](file:///c:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/binding.cc) includes **24 direct uses** of the high-performance \`create_pooled_ab\` thread-local recycler.
This pooled structure successfully bounds CPU host allocations, bypassing default V8 garbage collector churn during repeated semantic calculations.

## Phase 12 Security Recommendations
1. **Queue Lock for GPU Execution**: Prevent concurrent executions of CUDA kernels (som_cache.cu, lstm_gpu.cu, and LibTorch models) in Node.js by wrapping calls in an async semaphore lock.
2. **CPU Fallback Enforcements**: When compiling without CUDA (e.g. \`NO_CUDA\`) or when VRAM limits are saturated, ensure CPU fallbacks are wired down to the Javascript level rather than throwing uncaught N-API exceptions.
3. **RTX 3060 Ti Allocation Bounding**: Set hard caps on model, VLM, and autoencoder memory footprints to prevent OS-level process thrashing.

---
*Report programmatically generated by the Antigravity developer agent.*
