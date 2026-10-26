# Tasks: CUDA 13.4 host + TensorRT-RTX executor lane

Status vocabulary per root CLAUDE.md: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN.
Vendor compatibility was checked against NVIDIA's TensorRT-RTX prerequisites, support matrix, architecture overview, and 1.7 download page on 2026-10-25. This verifies published compatibility claims only; no local installation or runtime proof is implied.
No task installs anything without explicit operator approval for that step.

## 1. Preflight (read-only)
- [ ] 1.1 Complete preflight: record the exact minimum driver and runtime-cache compatibility rules (GPU SKU, TensorRT-RTX version, CiG state); NVIDIA docs confirm TensorRT-RTX 1.7 has CUDA 13.4 Windows packages, supports SM 8.6+, and recommends Python 3.10–3.14.
- [ ] 1.2 Record current state: driver version, installed CUDA toolkits, `nvcc --version` on Windows host; do not rely on `cudaMemGetInfo` alone for VRAM decisions (use `nvidia-smi`).
- [ ] 1.3 Check `docs/reports/runtime-capability-registry-v1.json` for an existing owner of `inference.tensorrt` before adding one (DEPENDENCY-CAPABILITY-GUARD-01).
- [x] 1.4 Decide framework boundary from NVIDIA's TensorRT-RTX architecture docs: evaluate the existing EmbeddingGemma ONNX artifact through the regular ONNX Runtime TensorRT-RTX execution-provider or direct ONNX-engine path. Do not use ONNX Runtime GenAI for this embedding workload. TensorRT-LLM and Triton are separate serving lanes, not adapters for TensorRT-RTX engines.
- [ ] 1.5 Prepare a separate Windows x64 Python 3.13 environment for the CUDA 13.4/TensorRT-RTX 1.7 challenger; do not replace the existing CUDA 13.0/LibTorch lane or WSL RAPIDS environment.

## 2. Proof ladder (each step needs its own approval and receipt)
- [ ] 2.1 CUDA134-HOST-01 driver supports CUDA 13.4.
- [ ] 2.2 CUDA134-HOST-02 CUDA Toolkit 13.4 installed side-by-side (existing 13.0 toolkit untouched).
- [ ] 2.3 TRTRTX-01 TensorRT-RTX 1.6 installed.
- [ ] 2.4 TRTRTX-02 SM_86 capability probe.
- [ ] 2.5 TRTRTX-03 tiny ONNX engine build.
- [ ] 2.6 TRTRTX-04 engine deserialize + inference matches a PyTorch/CPU reference within stated tolerance.
- [ ] 2.7 TRTRTX-05 runtime-cache rebuild + readback.
- [ ] 2.8 Report `TENSORRT_RTX_CUDA134_PROVEN` only when 2.1-2.7 all have receipts.
- [ ] 2.9 EMBGEMMA-TRTRTX-01: run the existing, checksummed EmbeddingGemma ONNX artifact as a non-canonical challenger; first verify graph/opset/operator support and tokenizer/input recipe, then compare output dimensions, pooling, normalization, vector similarity, retrieval quality, latency, and VRAM against the current ONNX Runtime baseline on one frozen cohort.

## 3. Boundaries
- [ ] 3.1 Record ownership split in the capability registry: `atlas-gpu-8098` = RAPIDS, `atlas-neural-decoder:torch2.13.0-cu132` = PyTorch, TensorRT-RTX = challenger inference executor.
- [ ] 3.2 Keep embedding policy unchanged: `semantic_768` primary; MRL 512/256/128 and `latent_256/128/64` derived, never authoritative.
- [ ] 3.3 Old CUDA-12.8 decoder image and hybrid `atlas-gpu-8098:repro-*` images: cleanup is a SEPARATE tranche (check `docker ps -a --filter ancestor=…`, `docker image inspect` receipts, then remove by exact image ID; never `docker system prune -a`). Not executed here.
- [x] 3.4 Keep synthesis/tool calling on the existing Ornith/llama-server owner; TensorRT-RTX is an isolated ONNX inference challenger, not a replacement synthesis server. TensorRT-LLM/Triton work requires a separately reviewed compatible deployment lane.
- [ ] 3.5 Keep TensorRT-RTX EmbeddingGemma outputs under a distinct producer/representation revision. No mixing with canonical `semantic_768`, reindex, Qdrant publication, or promotion without independently reviewed recipe parity, retrieval evaluation, and an explicit migration/admission receipt.
