## Evidence Log — Session 2026-08-05 (RotorQuant/IsoQuant provenance audit)

Concrete findings from a receipted audit (binary `--help` probe, live `/props`
introspection, full GGUF metadata dump, repo-wide provenance search, fork
architecture-registry inspection). All commands and raw output are
reproducible; receipts referenced below.

**RotorQuant GGUF artifact (`models/gemma4-e2b-rotorquant-iq4xs/`): claim
NOT_PROVEN, evidence is filename-only.**
- Full 47-key GGUF metadata dump: zero `rotorquant`/`isoquant`/`rotation`/
  `clifford`/`quantizer.version` keys. Only `general.quantization_version = 2`
  and `general.file_type = 30` (standard `IQ4_XS` — an ordinary weight
  quantization type, not a custom one).
- All 601 tensors use standard `blk.N.*.weight` names and standard dtypes
  (`IQ4_XS`, `Q5_K`, `F32`) — no extra rotation-matrix tensors, no custom
  tensor namespace.
- Repo-wide search for conversion script / source hash / rotation params /
  output hash / quantizer version / reproducible command: **not found**.
  Every `rotorquant`/`isoquant` hit in this repo is either the model's own
  README or an unrelated Ollama-tag string used for routing config — zero
  conversion-pipeline code exists anywhere in this repo.
- The only place "RotorQuant" appears in this artifact is its file path.
  This is the exact failure mode this proposal already warned against
  (filename ≠ proof) — now confirmed directly rather than assumed.

**Runtime binary (`llama-server-cuda`, build 8757/`a29e4c0b7`,
SHA256 `4552b121...`): does not expose RotorQuant/TurboQuant/IsoQuant
KV cache types.**
- `--help` grep for `pq[234]|tbq[234]|turbo|rotor|iso`: 0 matches. Only
  standard `-ctk`/`-ctv` types (`f32`, `f16`, `bf16`, `q8_0`, `q4_0`, `q4_1`,
  `iq4_nl`, `q5_0`, `q5_1`) are compiled in.
- `/props` on this build exposes **zero** cache-type fields anywhere in its
  schema (confirmed by full key enumeration of `default_generation_settings.
  params`) — the running KV cache type cannot be verified from the live
  server at all, only inferred from the launch command line. Any future
  claim of "confirmed via /props" on this build is false; source it from
  the process command line and label it as launch-time evidence, not
  runtime-confirmed.

**Ornith 1.0 9B (`models/hfor/hforf.gguf`) architecture identity — corrects
an earlier same-session assumption.**
- GGUF metadata: `general.architecture = 'qwen35'`. This is a **Qwen 3.5**
  model, not a Gemma4-family model — a session-earlier diagnosis attributed
  its chat-template instability to "the model doesn't reliably follow this
  specific fork's channel grammar"; the more precise root cause is an
  architecture-family mismatch (Ornith was paired with
  `custom_pub_chat_template_gemma4.jinja`, a Gemma4-specific template, when
  it was never a Gemma4 model at all). The fix already in place (launcher's
  `ornith` profile: `TemplateFile = $null`, use the GGUF's own embedded
  template) remains correct, now for a more fundamental reason.
- Architecture parameters: `attention.head_count=16`,
  `attention.head_count_kv=4` (4:1 GQA), `attention.key_length=256`,
  `attention.value_length=256`, `rope.dimension_count=64`,
  `rope.dimension_sections=[11,11,10,0]` (a split/partial RoPE scheme, not
  the simple single-range RoPE this repo's Gemma4-focused TurboQuant fork
  was built against).
- **`llm_arch_is_hybrid(LLM_ARCH_QWEN35) == true`**, confirmed directly in
  `llama-cpp-turboquant-gemma4/src/llama-arch.cpp:2869-2887` — Ornith is
  grouped with Jamba, Falcon-H1, Nemotron-H, Qwen3-Next: architectures that
  mix standard attention layers with SSM/recurrent state layers. This is a
  **structural** limit on RotorQuant/TurboQuant applicability, not just an
  unproven one: those techniques rotate/quantize attention K/V tensors
  specifically; SSM layers use a separate recurrent-state buffer with no
  K/V tensors to rotate. Even a hypothetical working build could only ever
  cover Ornith's attention-layer subset.
