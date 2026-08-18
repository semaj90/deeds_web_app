# Parent Atlas dual-runtime GPU execution

Parent Atlas intentionally uses both Windows-native and WSL2 against one physical RTX GPU. Runtime selection is an execution decision, never a semantic distinction.

## Windows-native ownership

Use the in-process Node-API / C++ bridge for low-overhead bounded compute:

- CUDA Runtime
- cuBLAS / cuBLASLt
- cuSOLVER
- LibTorch CUDA
- optional CUTLASS / cuTile challengers
- TensorRT-RTX for proven small/ONNX inference capabilities

TensorRT-RTX must remain disabled until `GpuEnvironmentReceiptV1` proves a compatible local SDK/toolkit pair. For TensorRT-RTX 1.6 the current NVIDIA package families are CUDA 12.9 Update 1 and CUDA 13.4.

## WSL2 ownership

Use gRPC/protobuf/Arrow/mmap references to Linux workers for:

- PyTorch CUDA
- RAPIDS / cuGraph
- cuVS exact / CAGRA
- cuGraph-PyG challenger
- TensorRT-LLM model serving

WSL2 must use the NVIDIA Windows driver bridge. Do not install a Linux NVIDIA display driver inside WSL. The Linux CUDA toolkit and user-space libraries may be versioned independently from the Windows toolkit as long as the host driver satisfies both runtime requirements.

The current TensorRT-LLM Linux installation guidance uses CUDA Toolkit 13.1 for its prebuilt path. TensorRT-LLM's TensorRT engine backend has been removed; the current execution backend is PyTorch.

## Shared-device rule

Windows-native and WSL2 processes share one physical VRAM envelope:

```text
Windows request ─┐
                 ├─> GpuLeaseV1 / one device budget ─> execute
WSL2 request ────┘
```

Never pass CUDA pointers, CUDA contexts, streams, TensorRT handles, or KV-cache handles across the Windows/WSL boundary. Pass revisioned logical references such as `CandidateFeaturePacketV1`, protobuf messages, Arrow IPC/mmap references, checksums, shapes, dtypes, and receipts.

## Precision policy on Ampere SM86

- FP64/FP32: oracle and numerically sensitive validation.
- TF32: optional FP32-shaped Tensor Core challenger when the operation's tolerance permits it.
- BF16 + FP32 accumulation: dynamic-range-sensitive mixed precision.
- FP16 + FP32 accumulation: default dense rerank/GEMM/latent projection path.
- INT8: only after a task-specific accuracy receipt proves quality.

cuBLASLt is the production default for dense Tensor Core work. CUTLASS/cuTile/custom kernels are challengers and must beat the cuBLASLt baseline on the target GPU while preserving numerical proof.

## Decomposition and S3

`SVD/PCA` is derived representation evidence. Proof compares singular values, reconstruction error, explained variance, subspace/projector distance, and downstream Recall@K. Raw `U`/`Vh` byte equality is forbidden as proof because singular-vector sign/phase is not unique.

Recommendation-side four-dimensional geometry is `SIGNED_S3_DOT`: opposite feature directions remain different. True quaternion rotation semantics (`q ~ -q`, `abs(dot)`) remain isolated in the experimental quaternion module.

## Execution sequence

```text
NativeComputeRequest
        ↓
GpuEnvironmentReceiptV1
        ↓
chooseNativeComputeExecutor()
        ↓
GpuLeaseV1  (GPU paths only)
        ↓
NativeComputePlanV1
        ↓
Windows N-API OR WSL2 gRPC
        ↓
ExecutionReceipt / numerical proof
        ↓
independent CPU/reference oracle
```

No accelerated capability should be reported live unless environment, branch counter/receipt, and numerical parity are all proven.
