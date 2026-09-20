# Tasks: CUDA 13.4 host + TensorRT-RTX executor lane

Status vocabulary per root CLAUDE.md: CREATED / WIRED / DRY_RUN_PROVEN / APPLY_PROVEN / NOT_PROVEN.
Vendor support claims below come from an operator-pasted summary and are NOT_PROVEN until checked against NVIDIA's release notes.
No task installs anything without explicit operator approval for that step.

## 1. Preflight (read-only)
- [ ] 1.1 Verify against NVIDIA release notes: TensorRT-RTX 1.6 CUDA 13.4 support, SM 8.6 support, minimum driver, cache-compatibility rules (SKU, version, CiG state).
- [ ] 1.2 Record current state: driver version, installed CUDA toolkits, `nvcc --version` on Windows host; do not rely on `cudaMemGetInfo` alone for VRAM decisions (use `nvidia-smi`).
- [ ] 1.3 Check `docs/reports/runtime-capability-registry-v1.json` for an existing owner of `inference.tensorrt` before adding one (DEPENDENCY-CAPABILITY-GUARD-01).

## 2. Proof ladder (each step needs its own approval and receipt)
- [ ] 2.1 CUDA134-HOST-01 driver supports CUDA 13.4.
- [ ] 2.2 CUDA134-HOST-02 CUDA Toolkit 13.4 installed side-by-side (existing 13.0 toolkit untouched).
- [ ] 2.3 TRTRTX-01 TensorRT-RTX 1.6 installed.
- [ ] 2.4 TRTRTX-02 SM_86 capability probe.
- [ ] 2.5 TRTRTX-03 tiny ONNX engine build.
- [ ] 2.6 TRTRTX-04 engine deserialize + inference matches a PyTorch/CPU reference within stated tolerance.
- [ ] 2.7 TRTRTX-05 runtime-cache rebuild + readback.
- [ ] 2.8 Report `TENSORRT_RTX_CUDA134_PROVEN` only when 2.1-2.7 all have receipts.

## 3. Boundaries
- [ ] 3.1 Record ownership split in the capability registry: `atlas-gpu-8098` = RAPIDS, `atlas-neural-decoder:torch2.13.0-cu132` = PyTorch, TensorRT-RTX = challenger inference executor.
- [ ] 3.2 Keep embedding policy unchanged: `semantic_768` primary; MRL 512/256/128 and `latent_256/128/64` derived, never authoritative.
- [ ] 3.3 Old CUDA-12.8 decoder image and hybrid `atlas-gpu-8098:repro-*` images: cleanup is a SEPARATE tranche (check `docker ps -a --filter ancestor=…`, `docker image inspect` receipts, then remove by exact image ID; never `docker system prune -a`). Not executed here.
