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

## Duplicate-owner finding: two `quant-config.ts` files (2026-09-07, flagged not fixed)

Found while investigating an unconditional-recommendation concern surfaced during unrelated
`parent-atlas-tensor-residency-integration` work this session. Repo-wide grep before concluding
anything, per this repo's Duplication Prevention rule:

- `sveltekit-frontend/src/lib/server/ai/quant-config.ts` — **zero live callers anywhere**
  (`getQuantStrategy`, `QuantParams`, `TURBOQUANT_CONFIG`, `ROTORQUANT_CONFIG` all confirmed
  unimported). `getQuantStrategy(modelName)` unconditionally returns `ROTORQUANT_CONFIG` for any
  `gemma4`-named model, with no runtime-availability check at all -- this contradicts this same
  OpenSpec change's own earlier finding (`2026-08-05` provenance-only pass, see this file's
  "KV-cache compression" section above) that the live runtime binary has zero
  RotorQuant/TurboQuant/IsoQuant cache-type support. If this file were ever wired up as-is, it
  would actively steer a caller toward an unsupported backend with no warning.
- `sveltekit-frontend/src/lib/ai/quant-config.ts` (note: `lib/ai/`, not `lib/server/ai/` -- same
  basename, different directory) -- the REAL, live, actually-imported file. 2 real importers
  confirmed (`lib/ai/model-ids.ts`, `lib/server/ai/inference-configs.ts`). Its
  `VERIFIED_QUANT_CONFIGS['rotorquant-experimental']` entry correctly states
  `runtimeAvailable: false, requiresFork: true, notes: 'Extreme KV compression via Clifford
  rotors. Experimental.'` -- accurate and consistent with this OpenSpec change's own audit
  history.

**Not fixed, only flagged** -- a top-of-file warning comment was added to the dead
`lib/server/ai/quant-config.ts` (2026-09-07) so a future reader doesn't wire it up trusting its
inaccurate recommendation, but the file itself was neither archived nor merged. Archival requires
an explicit operator decision and a manifest entry per this repo's archive-not-delete convention
(root `CLAUDE.md`, "Archival Rules") -- not something to do silently as a side effect of a
duplication audit. **If this is ever resolved**: either archive the dead
`lib/server/ai/quant-config.ts` (its `QuantParams`/`getQuantStrategy` shape has no real callers to
migrate) or, if a genuine server-side need for this shape ever emerges, rename it away from the
colliding `quant-config.ts` basename and explicitly import from `lib/ai/quant-config.ts`'s
`VERIFIED_QUANT_CONFIGS` as the source of truth rather than re-deriving a second, independently
maintained (and, as found here, silently-drifted) config.

## KV-cache compression (Stage 1–2 only)

