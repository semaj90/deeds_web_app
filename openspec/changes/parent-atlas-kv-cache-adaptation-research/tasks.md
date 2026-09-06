# OpenSpec: KV-Cache Compression + QLoRA Adaptation Research — bounded first slice

## Ornith runtime cache boundary — 2026-09-05

- [ ] ORNITH-CACHE-01 verify the active model/build metadata and classify attention KV,
  recurrent/SSM state, and server prompt/prefix cache separately. All are runtime
  execution state, never Parent Atlas canonical knowledge.
- [ ] ORNITH-CACHE-02 measure only server-managed prefix reuse against PrefixIdentityV1:
  SHA256 of a versioned canonical object containing modelRevision, chatTemplateRevision,
  toolSchemaRevision, systemPromptRevision, ContextManifestV2.identityChecksum and
  exact rendered prefix checksum. Identical identity can permit reuse, not guarantee
  a hit; changed identity must not reuse the application's old descriptor.
  Record build/configuration, eligible prefix tokens and observed reuse separately.

No hidden-state database, external recurrent-state serialization/restoration, or
new launcher flags are part of this addendum. Existing Stage A/trainable-checkpoint
prerequisites still govern adaptation research; measurement is not model promotion.

## KV-cache compression (Stage 1–2 only)

- [ ] Define `KvCompressionBackend` interface (`formatId`, `quantizeNewKv`, `attend`, `exportMetrics`) — interface only, `FP16` passthrough implementation as the only working backend initially.
- [ ] Stage 1: standalone rotation + quantization kernel (block-diagonal rotation, no paging, no attention integration) — isolated, testable in Node/Python without touching the live `llama-server.exe` process.
- [ ] Stage 2: quantize → dequantize round-trip numerical fixture — measure reconstruction error on a fixed sample of real KV tensors (not synthetic random data).
- [x] Record findings against both RotorQuant's published claims and IsoQuant's counter-claim (3D grouping vs. 4D quaternion transforms) — do not take either paper's numbers as proven for this hardware without the fixture above. **Partial: provenance-only pass done 2026-08-05 (see proposal.md Evidence Log) — confirmed the `models/gemma4-e2b-rotorquant-iq4xs/` GGUF has zero embedded evidence of RotorQuant transformation (filename-only claim) and the live runtime binary has zero RotorQuant/TurboQuant/IsoQuant cache-type support. The actual quantize/dequantize numerical fixture (Stage 2's real deliverable) is still NOT done — this only rules out treating the existing GGUF/binary as pre-built evidence.**
- [ ] Explicitly deferred: packed/paged cache layout (Stage 3), fused write kernel (Stage 4), fused attention read path (Stage 5), single/multi-request model replay (Stage 6–7), 65K-context validation (Stage 8), tool-call quality evaluation (Stage 9).
- [ ] Build-hygiene fix (found 2026-08-05, not yet done): `llama-cpp-turboquant-gemma4/build/` currently sits in the repo root with a partial `CMakeCache.txt` (never finished building). Any future build of this fork must output under `.tmp/` (e.g. `.tmp/llama-cpp-turboquant-gemma4-build/`), matching every other experimental/MTP binary in this repo (`scripts/launch-gemma4-mtp-canonical.ps1`, `scripts/test-mtp-matrix.ps1` both target `.tmp/atomic-mtp/bin/build/bin/llama-server.exe`). Either relocate the existing partial build or configure a fresh CMake build with `-B .tmp/llama-cpp-turboquant-gemma4-build` before continuing it.
- [x] Source-level audit of `turbo3`/`turbo4` implementation completeness in `llama-cpp-turboquant-gemma4`, targeted at `gemma4-legal-iq4xs-direct.gguf` specifically. **Done 2026-08-05 (see proposal.md Evidence Log Addendum) — confirmed real, non-stub, end-to-end wiring: `ggml.h` type enum with explicit "PolarQuant + QJL" comments matching the published algorithm, full type-trait table (`ggml.c`), real CPU quantize/dequantize kernels including a WHT rotation step for `turbo4_0`, a dedicated CUDA flash-attention kernel (`fattn-turbo4.cuh`), and real conditional branches in `llama-kv-cache.cpp`/`llama-context.cpp`/`llama-graph.cpp`. `gemma4-legal-iq4xs-direct.gguf`'s own architecture (pure attention, not hybrid; head_dim 256 SWA / 512 global) matches this fork's stated D=256/512 purpose. Status: `WIRED` (source-level, unbuilt) — qualitatively stronger than Ornith's `NOT_PROVEN`. Still missing: the fork has never been built, so zero runtime/perplexity/latency/VRAM evidence exists, and per-layer alternating head_dim (256/512 within the same model) dispatch correctness is unverified.**
- [ ] **Next concrete step (highest-confidence path in this proposal):** build `llama-cpp-turboquant-gemma4` to `.tmp/llama-cpp-turboquant-gemma4-build/` (CMake + CUDA, ~30 min per root `CLAUDE.md`'s documented build time), then run the Stage 1/2 quantize/dequantize fixture with `--cache-type-k q8_0 --cache-type-v turbo3` and `--cache-type-k q8_0 --cache-type-v turbo4` against `gemma4-legal-iq4xs-direct.gguf` specifically (not Ornith). This is the first step in this proposal with concrete, real (not filename-inferred) implementation evidence behind it.

## QLoRA / Ornith adaptation (Stage A only)

- [x] Confirm exact Ornith 9B base checkpoint identity: architecture, tokenizer, chat template digest, context length, quantization format, license, adapter-loading support in the current inference runtime. **Done 2026-08-05 (GGUF metadata dump, see proposal.md Evidence Log): `general.architecture = 'qwen35'` (hybrid attention+SSM, NOT Gemma4-family), `attention.head_count=16`, `head_count_kv=4` (4:1 GQA), `key_length=256`, `value_length=256`, `rope.dimension_sections=[11,11,10,0]` (split RoPE, not simple single-range), `context_length=262144`, `general.file_type=30` (IQ4_XS). Chat-template digest and license still not captured — no local HF checkpoint/config.json found for Ornith to cross-check against (see next item).**
- [ ] Confirm whether a non-quantized trainable checkpoint (vs. the served GGUF) is actually available — if not, this blocks everything past Stage A.
- [ ] Build a small, fixed evaluation corpus (not live-scraped) covering: tool-call JSON validity, patch generation on 3–5 known bugs, abstention on out-of-scope requests.
- [ ] Run Stage A prompt baseline against that corpus, record scores as the reference point for any future adapter.
- [ ] Explicitly deferred: reranker/classifier training (Stage B), supervised QLoRA (Stage C), preference optimization (Stage D), RL/bandit (Stage E), `AdapterManifest` schema + adapter-prefetch batch scheduler, `RepairTrainingExample` dataset eligibility pipeline, `RepairReward` design.

## Safety guardrails (apply immediately, not deferred)

- [ ] Confirm no existing code path trains or fine-tunes anything directly from live web-fetch results — audit `web-crawl.ts` / `ldr-research.ts` / `web-search.ts` call sites for any training-data write, not just retrieval use.
- [ ] Document the `web fetch → sanitize → evidence → RAG → validated outcome → human review → offline corpus` pipeline as the only sanctioned path from proposal.md in a short code comment at the point where any future training-corpus writer would be added.

## Explicitly deferred (do not start under this task list)

- Any live-serving integration of RotorQuant/IsoQuant into `launch-turboquant.ps1`'s default profiles.
- Any QLoRA training run, adapter artifact, or adapter-loading code in the inference runtime.
- Reward-model implementation, RL/contextual-bandit implementation.
- Browser/WebGPU offload changes (out of scope for this proposal; see root CLAUDE.md GPU-sharing rules).
