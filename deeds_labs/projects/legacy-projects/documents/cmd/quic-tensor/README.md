QUIC Tensor Service (quic-tensor)
=================================

This small service exposes a QUIC/HTTP3 server that performs GPU-accelerated
embedding inference (via TensorRT) and performs Neo4j-backed legal recommendation
queries. The repository includes an optional TensorRT FFI integration that is
compiled when building with the `cuda` build tag.

Build modes
-----------

- Default (no CUDA): build normally. The code uses a fallback stub that simulates
  embeddings so the server can run without CUDA/TensorRT installed.

  go build ./cmd/quic-tensor

- CUDA/TensorRT enabled: compile with the `cuda` build tag. This will enable
  the cgo-backed TensorRT bridge. You must also ensure the native TensorRT
  libraries and a compiled `libembedding_trt.a` (or shared lib) are available
  and properly linked.

  go build -tags=cuda ./cmd/quic-tensor

Notes for Docker/CUDA
---------------------
- Use an NVIDIA base image (e.g., nvidia/cuda:12.0-runtime) and install the
  TensorRT dev packages. Mount or copy the compiled TensorRT engine (.plan) and
  the embedding_trt static library into the container at build time.
- The `Dockerfile` in this repo currently builds the non-cuda binary. To build
  a CUDA image, extend the Dockerfile to use a CUDA base image and compile with
  `-tags=cuda` and link against TensorRT/CUDA libs.

Providing the TensorRT engine
----------------------------
- The CUDA build expects a TensorRT engine file at `/models/embeddinggemma.plan`.
  Provide this path via your image build or mount the model at runtime.

Safety & Fallback
-----------------
- When not built with `-tags=cuda`, the library uses a deterministic stub that
  returns pseudo-embeddings and simulated latency. This lets the rest of the
  system function for development and CI.

License / Credits
-----------------
This integration uses NVIDIA TensorRT and CUDA. Ensure you comply with their
licenses when building and distributing images that include these components.