- [x] Define `KvCompressionBackend` interface (`formatId`, `quantizeNewKv`, `attend`, `exportMetrics`)
      closed 2026-09-07: added `sveltekit-frontend/src/lib/server/inference/
      kv-compression-backend-v1.ts` (interface + `Fp16PassthroughKvBackend`, the only working
      backend) with 26/26 passing tests
      (`kv-compression-backend-v1.spec.ts`). **Naming collision checked and cleared before writing
      anything**: `src/lib/server/search/mla-kv-compress.ts` already exists and also compresses
      something it calls "KV" — read it in full first. It is a genuinely different capability
      (retrieval-candidate embedding compression: 768-dim -> 128-dim latent via a cached random
      projection, for ACE reranking) from this task's scope (LLM-decoding attention KV-cache
      compression backends, the RotorQuant/TurboQuant/IsoQuant research track) — not a duplicate,
      but the file header cross-references both directions so a future reader isn't misled by the
      shared acronym. **Real fp16 round-trip, not a mislabeled passthrough**: this repo's pinned
      Node runtime (v22.17.1, checked live) has no native `Float16Array`, so `float32ToFloat16Bits`/
      `float16BitsToFloat32` are a manual IEEE 754 binary16 bit-manipulation codec, verified against
      8 independently-checkable known bit patterns (`1.0` -> `0x3c00`, `-2.0` -> `0xc000`, `65504`
      (max finite fp16) -> `0x7bff`, etc.) plus overflow-to-infinity and flush-to-zero edge cases —
      not merely asserted correct. `roundTripFloat32ThroughFloat16(1/3)` produces a genuinely
      non-zero, bounded reconstruction error (matching fp16's real ~3-4 significant decimal
      digits), which is what makes calling this format "fp16" honest rather than an identity
      no-op mislabeled as a precision format (per this repo's own status-language discipline
      against, e.g., calling GGUF K-quant "AWQ"). `attend()` is a real scaled dot-product attention
      implementation (softmax over per-head query-key dot products, weighted sum over values),
      checked against an independently hand-computed reference for a tiny 1-head/2-token fixture,
      not just exercised for shape correctness. **Scope respected**: `numLayers` is carried in
      `KvTensorShapeV1` for future multi-layer batching metadata, but `attend()` operates on one
      layer at a time (looping across layers is left as a caller concern, matching llama.cpp's own
      per-layer attention) — no attempt was made to integrate this with the live `llama-server.exe`
      process, matching this task's explicit "isolated, testable in Node/Python" scope. Stage 1
      (rotation kernel) and Stage 2 (round-trip fixture over REAL, not synthetic, KV tensors
      extracted from a live model) remain separate, still-open checkboxes below — this closure
      does not touch either.
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

## Unsloth / QLoRA / adapter-merge alignment addendum (2026-09-06)

The repository contains an existing Unsloth-oriented merge/export surface, but
its readiness documents and scripts are not themselves promotion evidence. The
current reference paths are:

- `scripts/unsloth-training/merge-and-export.sh` — adapter → merged HF → GGUF
  helper; it defaults to an older Gemma 3 workflow and must be treated as a
  parameterized utility, not as proof for the live Ornith model.
- `scripts/unsloth-training/INTEGRATION_READINESS.md` and
  `scripts/unsloth-training/POST_TRAINING_QUICKSTART.md` — historical
  TensorRT/INT4 and post-training guidance; claims such as “ready”, calibration
  counts, paths, and quality loss require a fresh artifact-specific replay.
- `openspec/specs/openspec/changes/parent-atlas-agentic-completion/tasks.md`
  `PAAC-17.1`–`PAAC-17.9` — existing learning-dataset and QLoRA planning
  surface; do not create a second learning ledger.
- `openspec/changes/atlas-feature-intelligence/tasks.md` `FI-22G` — existing
  owner for selecting/exporting QLoRA examples from verified canonical evidence
  and derived feature rows.
- `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md` `FT-01`–`FT-11`
  — reranker-specific dataset, adapter manifest, precision parity, score
  normalization, and promotion gates.

The execution order is deliberately split from the live inference path:

```text
verified canonical evidence
  → eligible train/eval split
  → FP16/BF16 baseline
  → Unsloth QLoRA candidate (offline)
  → adapter manifest + checksum
  → merged HF FP16 candidate (separate artifact)
  → quality/readback proof
  → GGUF Q4_K_M or TensorRT INT4 candidate (separate artifact)
  → runtime parity proof
  → explicit promotion receipt
```

- [ ] UNSLOTH-ALIGN-01 Reconcile the exact trainable base checkpoint with the
      intended adapter. Record model/config/tokenizer/chat-template revisions,
      license, base checksum, architecture, and whether the input is a real
      trainable HF checkpoint. A GGUF served by llama-server is never the
      QLoRA training input.
- [ ] UNSLOTH-ALIGN-02 Reuse `FI-22G`/`PAAC-17` dataset ownership to export a
      frozen legal/code training corpus from verified evidence only. Split by
      repository revision and task family; keep held-out repositories/tasks
      isolated; exclude live web fetches, secrets, PII, hidden thoughts, KV
      state, raw tensors, and volatile factual claims.
