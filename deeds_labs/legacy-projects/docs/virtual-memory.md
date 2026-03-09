## Virtual memory and GPU integration — practical notes

This note summarizes the virtual memory concepts that matter for GPU-accelerated services in this repo and concrete steps to avoid common problems when wiring Go services to a native CUDA worker or C++ vLLM server.

Key ideas
- Virtual memory vs. physical memory: OS can page host memory to disk; GPU DMA and CUDA expect stable physical pages for high-throughput transfers.
- Pinned (page-locked) host memory: Use CUDA host allocation (cudaHostAlloc / cudaHostRegister) or mlock for cross-process buffers to avoid page faults during DMA.
- NUMA: On multi-socket systems, place allocations on the same NUMA node as the GPU PCIe root to reduce latency.
- Huge pages / Large pages: Reduces TLB pressure for very large models and batching workloads.
- Memory pools & pre-allocation: Avoid repeated alloc/free on the GPU. Reserve persistent buffers, reuse them, and track fragmentation.
- Cross-process sharing: Use CUDA IPC or shared-memory mechanisms to share device buffers between processes; prefer gRPC/HTTP when IPC complexity is too high.

Practical recommendations for this repo
- For the C++ CUDA worker (cuda-worker.cu): allocate persistent device buffers, expose a JSON/gRPC control plane, and support pinned-host buffers for I/O.
- For Go microservices that spawn the native worker: prefer streaming JSON over stdin/stdout only for low-throughput jobs; for high-throughput or large-batched tensors use a local gRPC or unix domain socket endpoint into the native server.
- When moving from the existing stdin/stdout JSON contract to a networked (gRPC/HTTP) contract, keep a buffered adapter that can accept the old contract to avoid breaking many services at once.
- Implement conservative timeouts and process supervision in Go code (context.WithTimeout + cmd.Process.Kill() on timeout). Record stdout/stderr to logs for debugging.

Memory safety checklist
- Use cudaHostAlloc(cudaHostAllocDefault) or cudaHostRegister to pin critical host buffers when copying large tensors.
- Avoid reading/writing large payloads as strings in Go — marshal to binary (CBOR/MessagePack) or send raw bytes where possible.
- Limit the maximum model/sequence length at the API layer and validate before allocating GPU buffers.
- Add metrics and health checks that include GPU memory usage, resident set size (RSS), and page faults.

When to prefer a C++ vLLM server
- When you need persistent GPU state and low-latency inference for large models, implement a C++ service that exposes gRPC (recommended) or a simple HTTP API.
- gRPC allows binary protobuf tensors (efficient) and clean backpressure control. Keep a simple stdin/stdout shim for compatibility if needed.

References & follow-ups
- Add GPU memory metrics to the GPU orchestrator and Go services (RSS, GPU mem free/used, page-fault rate).
- Consider a small C/C++ shim that exposes CUDA IPC and a lightweight gRPC server around the vLLM runtime.

End of notes.