- Positive signal, still short of proof: `LLM_ARCH_QWEN35` has a real,
  filled-in tensor mapping in this fork's source (not a stub) — basic model
  *loading* by this fork is plausible. No `turbo3`/`iso3`/`planar3` kernel
  dispatch tied to `QWEN35` specifically was found, and the fork is
  **cloned but not built** (`llama-cpp-turboquant-gemma4/build/` contains
  only `CMakeCache.txt`, no compiled binary) — nothing about Ornith
  compatibility has been runtime-tested.

**Build-hygiene gap found:** `llama-cpp-turboquant-gemma4/build/` currently
sits in the repo root. This repo's established convention (see
`scripts/launch-gemma4-mtp-canonical.ps1`, `scripts/test-mtp-matrix.ps1`)
places all MTP/speculative-decoding and experimental-fork build artifacts
under `.tmp/` (e.g. `.tmp/atomic-mtp/bin/build/bin/llama-server.exe`). Any
future build of this fork — for RotorQuant/IsoQuant KV-cache work or MTP
drafter work — MUST be built to output under `.tmp/` (e.g.
`.tmp/llama-cpp-turboquant-gemma4-build/`), not the repo root, matching
every other experimental binary in this repo.

**Receipts** (this session, reproducible): `sveltekit-frontend/.tmp/
llama-runtime-receipt.json`, `sveltekit-frontend/.tmp/
llama-kv-cache-claim-table.json`, full GGUF dumps for both the RotorQuant
artifact and `hforf.gguf`.

**Net effect on this proposal's Stage 1–2 scope:** unchanged — Stage 1
(standalone rotation/quantization kernel) and Stage 2 (quantize/dequantize
fixture) were already scoped as isolated, off the live serving path. This
evidence log adds two constraints to that work: (a) do not use the
`models/gemma4-e2b-rotorquant-iq4xs/` GGUF as if it already embodies
RotorQuant — treat it as a plain IQ4_XS baseline for comparison, not a
positive example; (b) if/when Stage 1 work targets Ornith specifically,
scope it to Ornith's attention sublayers only and explicitly exclude SSM
state layers from the rotation/quantization interface — do not assume
uniform KV-cache treatment across a hybrid model.

## Evidence Log Addendum — `gemma4-legal-iq4xs-direct.gguf` (2026-08-05)

A materially different, more positive finding than the RotorQuant GGUF or
Ornith audits above. Same rigor (receipted GGUF metadata dump + fork
source inspection), opposite conclusion on several axes.

**Architecture: pure attention, not hybrid.**
- `general.architecture = 'gemma4'`, `general.name = 'Gemma4 Legal Vlm
  Merged'`. `gemma4` is confirmed **absent** from
  `llm_arch_is_hybrid()` in `llama-cpp-turboquant-gemma4/src/
  llama-arch.cpp` — no SSM/recurrent layers, no structural blocker of the
  kind found for Ornith/`qwen35`.
- `attention.head_count=8`, `head_count_kv=2` (4:1 GQA), `block_count=42`,
  `context_length=131072`.