- [ ] UNSLOTH-ALIGN-03 Run an unadapted FP16/BF16 baseline on the same held-out
      corpus before QLoRA. Record tool-call validity, bounded patch quality,
      abstention, citation/evidence grounding, and latency. No baseline result
      may be called an adapter improvement without this comparison.
- [ ] UNSLOTH-ALIGN-04 Run Unsloth/PEFT QLoRA offline with explicit target
      modules, rank, alpha, dropout, sequence length, seed, optimizer, learning
      rate, gradient accumulation, compute dtype, and quantization config.
      Keep legal and code adapters separate initially; a mixed adapter requires
      a measured held-out benefit and must remain a distinct revision.
- [ ] UNSLOTH-ALIGN-05 Emit the existing planned adapter-manifest contract
      (`AdapterArtifactManifest`/the best-fit `AdapterArtifactManifestV1`
      boundary) with base, adapter, dataset, tokenizer, code, and runtime
      checksums. Do not treat a directory name, notebook completion, or Hub
      label as artifact identity.
- [ ] UNSLOTH-ALIGN-06 Merge the adapter into a new FP16/BF16 Hugging Face
      checkpoint only in an isolated output directory. Prove the base bytes are
      unchanged, the merged tensor set is compatible, the changed tensor set is
      restricted to the adapter's declared target modules, and the merged model
      reloads before any quantization.
- [ ] UNSLOTH-ALIGN-07 Quantize only the verified merged candidate. Keep
      `Q4_K_M` GGUF, TensorRT INT4/AWQ, and any INT8 artifact as distinct format
      and executor revisions. Do not describe GGUF K-quantization as AWQ, and
      do not describe llama-server `-ctk/-ctv q8_0` as INT8 weight quantization.
- [ ] UNSLOTH-ALIGN-08 Run FP16/BF16 versus Q4_K_M/INT4/INT8 parity on identical
      prompts and held-out legal/code tasks. Require finite outputs, tool-call
      JSON validity, evidence preservation, task metrics, latency, peak VRAM,
      and deterministic failure behavior. A conversion success is not a
      quality or production-readiness proof.
- [ ] UNSLOTH-ALIGN-09 Load adapters in batches, never token-by-token, and
      bind every serving profile to exact base/adapter/quantized artifact
      checksums. Adapter selection is a bounded routing decision; it cannot
      change canonical source identity, semantic_768 identity, RRF ownership,
      or durable workflow identity.
- [ ] UNSLOTH-ALIGN-10 Permit live serving only after an explicit promotion
      receipt names the exact artifact, adapter, backend, flags, score/output
      normalization revision, held-out metrics, rollback artifact, and target
      process. The current Ornith `:8090` profile remains unchanged until then.

### Ownership and non-goals

- `parent-atlas-kv-cache-adaptation-research` owns KV-cache compression and
  Ornith adaptation research boundaries, not canonical knowledge or hidden
  state storage.
- `parent-atlas-best-fit-score-fabric` owns reranker-specific adapters,
  sigmoid-once score semantics, and reranker promotion evidence.
- `atlas-feature-intelligence`/`FI-22G` owns verified feature-row/example
  selection; it does not become a model trainer or identity authority.
- The existing Unsloth scripts are reusable helpers but are not a new OpenSpec
  owner, and their historical Gemma 3/Gemma 4 claims must not be copied into
  current Ornith or AtlasGemma status.

## Explicitly deferred (do not start under this task list)

- Any live-serving integration of RotorQuant/IsoQuant into `launch-turboquant.ps1`'s default profiles.
- Any QLoRA training run, adapter artifact, or adapter-loading code in the inference runtime.
- Reward-model implementation, RL/contextual-bandit implementation.
- Browser/WebGPU offload changes (out of scope for this proposal; see root CLAUDE.md GPU-sharing rules).
