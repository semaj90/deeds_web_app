# Evidence Manifest — Parent Atlas Prefill Routing Residency Convergence

This manifest pins the official documentation families that must be reviewed before any native/GPU implementation or promotion work. It is evidence input, not authorization.

## TensorRT-RTX 1.6

### Prerequisites
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/installing-tensorrt-rtx/prerequisites.html

Why: prove GPU architecture, driver/toolkit prerequisites, and package compatibility. TensorRT-RTX 1.6 supports RTX 3000/Ampere compute capability 8.6 but its official packages target CUDA 12.9 Update 1 or CUDA 13.4. The workstation's CUDA 13.0 stack therefore MUST NOT be assumed package-compatible.

### Support matrix
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/getting-started/support-matrix.html

Why: record supported architectures, engine portability constraints, CUDA package families, and precision support before capability claims.

### Architecture / object lifetimes
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/architecture/how-trt-rtx-works.html

Why: define portable AOT engine → device JIT → runtime execution, object lifetimes, trust boundary, thread safety, memory ownership, engine validity, and runtime memory accounting.

### Native runtime API
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/runtime-api.html

Why: candidate future native boundary for engine deserialization, execution-context creation, device buffers, and enqueue/inference.

### Runtime cache
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-runtime-cache.html

Why: mirror AOT engine → device JIT → runtime-cache identity in Parent Atlas receipts and distinguish cold/warm behavior.

### Dynamic shapes
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-dynamic-shapes.html

Why: required before variable token, candidate, batch, or tile shapes are accepted.

### Quantized types
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-quantized-types.html

Why: FP16/BF16/INT8/INT4 promotion requires supported operator/quantization contracts and parity, not merely GPU hardware capability.

### RTX CUDA Graphs
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/work-with-cuda-graphs.html

Why: later optimization for repeated bounded inference only after normal execution correctness/parity.

### PyTorch integration / Torch-TensorRT-RTX
https://docs.nvidia.com/deeplearning/tensorrt-rtx/latest/inference-library/pytorch-workflows.html

Why: experimental challenger path; do not make it the first production native boundary without current documentation review and parity evidence.

## CUDA 13.4

### CUDA Runtime API
https://docs.nvidia.com/cuda/cuda-runtime-api/index.html

Why: streams, synchronization, graph object thread safety, version-mixing rules, memory/runtime API behavior.

### CUDA Programming Guide
https://docs.nvidia.com/cuda/cuda-programming-guide/index.html

Why: streams/asynchronous execution, CUDA Graphs, stream-ordered allocator, memory model, synchronization, IPC, and compute-capability reference.

## PyTorch / LibTorch / ATen

### C++ frontend / LibTorch
https://docs.pytorch.org/docs/stable/cpp_index.html

Why: CPU/CUDA numerical reference, native tensor/model execution, model loading, and future native inference boundary.

### Activation checkpointing
https://docs.pytorch.org/docs/stable/checkpoint.html

Why: training-time recompute/memory policy only; explicitly distinct from Atlas pass checkpoints, residency checkpoints, and model KV/recurrent state.

### Custom C++/CUDA operators
https://docs.pytorch.org/tutorials/advanced/cpp_custom_ops.html

Why: if fused native operations later become justified, use registered/testable PyTorch operators rather than opaque pointer calls.

## Node native ABI

### Node-API
https://nodejs.org/api/n-api.html

Why: stable JS↔native ABI for a future LibTorch/TensorRT-RTX addon; avoid direct V8 ownership.

### node-addon-api
https://github.com/nodejs/node-addon-api

Why: C++ convenience layer over Node-API if adopted by the existing native-addon owner.

## cuVS / RAPIDS

### cuVS documentation root
https://docs.rapids.ai/api/cuvs/stable/

Why: pin the exact installed cuVS version's brute-force and CAGRA APIs before implementation. Brute force remains the GPU exact oracle; CAGRA remains the ANN challenger. Neither produces another semantic vote.

## ONNX Runtime

### DirectML Execution Provider
https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html

Why: preserve Windows DirectML as a distinct executor with its own capability/parity receipt.

### WebGPU Execution Provider
https://onnxruntime.ai/docs/execution-providers/WebGPU-ExecutionProvider.html

Why: preserve WebGPU as a distinct challenger/executor and bind provider, model, tokenizer, pooling, normalization, shape, dtype, and parity evidence.

## Evidence rules

- Record documentation URL, version/release when applicable, retrieval date, and the exact capability decision it supports in any future `GpuExecutorCapabilityV1` or `TensorRtRtxCapabilityReceiptV1`.
- Documentation evidence never substitutes for live capability proof.
- Do not infer TensorRT-RTX 1.6 compatibility from `CUDA major == 13`; use the documented package target and a live isolated receipt.
- Do not alter the working RAPIDS/CUDA stack merely to satisfy an experimental executor.
- Re-check these pages before implementation because runtime/package support can change independently of this OpenSpec.
