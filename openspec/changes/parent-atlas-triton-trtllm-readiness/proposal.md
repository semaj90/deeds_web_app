## Why

TensorRT-LLM/Triton readiness is not a consequence of having embeddings,
token indexes, or LibTorch already installed — those are unrelated
capabilities. The official Triton TensorRT-LLM backend requires strict
version alignment between TensorRT-LLM and the Triton backend, supports
in-flight batching and paged attention, and deployment requires preparing
a model repository, building or loading a supported model engine,
launching Triton, and proving HTTP/gRPC/metrics endpoints. NVIDIA
recommends aligned containers or a full matched build rather than mixing
arbitrary backend versions.

This change exists to record that gate set explicitly — as `NOT_PROVEN`
— rather than letting Triton readiness be silently assumed from adjacent
GPU work already done in this repo (LibTorch N-API addon, simdjson
bridge, CUDA graph analysis). No installation or conversion work happens
here yet.

## What Changes (gate definitions only, nothing implemented)

```
TRTLLM_PACKAGE_OR_CONTAINER          NOT_PROVEN
TRITON_TRTLLM_VERSION_ALIGNMENT      NOT_PROVEN
MODEL_ARCHITECTURE_SUPPORTED         NOT_PROVEN
CHECKPOINT_CONVERSION                NOT_PROVEN
ENGINE_BUILD                         NOT_PROVEN
MODEL_REPOSITORY_VALID               NOT_PROVEN
TRITON_HTTP_HEALTH                   NOT_PROVEN
TRITON_GRPC_HEALTH                   NOT_PROVEN
OPENAI_FRONTEND                      NOT_PROVEN
OUTPUT_PARITY_WITH_LLAMA_SERVER      NOT_PROVEN
LATENCY_BENCHMARK                    NOT_PROVEN
VRAM_FIT_3060TI_8GB                  NOT_PROVEN
```

Triton's OpenAI-compatible frontend (`OPENAI_FRONTEND`) still requires
tokenizer/model alignment and a valid Triton model repository underneath
it — it does not shortcut the gates above it in the list.

**RTX 3060 Ti / 8GB constraint**: `VRAM_FIT_3060TI_8GB` and
`MODEL_ARCHITECTURE_SUPPORTED` should be proven *before* designing any
production routing decision around TRT-LLM — this repo's canonical
chat/synthesis path (`llama-server.exe` :8090, per root `CLAUDE.md`'s
"Ollama vs llama-server Boundary") stays authoritative until and unless
`OUTPUT_PARITY_WITH_LLAMA_SERVER` and `LATENCY_BENCHMARK` both pass.

## Explicitly out of scope for now

- Installing TensorRT-LLM or any Triton container.
- Converting any checkpoint.
- Changing the current `llama-server.exe :8090` chat/synthesis routing —
  that stays canonical until this track proves out independently.

## Impact

None yet — gate definitions only, no code or infra changes. Future work
under this change should update each gate's status in place as it's
independently proven, using this repo's existing Status Language
(`NOT_PROVEN` → `WIRED` → `DRY_RUN_PROVEN` → `APPLY_PROVEN`), never
skipping to "production-ready" from partial evidence.
