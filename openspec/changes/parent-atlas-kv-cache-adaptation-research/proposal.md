## Why

Two separate capability upgrades keep getting proposed together and
should not be: (1) RotorQuant/IsoQuant-style KV-cache compression, which
only changes *temporary per-request inference memory*, and (2) QLoRA
adaptation of Ornith 9B, which changes *model behavior via trained
adapter weights*. Neither is a data store, retrieval engine, experiment
log, or a defense against untrusted web content, and both are currently
research/experimental tracks — this proposal keeps them explicitly
separate from each other and from the production `llama-server.exe :8090`
runtime until each proves out independently.

## RotorQuant/IsoQuant KV-cache compression

Status: **experimental, behind an interface, never the default runtime.** This repo's existing `TURBO_PROFILE` guidance (`stock` / `turboquant` / `turboquant-safe`, see root `CLAUDE.md`) already establishes the pattern — this proposal formalizes the next research stages, not a runtime switch.

`KvCompressionBackend` interface (`readonly formatId: FP16 | INT8 | ROTOR_INT4 | ROTOR_INT3 | ISOQUANT_INT4`, `quantizeNewKv`, `attend`, `exportMetrics`) with 9 required stages: (1) standalone rotation/quantization kernel → (2) quantize/dequantize numerical fixture → (3) packed/paged cache layout → (4) fused cache-write kernel → (5) fused attention read path → (6) single-request model replay → (7) multi-request continuous batching → (8) 65K-context validation → (9) tool-call/repair quality evaluation. **Do not** take the "unpack whole cache to FP16, run normal attention" shortcut — it recovers memory but loses the bandwidth/latency benefit that's the entire point.

Calibration corpus (if any learned clipping/codebook/per-layer policy is needed — fixed rotations may be training-free): Parent Atlas system prompts, tool schemas, source-code contexts, ACE packets, error traces, multi-turn repair conversations, long-context retrieval fixtures, ordinary prompts — split by repo family / task family / symbol family / time / prompt template. Evaluate perplexity/log-likelihood drift, tool-call JSON validity, retrieved-source accuracy, patch-generation accuracy, long-context needle retrieval, tokens/sec, first-token latency, VRAM/1K tokens, max stable concurrent requests. **Do not optimize reconstruction MSE alone** — task behavior is the real target.

## QLoRA / Ornith 9B adaptation

Status: **not started; base-checkpoint identity not proven.** Before any training: confirm exact base model identity/lineage, tokenizer, chat template, context length, quantization format, license, and adapter-loading support in the inference runtime. **The served GGUF is not the training input** — QLoRA needs a compatible trainable transformer checkpoint, not the quantized runtime artifact.

Progression: Stage A prompt baseline → Stage B reranker/classifier training (cheapest, most useful first — feeds the Patch Tournament proposal directly) → Stage C supervised QLoRA (bounded patches, tool-call plans, validation plans, abstention, structured explanations) → Stage D preference optimization (winner vs. loser candidate pairs) → Stage E RL/contextual bandit only after the reward model is stable and resistant to reward hacking.

Adapter manifest (`AdapterManifest`) and batch-by-adapter scheduling (never switch adapters token-by-token) are recorded in `tasks.md`.

## Hard safety rule: no training directly from live web fetches

`web search → fetch → sanitize/classify → extract factual claims → resolve source identity → compare authoritative sources → store as retrievable evidence → use through ACE/RAG → collect validated task outcomes → human/deterministic eligibility review → periodic offline training corpus`. Never `web fetch → QLoRA` directly — that path is vulnerable to prompt injection, source-quality contamination, duplicate examples, copyright/license issues, secret/PII ingestion, train/eval leakage, and unrollback-able fact-to-weight baking. Only train on task-behavior generalizations (how to call a tool, cite evidence, abstain, produce a bounded patch, produce a validation plan) — never volatile web facts.

## GPU/VRAM sharing with the retrieval sidecar

Both tracks compete for the same RTX 3060 Ti as `parent-atlas-gpu-sidecar-patch-tournament`'s retrieval work. Use the same `ATLAS_GPU_MODE` (`RETRIEVAL | LLM | KERNEL_RESEARCH`) exclusivity rule from that proposal — do not run large RAPIDS jobs concurrently with an LLM-mode process holding most VRAM for weights + KV cache. Browser/WebGPU work (visualization only) also competes for the same physical GPU and must suspend while either lane holds the lease.

## What Changes (bounded first slice only)

1. KV-cache: implement and validate **Stage 1 only** (standalone rotation/quantization kernel) plus **Stage 2** (quantize/dequantize numerical fixture) — no paged-cache integration, no fused kernels, no live serving path yet.
2. QLoRA: **Stage A only** — evaluate current Ornith 9B prompt baseline against a fixed, small evaluation corpus. No training, no checkpoint conversion, no adapter code.
3. Everything else (Stages 3–9 of KV-cache, Stages B–E of adaptation, reward-model design, training-data eligibility pipeline, adapter manifest/prefetch scheduler) is deferred — see `tasks.md`.
