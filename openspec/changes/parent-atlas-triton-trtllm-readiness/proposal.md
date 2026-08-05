## Evidence Log — Session 2026-08-05 (candidate model architecture notes)

Not a TRT-LLM-specific test (none run) — carried over from a receipted
llama.cpp-side audit of the two models most likely to be proposed as
TRT-LLM engine-build candidates, relevant to the `MODEL_ARCHITECTURE_SUPPORTED`
gate below:

- **`gemma4-legal-iq4xs-direct.gguf`** — standard Gemma4 architecture
  (`general.architecture = 'gemma4'`), pure attention, no SSM/hybrid
  layers. The more conventional candidate for TRT-LLM engine-build
  support — TensorRT-LLM's Gemma family support is far more likely to be
  current than exotic hybrid architectures, but this has NOT been checked
  against TRT-LLM's actual supported-model list; still `NOT_PROVEN` for
  TRT-LLM specifically. **Update 2026-08-05**: a *separate* llama.cpp-fork
  audit (see `parent-atlas-kv-cache-adaptation-research/proposal.md`
  Evidence Log Addendum) found this exact model's architecture
  (`key_length=512`/`value_length=512` global, `key_length_swa=256`/
  `value_length_swa=256` SWA) matches a real, non-stub `turbo3`/`turbo4`
  (TurboQuant) KV-cache implementation already present in
  `llama-cpp-turboquant-gemma4` — CUDA kernel, KV-cache/graph dispatch,
  and CLI wiring all confirmed present, only unbuilt/untested at runtime.
  This is llama.cpp-track evidence, not TRT-LLM-track evidence — the two
  inference engines are unrelated codebases — but it makes
  `gemma4-legal-iq4xs-direct.gguf` the stronger candidate on *both*
  tracks for unrelated, independently-confirmed reasons (no hybrid-SSM
  blocker + real KV-compression implementation exists somewhere for it).
- **`hforf.gguf` (Ornith 1.0 9B)** — `general.architecture = 'qwen35'`,
  confirmed **hybrid attention+SSM** (`llm_arch_is_hybrid == true` in the
  llama.cpp fork checked; same architecture family as Jamba, Falcon-H1,
  Nemotron-H, Qwen3-Next). Hybrid/recurrent architectures have historically
  lagged pure-attention models in TensorRT-LLM's supported-architecture
  list — this is a real risk flag for `MODEL_ARCHITECTURE_SUPPORTED`
  specifically for this model, not evidence either way until checked
  against the actual TRT-LLM version pinned by whatever container/build is
  selected. Do not assume Qwen3.5 support in TRT-LLM from Qwen3/Qwen2
  support existing — check the exact architecture string.
- Neither model's `CHECKPOINT_CONVERSION` path has been attempted. TRT-LLM
  checkpoint conversion tooling generally expects an HF-format trainable
  checkpoint, not a GGUF — no local HF checkpoint exists for either model
  in this repo (confirmed via search during this session), which likely
  blocks `CHECKPOINT_CONVERSION` for both candidates regardless of
  architecture support, until one is sourced.

Full receipts (binary capability probe, GGUF metadata dumps, architecture
registry inspection) are in `openspec/changes/
parent-atlas-kv-cache-adaptation-research/proposal.md`'s Evidence Log —
this entry only extracts the subset relevant to engine-build candidate
selection.

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
