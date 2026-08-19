# Native tensor exchange follow-up tasks

This file supplements `tasks.md`; it does not create a new native-acceleration owner.

## NTX-0 — Freeze ownership/lifetime semantics

- [x] Add `atlas.native-tensor-exchange.v1`.
- [x] Add TypeScript validation/planning helpers.
- [x] Add unit tests for host views, async owned copies, DLPack, cross-runtime references and byte sizing.
- [ ] Run the tests on the workstation and retain the receipt.

Proof gate: `NTX_OWNERSHIP_CONTRACT_PROVEN`.

## NTX-1 — Synchronous Node-API host view

- [ ] Prove `Float32Array` -> `napi_get_typedarray_info` -> call-scoped host pointer.
- [ ] Prove LibTorch `torch::from_blob` CPU view does not outlive the N-API callback.
- [ ] When the executor is CUDA, explicitly copy/move the tensor to CUDA inside the call before returning.
- [ ] Record host bytes, device bytes, copy latency and numerical result.

Proof gate: `NTX_NAPI_SYNC_HOST_VIEW_PROVEN`.

## NTX-2 — Asynchronous Node-API work

- [ ] Add a bounded `napi_async_work` path for long-running native operations.
- [ ] Copy inputs into native-owned memory before worker execution, or retain an explicit backing-store reference with a separately reviewed lifetime proof.
- [ ] Make no Node-API calls that interact with JavaScript objects from the async execute callback; construct JS results in the completion callback.
- [ ] Integrate queue depth with the existing bounded scheduler/resource policy.

Proof gate: `NTX_NAPI_ASYNC_OWNERSHIP_PROVEN`.

## NTX-3 — Device-resident batch cosine Top-K

This is the existing `P2.4 batchCosineTopK` task expressed in tensor-exchange terms.

- [ ] Input: query + bounded corpus/reference with canonical ordinal mapping.
- [ ] Compute cosine scores on device.
- [ ] Keep scores on device through `topk`; do not copy all `N` scores to JS when only K results are required.
- [ ] Return only top-K scores + ordinals/indices.
- [ ] Compare against PyTorch CPU exact cosine/top-k on the same frozen fixture.
- [ ] Emit environment/GPU-lease/execution receipt and `cuda_kernel_launches > 0` or equivalent native execution counter.

Proof gate: `NTX_BATCH_COSINE_TOPK_GPU_PROVEN`.

## NTX-4 — DLPack intra-runtime challenger

- [ ] Benchmark DLPack only where producer and consumer share a compatible process/runtime/device domain.
- [ ] Record ownership and stream/synchronization behavior.
- [ ] Prove that in-place mutation cannot unexpectedly corrupt an immutable Atlas snapshot.
- [ ] Do not send DLPack capsules or raw CUDA pointers across Windows <-> WSL2.

Proof gate: `NTX_DLPACK_INTRA_RUNTIME_PROVEN`.

## NTX-5 — Cross-runtime TensorRef

This is the existing `P3.3` remote tensor task.

- [ ] Define/finish protobuf `TensorRef` for shape, dtype, representation revision, locator/checksum and immutable data reference.
- [ ] Use Arrow IPC/mmap/reference transfer for large immutable matrices.
- [ ] Use gRPC for commands/results and reference metadata, not giant JSON tensor bodies.
- [ ] Hydrate/validate the referenced tensor inside the receiving runtime before GPU execution.

Proof gate: `NTX_REMOTE_TENSORREF_PROVEN`.

## NTX-6 — LibTorch ABI migration gate

- [ ] Keep the current non-stable ATen/LibTorch build while the workstation uses the existing LibTorch 2.9-era package path.
- [ ] When upgrading the native environment to PyTorch/LibTorch 2.10+, evaluate the stable LibTorch ABI for custom extension boundaries.
- [ ] Do not mix stable and non-stable assumptions inside one binary without an explicit build matrix and parity proof.

Proof gate: `NTX_LIBTORCH_ABI_MODE_PROVEN`.

## Completion rule

Do not mark native tensor exchange complete merely because a `.node` addon loads. Completion requires memory ownership proof, bounded scheduling, native-execution counters, numerical parity, and an execution receipt for the exact branch/environment under test.
