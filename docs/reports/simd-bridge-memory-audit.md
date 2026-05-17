# SIMD Bridge Memory & VRAM Safety Audit

## Execution Overview
- **Run ID**: \`simd-audit-1778983167007\`
- **Timestamp**: 2026-05-17T01:59:27.007Z
- **Scanned Files**: \`binding.cc\`, \`gpu_error_codes.h\`, \`libtorch_graph.cc\`, \`libtorch_stubs.cc\`, \`lstm_bridge.cc\`, \`lstm_gpu.cu\`, \`pytorch_graph.cc\`, \`simdjson_bridge.cc\`, \`som_cache.cu\`, \`tensor_bridge.cc\`

## Summary Statistics
- **Total Findings**: 90
- **High Severity Risks**: 25
- **Medium Severity Risks**: 35
- **Low/Safe Allocations**: 51

### Classification Matrix
- **gpu_allocation (CUDA VRAM)**: 5
- **napi_buffer (GC / Host memory)**: 12
- **tensor_lifetime (LibTorch blocks)**: 0
- **missing_timeout (Deadlock vector)**: 29
- **missing_cpu_fallback (OOM safety)**: 17
- **possible_concurrent_gpu_job (Synch locks)**: 6
- **safe (Pooled recyclers)**: 21

---

## High & Medium Severity Findings Detail


### Finding #1: binding.cc:59 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`napi_status napi_create_external_arraybuffer(napi_env, void*, size_t, napi_finalize, void*, napi_value*);\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #2: binding.cc:127 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`// Strategy: napi_create_external_arraybuffer transfers ownership of a raw\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #3: binding.cc:213 [NAPI_BUFFER]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`napi_create_external_arraybuffer\`
- **Trigger Snippet**: \`return napi_create_external_arraybuffer(\`
- **Architectural Risk**: *"N-API external buffer transfer to V8"*


### Finding #4: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: graphSimilarity\`
- **Architectural Risk**: *"Native entrypoint "graphSimilarity" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #5: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: graphSimilarity\`
- **Architectural Risk**: *"Native entrypoint "graphSimilarity" does not have an in-situ CPU execution fallback registered."*


### Finding #6: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: clusterEmbeddings\`
- **Architectural Risk**: *"Native entrypoint "clusterEmbeddings" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #7: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: clusterEmbeddings\`
- **Architectural Risk**: *"Native entrypoint "clusterEmbeddings" does not have an in-situ CPU execution fallback registered."*


### Finding #8: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: computeCaseEmbedding\`
- **Architectural Risk**: *"Native entrypoint "computeCaseEmbedding" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #9: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: computeCaseEmbedding\`
- **Architectural Risk**: *"Native entrypoint "computeCaseEmbedding" does not have an in-situ CPU execution fallback registered."*


### Finding #10: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: checkCudaAvailable\`
- **Architectural Risk**: *"Native entrypoint "checkCudaAvailable" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #11: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: checkCudaAvailable\`
- **Architectural Risk**: *"Native entrypoint "checkCudaAvailable" does not have an in-situ CPU execution fallback registered."*


### Finding #12: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_run_lstm\`
- **Architectural Risk**: *"Native entrypoint "bridge_run_lstm" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #13: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridge_run_lstm\`
- **Architectural Risk**: *"Native entrypoint "bridge_run_lstm" does not have an in-situ CPU execution fallback registered."*


### Finding #14: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_dot_product\`
- **Architectural Risk**: *"Native entrypoint "bridge_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #15: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridge_dot_product\`
- **Architectural Risk**: *"Native entrypoint "bridge_dot_product" does not have an in-situ CPU execution fallback registered."*


### Finding #16: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_scale\`
- **Architectural Risk**: *"Native entrypoint "bridge_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #17: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridge_scale\`
- **Architectural Risk**: *"Native entrypoint "bridge_scale" does not have an in-situ CPU execution fallback registered."*


### Finding #18: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_relu\`
- **Architectural Risk**: *"Native entrypoint "bridge_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #19: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridge_relu\`
- **Architectural Risk**: *"Native entrypoint "bridge_relu" does not have an in-situ CPU execution fallback registered."*


### Finding #20: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: pageRankGPU\`
- **Architectural Risk**: *"Native entrypoint "pageRankGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #21: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: pageRankGPU\`
- **Architectural Risk**: *"Native entrypoint "pageRankGPU" does not have an in-situ CPU execution fallback registered."*


### Finding #22: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: attentionScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "attentionScoreGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #23: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: attentionScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "attentionScoreGPU" does not have an in-situ CPU execution fallback registered."*


### Finding #24: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: rewardScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "rewardScoreGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #25: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: rewardScoreGPU\`
- **Architectural Risk**: *"Native entrypoint "rewardScoreGPU" does not have an in-situ CPU execution fallback registered."*


### Finding #26: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: softmaxGPU\`
- **Architectural Risk**: *"Native entrypoint "softmaxGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #27: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: softmaxGPU\`
- **Architectural Risk**: *"Native entrypoint "softmaxGPU" does not have an in-situ CPU execution fallback registered."*


### Finding #28: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: topKIndicesGPU\`
- **Architectural Risk**: *"Native entrypoint "topKIndicesGPU" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #29: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: topKIndicesGPU\`
- **Architectural Risk**: *"Native entrypoint "topKIndicesGPU" does not have an in-situ CPU execution fallback registered."*


### Finding #30: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: kmeansWithCentroids\`
- **Architectural Risk**: *"Native entrypoint "kmeansWithCentroids" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #31: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: kmeansWithCentroids\`
- **Architectural Risk**: *"Native entrypoint "kmeansWithCentroids" does not have an in-situ CPU execution fallback registered."*


### Finding #32: libtorch_stubs.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: trainSOM\`
- **Architectural Risk**: *"Native entrypoint "trainSOM" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #33: libtorch_stubs.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: trainSOM\`
- **Architectural Risk**: *"Native entrypoint "trainSOM" does not have an in-situ CPU execution fallback registered."*


### Finding #34: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_run_lstm\`
- **Architectural Risk**: *"Native entrypoint "bridge_run_lstm" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #35: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_dot_product\`
- **Architectural Risk**: *"Native entrypoint "bridge_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #36: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_scale\`
- **Architectural Risk**: *"Native entrypoint "bridge_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #37: lstm_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridge_relu\`
- **Architectural Risk**: *"Native entrypoint "bridge_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #38: lstm_gpu.cu:25 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`// Avoids cudaMalloc/cudaFree per call. Thread-local to avoid contention.\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #39: lstm_gpu.cu:25 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`// Avoids cudaMalloc/cudaFree per call. Thread-local to avoid contention.\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #40: lstm_gpu.cu:35 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`if (ptr) cudaFree(ptr);\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #41: lstm_gpu.cu:37 [GPU_ALLOCATION]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaMalloc\`
- **Trigger Snippet**: \`if (cudaMalloc((void**)&ptr, capacity * sizeof(float)) != cudaSuccess) {\`
- **Architectural Risk**: *"Device/VRAM allocation"*


### Finding #42: lstm_gpu.cu:44 [GPU_ALLOCATION]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`cudaFree\`
- **Trigger Snippet**: \`~CudaBuffer() { if (ptr) cudaFree(ptr); }\`
- **Architectural Risk**: *"Device/VRAM deallocation"*


### Finding #43: lstm_gpu.cu:118 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`err = cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #44: lstm_gpu.cu:143 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #45: lstm_gpu.cu:173 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #46: lstm_gpu.cu:194 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #47: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_lstm_add\`
- **Architectural Risk**: *"Native entrypoint "run_lstm_add" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #48: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_dot_product\`
- **Architectural Risk**: *"Native entrypoint "run_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #49: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_scale\`
- **Architectural Risk**: *"Native entrypoint "run_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #50: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_relu\`
- **Architectural Risk**: *"Native entrypoint "run_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #51: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_lstm_add\`
- **Architectural Risk**: *"Native entrypoint "run_lstm_add" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #52: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_dot_product\`
- **Architectural Risk**: *"Native entrypoint "run_dot_product" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #53: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_scale\`
- **Architectural Risk**: *"Native entrypoint "run_scale" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #54: lstm_gpu.cu:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: run_relu\`
- **Architectural Risk**: *"Native entrypoint "run_relu" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #55: som_cache.cu:104 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #56: som_cache.cu:108 [POSSIBLE_CONCURRENT_GPU_JOB]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`cudaDeviceSynchronize\`
- **Trigger Snippet**: \`cudaDeviceSynchronize();\`
- **Architectural Risk**: *"Full CUDA device synchronization"*


### Finding #57: tensor_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: runSOMCache\`
- **Architectural Risk**: *"Native entrypoint "runSOMCache" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #58: tensor_bridge.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: runSOMCache\`
- **Architectural Risk**: *"Native entrypoint "runSOMCache" does not have an in-situ CPU execution fallback registered."*


### Finding #59: tensor_bridge.cc:1 [MISSING_TIMEOUT]
- **Risk Severity**: \`MEDIUM\`
- **Matched Pattern**: \`missing_timeout\`
- **Trigger Snippet**: \`Function boundary: bridgeSIMDToTensorRT\`
- **Architectural Risk**: *"Native entrypoint "bridgeSIMDToTensorRT" lacks custom milliseconds timeout limits (relying solely on iteration bounds)."*


### Finding #60: tensor_bridge.cc:1 [MISSING_CPU_FALLBACK]
- **Risk Severity**: \`HIGH\`
- **Matched Pattern**: \`missing_cpu_fallback\`
- **Trigger Snippet**: \`Function boundary: bridgeSIMDToTensorRT\`
- **Architectural Risk**: *"Native entrypoint "bridgeSIMDToTensorRT" does not have an in-situ CPU execution fallback registered."*


---

## Safe / Thread-Local Recycling Architecture Analysis
The static analyzer successfully confirmed that [binding.cc](file:///c:/Users/james/Videos/deeds-web-app/simd-bridge/cpp/binding.cc) includes **21 direct uses** of the high-performance \`create_pooled_ab\` thread-local recycler.
This pooled structure successfully bounds CPU host allocations, bypassing default V8 garbage collector churn during repeated semantic calculations.

## Phase 12 Security Recommendations
1. **Queue Lock for GPU Execution**: Prevent concurrent executions of CUDA kernels (som_cache.cu, lstm_gpu.cu, and LibTorch models) in Node.js by wrapping calls in an async semaphore lock.
2. **CPU Fallback Enforcements**: When compiling without CUDA (e.g. \`NO_CUDA\`) or when VRAM limits are saturated, ensure CPU fallbacks are wired down to the Javascript level rather than throwing uncaught N-API exceptions.
3. **RTX 3060 Ti Allocation Bounding**: Set hard caps on model, VLM, and autoencoder memory footprints to prevent OS-level process thrashing.

---
*Report programmatically generated by the Antigravity developer agent.*