- **`attention.key_length=512` / `value_length=512` (global layers) vs.
  `attention.key_length_swa=256` / `value_length_swa=256` (sliding-window
  layers)** — this is the exact D=256/512 split this repo's root
  `CLAUDE.md` documents as this specific fork's stated purpose
  ("Adds D=256/512 kernels... the only working path to turbo4 on Gemma 4
  today"). Confirmed directly from GGUF metadata, not asserted from docs.
- RoPE: `rope.dimension_count=512` (global), `dimension_count_swa=256`
  (SWA) — simple single-range RoPE per layer type. Contrast with Ornith's
  `rope.dimension_sections=[11,11,10,0]` (split/partial scheme) — this
  model's RoPE structure is the simpler, more conventional shape the
  fork's kernels are more likely to have been built against.

**TurboQuant (`turbo3`/`turbo4`) implementation in the fork: real,
extensive, end-to-end — NOT a stub, NOT architecture-registry-only.**
Traced the full call chain:
- `ggml/include/ggml.h:431-432` — `GGML_TYPE_TURBO3_0 = 41` / `TURBO4_0 =
  42`, with source comments explicitly identifying the algorithm:
  *"TurboQuant 3-bit KV cache: 2-bit PolarQuant + 1-bit QJL"* /
  *"4-bit KV cache: 3-bit PolarQuant + 1-bit QJL"* — matching the
  published TurboQuant paper's two-stage design (rotation + quantization
  + QJL residual correction), not a placeholder feature.
- `ggml/src/ggml.c:729-744` — full type-trait table entries: `.type_name
  = "turbo3"` / `"turbo4"` (the exact CLI strings this repo's
  `TURBO_PROFILE` docs in root `CLAUDE.md` already reference), real
  `.to_float`/`.from_float_ref` function pointers (not null/stub).
- `ggml/src/ggml-cpu/ggml-cpu.c` — real quantize/dequantize row functions
  and vec-dot kernels; comments confirm `turbo4_0` "applies forward WHT
  [Walsh-Hadamard Transform] before centroid search" (the rotation step)
  while `turbo3_0` uses "simple centroid quantize... NO Gaussian
  rotation" (matching TurboQuant's asymmetric K/V design intent).
- **`ggml/src/ggml-cuda/fattn-turbo4.cuh`** — a dedicated CUDA flash-
  attention kernel file for turbo4, plus references across `fattn.cu`,
  `getrows.cu`, `set-rows.cu`, `dequantize.cuh` — real GPU kernel work,
  not CPU-only reference code that would be useless for live inference.
- `src/llama-kv-cache.cpp:213,247`, `src/llama-context.cpp:2969-2970`,
  `src/llama-graph.cpp:2133,2144` — real conditional branches on
  `type_k/type_v == GGML_TYPE_TURBO3_0/4_0` inside the actual KV-cache
  management, context validation, and computation-graph construction
  code — genuine integration, not dead code paths.

**Still NOT_PROVEN — what this evidence does NOT establish:**
- The fork has never been built (`llama-cpp-turboquant-gemma4/build/`
  contains only `CMakeCache.txt`, confirmed earlier in this session) —
  zero runtime testing of any kind has occurred.
- Whether the KV-cache/graph dispatch code correctly handles Gemma4's
  specific **per-layer alternating** head_dim (256 SWA / 512 global via
  `attention.sliding_window_pattern`) rather than assuming one fixed
  head_dim across all layers has not been verified by this pass — the
  kernel files exist, but their correctness against this exact
  alternating-layout model is unread/unverified.
- No perplexity, KL-divergence, latency, VRAM, or stability data exists
  for `turbo3`/`turbo4` against this or any model — only source-level
  implementation evidence.
- `general.file_type = 30` (`IQ4_XS`) confirms the weight quantization
  claim independently of any KV-cache claim — consistent with the
  model's own name, unlike the RotorQuant GGUF case above.

**Net effect:** for `gemma4-legal-iq4xs-direct.gguf` specifically, the
correct status label is **`WIRED` (source-level, unbuilt) — a
qualitatively stronger position than Ornith's `NOT_PROVEN`**, using this
repo's own Status Language (`NOT_PROVEN` → `WIRED` → `DRY_RUN_PROVEN` →
`APPLY_PROVEN`, root `CLAUDE.md`). Building this fork
(`.tmp/llama-cpp-turboquant-gemma4-build/` per the build-hygiene task
above) and running the Stage 1/2 fixture against `turbo3`/`turbo4`
specifically on this model is now the most concrete, evidence-backed next
step available in this proposal — clearly separated from the Ornith path,
which remains blocked on the SSM-hybrid structural question regardless of
build status.

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
