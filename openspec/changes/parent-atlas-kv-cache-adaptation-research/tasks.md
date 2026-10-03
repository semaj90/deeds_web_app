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

## BIFROST-CODEMODE-01 / KV-PREFIX-01: measured prompt-token and KV-reuse baseline (2026-09-27)

Live measurements on this host (RTX 3060 Ti, llama-server `:8090`, `ornith-1.5-9b`, `--parallel 1 --cache-prompt --cache-reuse 256 -c 65536`). Fixture: one user message `Reply with exactly: OK`, `max_tokens 8`, `temperature 0`. Bifrost = Maxim OSS image (`docker/bifrost/Dockerfile` is `FROM maximhq/bifrost`), host `:3040`.

| Path | prompt_tokens | vs direct |
|---|---|---|
| A. direct llama-server | 17 | baseline |
| B. Bifrost, no MCP clients | 17 | +0 (no gateway overhead) |
| C1. Bifrost + atlas_tools (8 tools), conventional | 1,088 | ~134 tokens/tool |
| C2. Bifrost + TRACE + atlas_tools (185 tools), conventional | 36,114 | TRACE alone ~35,026 |
| D1. Bifrost, TRACE in Code Mode + atlas_tools conventional | 2,653 | -92.7% vs C2 |
| D2. Bifrost, TRACE in Code Mode only (opt-in header) | 1,783 | -94.9% vs TRACE conventional |
| E. `selectMcpToolSubset` path | NOT MEASURED | |

Root cause of the earlier unexplained `prompt_tokens: 35238` (28 s latency): Bifrost auto-injects every connected MCP client's tool schemas into each `/v1/chat/completions` request. Not KV replay.

KV prefix reuse (llama-server, `cache_prompt: true`, ~1.8K-token shared system prefix):

| Request | prompt_tokens | cache_n | prompt_n | prompt_ms |
|---|---|---|---|---|
| #1 cold | 1,838 | 0 | 1,838 | 1,238 |
| #2 identical | 1,838 | 1,834 | 4 | 112 (~11x faster) |
| #3 same prefix, new suffix | 1,839 | 1,706 | 133 | 342 |
| #4 same prefix, new suffix | 1,840 | 1,706 | 134 | 249 |

A 17-token prompt showed `cache_n: 0` even on an identical repeat, so reuse does not engage for tiny prompts. Reuse stopped at 1,706, not ~1,830, on shared-prefix requests (cause not investigated).

### Side effect found and fixed (introduced this session)
Registering the MCP clients made every request through Bifrost carry tool schemas, including the app's own caller `inference-router.ts:566` (500 ms cache-probe timeout, `x-bf-cache-key`). Fixed by `mcp.tool_manager_config.disable_auto_tool_inject: true` (applied live via `PUT /api/config` and persisted in `docker/bifrost/config.json`). Default request is back to 17 tokens; tools load only when a caller sends `x-bf-mcp-include-clients: <name>`. `config.json` also sets `is_code_mode_client: true` for `trace`. `config.json` edits are NOT yet loaded by a running container (no restart done).

### Gaps / next steps (not started)
- [ ] KV-01 Code Mode is proven only as a schema-size reduction. Not tested: a model actually discovering and executing a TRACE tool through Code Mode/Starlark end to end (the real cost of discovery calls is unmeasured).
- [ ] KV-02 Fixture E: measure `selectMcpToolSubset` (`src/mcp/server.ts`) prompt tokens for the same query and compare with D2.
- [ ] KV-03 Latency/TTFT for C2 (36K prompt) cold vs repeat. Expect the constant tool-schema prefix to be KV-reusable, but this consumes ~55% of the 65,536 context; capacity, not just compute, is the cost. Unmeasured.
- [x] KV-04 ACE v3 artifact packet token counts and compact variants measured below (KV-04b); the earlier Postgres query finding `ace_context_packets`/`ace_chunks` empty did not mean packet artifacts were absent. NES/CHR97-specific encodings remain unmeasured.
- [ ] KV-05 (CORRECTED 2026-09-27) Reuse stopping at ~1,706 tokens is NOT a mystery: 1,706 is where the shared system prompt ends and the differing user message begins, i.e. reuse stops exactly at the prefix-divergence point (smoke: new-suffix reuse 1,721/1,854 = 92.8%). Still open: prompts under ~256 tokens never reuse even when identical (17-token repeat: cache_n=0); cause unknown (`--cache-reuse 256`? min-similarity?). Design consequence: put stable content (tools/system/ContextManifest) FIRST and volatile content (query) LAST.
- [ ] KV-06 Bifrost does not surface llama-server `timings`/`cache_n`; measure reuse via llama-server directly or `/slots`, not the Bifrost response.
- [ ] OPS-01 Restart `legal-ai-bifrost` to load `config.json`, then verify clients, `disable_auto_tool_inject`, and the L2 semantic cache still work (brief L2 interruption).
- [ ] OPS-02 `sveltekit-frontend/scripts/mcp/atlas-tools-http-bridge.mjs` (`:8792`) is a manually started background process with no autostart; add to `start-trace-stack.ps1`/`tasks.json`, and delete the stray `.tmp-atlas-bridge.log` at repo root by archiving it.
- [ ] OPS-03 `record_outcome` is intentionally excluded from Bifrost's atlas_tools allowlist (writes). Decide whether any write tool may go through the gateway.
- [ ] ID-01 Unchanged blocker for canonical join work: `symbol_identity` and `semantic_768` producer are `UNKNOWN` in `docs/architecture/runtime-ownership-registry.json`; see `parent-atlas-ontology-kernel/tasks.md` SYMBOL-SEMANTIC-BRIDGE-01.

### KV-04 partial result: token cost of real packet rows (2026-09-27)

Finding: **no assembled ACE packets exist to measure or index.** Live Postgres: `ace_context_packets` = 0 rows, `ace_chunks` = 0 rows; dev server (`:5173`) was down so `search-unified` could not produce one at query time. What exists is `atlas_packets` (identity rows, ~58K). Measured instead: 8 random real `atlas_packets` rows with a summary, serialized as minified JSON, token-counted with llama-server `/tokenize` (exact Ornith tokenizer). This is serialization cost of packet ROWS, not an ACE v3 packet.

| Serialization (8 rows) | tokens/packet |
|---|---|
| Full row JSON (incl. 768-d embedding text) | 17,081 |
| Full row minus vector columns | 4,006 |
| Lineage fields + summary (directory_path, source_ref, file_path, function_symbol, feature_id, feature_label, packet_key, summary) | 197 |
| Reference only (packet_key, source_ref, feature_id) | 60 |
| Summary text only | 92 |

Caveats: n=8, random sample, not stratified; rows carry 170+ columns so "minus vectors" still includes large JSON columns (payload, metadata, topology, routing_hints, ...). The 197-token form is a hand-chosen field subset, not a defined compact contract. Nothing here validates a CHR97/NES byte encoding; that is still unmeasured.

Implication: shipping whole packet rows to a model costs ~4K-17K tokens each (top-5 = 20K-85K); a lineage+summary form is ~200. Field selection, not byte encoding, dominates savings.

### Next SPS order (2026-09-27, reconciled with external review)

Status against that review: SPS-A partly done (D2 above; fixture E still open). SPS-B: correction, `cache_prompt` IS honored (1,834/1,838 reused at 1.8K tokens); `cache_n=0` occurred only for 17-token prompts, so the remaining question is threshold/boundary behavior (KV-05), not "is it broken". SPS-E done for discovery + one tool call (bridge; port later changed 8792 -> 8794 in `config.json` and the script; live Bifrost client + running bridge still on 8792 until restart).

- [ ] SPS-A BIFROST-CODEMODE-TOKEN-01: finish fixture E (`selectMcpToolSubset`) + same-task-result check.
- [ ] SPS-B KV-PREFIX-IDENTITY-01: KV-05 (why reuse stops at 1,706; sub-256 prompts), prefix/template checksum stability. Hypothesis (unproven): the constant tool-schema prefix is already KV-reusable; Code Mode mainly saves context capacity.
- [ ] SPS-C AST-SYMBOL-KEY-CENSUS-01: enumerate the 4 live symbol-key schemes (producer, consumer, persistence, revision, collision); no winner before the census. Owner gate: `symbol_identity` UNKNOWN.
- [ ] SPS-D CandidateOrdinalMapV1 + 4x6 deterministic fixture (canonicalId -> ordinal -> CPU matrix -> GPU -> rank -> ordinal back; no row-number leakage).
- [ ] SPS-E finish: reconcile 8792/8794, autostart in `start-trace-stack.ps1`, restart Bifrost, verify.
- Rule (NO_OWNER != CREATE_OWNER): UNKNOWN owner -> inventory producers/consumers -> OpenSpec ownership gate -> declare owner -> only then implement. Applies to `semantic_768` producer and `symbol_identity`.
- Deferred until A-E land: indexing ACE packets into tree_node/hypergraph/Qdrant/Neo4j/NetworkX fanout (nothing to index: 0 stored ACE packets; identity join unresolved), SOM/KMeans/low-rank/Hilbert, BitFrost warming, adapter selection, repair tournament, CHR97/NES byte encodings.

### Smoke receipt (2026-09-27): `node scripts/atlas/smoke-kv-cache-tasks-v1.mjs` -> `docs/reports/kv-cache-tasks-smoke-v1.json`
Read-only; 12 checks, ids prefixed `SM-` so they do not collide with task ids above. Result: 10 PASS, 0 FAIL, 2 INFO (port drift note, ACE row counts). Verified live: config.json valid; Bifrost healthy with `disable_auto_tool_inject` live; TRACE (177 tools, Code Mode) + atlas_tools (10, 8 exposed) connected; default Bifrost request = 17 tokens = direct; opt-in atlas_tools 1,088 / TRACE Code Mode 1,783; genuinely cold KV run 0 reused (1,069 ms) vs identical 99.8% (33 ms) vs new suffix 92.8%; `/mcp` initialize + `tools/list` (12 tools under Code Mode, `record_outcome` not exposed) + one `tools/call`; `ace_context_packets`/`ace_chunks` = 0 rows; `symbol_identity`/`semantic_768` UNKNOWN in the registry.
Checkbox census (counts only, NOT verified progress): whole file 4/42 ticked (9.5%); the section from `## BIFROST-CODEMODE-01` to EOF 0/15 (0%). Several of those 15 are gaps the smoke test cannot check (Code Mode tool execution, fixture E, ACE packets, autostart). The 10 PASS checks are evidence for already-recorded facts, not for ticking these boxes.
Known smoke limits: does not test Code Mode actually executing a tool, `selectMcpToolSubset`, latency of the 36K path, loadability of the skill, or which bridge (8792 vs 8794) Bifrost is using. `/mcp` `tools/list` returned 12 (Code Mode meta-tools + atlas_tools), not the 185 of the pre-Code-Mode measurement.

### KV-04 result on REAL ACE v3 packets + SPS-D rescope (2026-09-27)

Correction to the earlier KV-04 note ("no assembled ACE packets exist"): true for Postgres only (`ace_context_packets`/`ace_chunks` = 0 rows). Real `atlas.ace-packet.v3` packets DO exist as local artifacts: `.tmp/atlas/ace-packets-v3/20260925T220337Z/ace-packets-v3-0000{1..4}.ndjson` (4 shards, ~41.5 MB), produced by `scripts/atlas/compose-ace-packets-v3.mjs` (local artifacts only, schema + checksum verified, REVISION_QUALIFIED rows only). Measured 10 packets from shard 1 with llama-server `/tokenize`:

| Form | tokens/packet |
|---|---|
| Raw `atlas_packets` row (earlier measurement) | 4,006 (no vectors) - 17,081 |
| ACE v3 packet, full minified JSON (~2.6 KB) | median 1,062 (min 1,018, max 1,081, mean 1,058, n=10) |
| lineage fields + summary (hand-picked subset) | ~197 |
| reference only | ~60 |

Top-5 ACE v3 packets ~= 5.3K tokens. Section shape (bytes, first packet): base 450, identity 596, source 357, semantic 514, topology 179, residency 179, evidence 264, integrity 94, schema 21. Per-section token breakdown was not completed (job still running when recorded). Hex hashes/UUIDs tokenize poorly, so identity/integrity sections likely cost more tokens per byte than prose; unverified.

SPS-D RESCOPED: NOT a build. Existing owners found by search (do not duplicate): `CandidateOrdinalMapV1` contract used across `sveltekit-frontend/src/lib/server/atlas/{features,evidence,graph}/*` and ~20 `scripts/atlas/materialize-*ordinal*` scripts; `scripts/atlas/build-candidate-feature-matrix-v1.mjs` writes a DRAFT (`canonical: false`) matrix to `.tmp/atlas/candidate-feature-matrix-v1/<ts>/` with 16,151 candidates, 6 numeric features (`numeric.f32le` = 16,151 x 6 x 4 = 387,624 bytes), `semantic768.f32le` + masks, `candidate-ordinal-map.ndjson` (checksum in `descriptor.json`), bulk numbers in raw F32LE not JSON. The existing "4x6" is a DIFFERENT thing: `scripts/atlas/ace-4x6-routing-matrix.ts` = 4 retrieval lanes (semantic/SOM/ontology/lineage) x 6 query signals, tested by `test-stage-a0-routing.mjs`; it is not a 4-candidate x 6-feature fixture.
- [ ] SPS-D-1 Census (read-only) of the ordinal/feature-matrix owners: which is canonical, which are stale duplicates, which the draft matrix's `notCanonicalBecause` blockers (representation_revision, som_revision) still block. Do this before writing any new fixture.
- [ ] SPS-D-2 If a candidate x feature 4x6 CPU/GPU parity fixture is still wanted, build it on the EXISTING ordinal-map contract only, as a test, not a new schema.
- [x] KV-04b Per-section breakdown and in-memory compact-variant token comparison are measured in the result sections below. This does not prove CHR97/NES encoding parity or tool-resolution safety.
- [x] KV-04c Stable-prefix/new-suffix end-to-end reuse measured by KV-04e: five real packets remained a fixed system prefix while five packet-specific user questions varied; `cache_n` was recorded for both full and compact variants. No separate run moved packet content into the varying suffix, and per-request prefill latency for this five-packet comparison was not recorded.

### OPS-04: daily graphify apply + Karpathy GPU at workspace open (2026-09-27)

Audit before change: `karpathy:gpu` was ALREADY in the ACE heavy lane (`sveltekit-frontend/config/startup-ace-policy.json` `heavyServiceWorker.tasks`, 24h cooldown, GPU-warm gate on :8090/Ollama, task "ACE Incremental Refresh"). The workspace-open graphify task ran only `graphify:daily:dry` by explicit CEI-20 decision. Live evidence the heavy lane was not producing: `ace:startup:heavy_last_run` absent, `gpu:karpathy:scores` = 0 entries, `logs/task-output/ace-startup-latest.log` (2026-09-26 20:45) shows all gates 0 with PostgreSQL/Qdrant FAIL, consistent with startup firing before containers were healthy (cause NOT confirmed; nothing in startup waits for services).

Operator chose "Gated daily apply". Added `.vscode/tasks.json` task `Startup: Daily Graphify Apply + Karpathy GPU (gated, 24h)`, `runOn: folderOpen`, `dependsOn` Service Health Check. Order: wait for Postgres (`pg_isready`, up to 180s) -> `graphify:validate` (non-zero => skip) -> `npm run graphify:daily` (root wrapper: admission gate then apply chain) -> `npm run karpathy:gpu`. Stamp `logs/task-output/.graphify-daily-apply-last-run` (24h) is written only when both succeed; skipped/failed runs retry next open. Log: `logs/task-output/graphify-daily-apply-latest.log`. The dry-run task remains. This reverses CEI-20's dry-run default for this one task only.

Verified: tasks.json parses; PowerShell command parses; `dependsOn` label resolves; gate command `npm run graphify:validate` exits 0 right now (Postgres ready, embedding/llama/go-retrieval/Qdrant/Valkey OK, TurboVec optional/offline).
NOT verified: the task has never actually run (no apply was executed); duration of `graphify:daily` at startup is unknown; interaction with the ACE heavy lane's own `karpathy:gpu` (possible duplicate run, idempotent Redis rewrites) is unmeasured.
- [ ] OPS-04a First real run at next folder open: confirm stamp written, `gpu:karpathy:scores` > 0, `graphify-daily-apply-latest.log` clean; if `graphify:daily` is too slow for startup, split or move to a scheduled task.
- [ ] OPS-04b Still open: the ACE heavy lane has no service-readiness wait; fix ordering there (or accept the new task as the daily owner and drop `karpathy:gpu` from the heavy lane to avoid a duplicate owner).

### KV-04b partial: per-section token breakdown of real ACE v3 packets (2026-09-27, supersedes the n=10 figure)
n=21 packets sampled from 3 of 4 shards, llama-server `/tokenize`: full packet min 1,018 / median 1,092 / max 1,115 / mean 1,087 tokens. Mean tokens by section: identity 281 (26%), base 221 (20%), source 170 (16%), semantic 114 (10%), evidence 111 (10%), integrity 66 (6%), topology 53 (5%), residency 43 (4%), schema 10 (1%). identity+base+source = ~62% of every packet. Caveats: sampled the first ~7 rows per shard (not random), one shard unsampled; section costs are computed by tokenizing each section alone, so they sum to ~1,068, not exactly 1,087.
- [ ] KV-04b remaining: build a compact variant (e.g. hash-to-reference for identity/source, drop schema/integrity from the model-facing copy while keeping them in the stored packet) and measure real saving; the model-facing copy must not replace the verified stored packet.

### ACE-V4-01 census: existing owners for the proposed "ACE V4" tranche (2026-09-27, read-only rg + Postgres)
Input: an external proposal to evolve `atlas.ace-packet.v3` into multi-representation (JSON envelope + MsgPack + mmap/raw planes + registry + LOD projections + helper registry + GPU/TRT/XGBoost lanes). Census of what already exists, BEFORE any new contract (NO_OWNER != CREATE_OWNER):

| Proposed piece | Already exists | Verdict |
|---|---|---|
| ContextManifest | `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts` (+ ~52 files referencing) | EXISTS - reuse |
| PromptPlan | `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts` (`PromptPlanV1`, ~18 files) | EXISTS - reuse |
| Prompt projection / context compiler | `sveltekit-frontend/src/lib/server/atlas/context/fanout-context-compiler-v1.ts` (+spec) | EXISTS - inspect before adding LOD projections |
| Representation registry | Postgres `atlas_representations` + `_providers`, `_lane_selections`, `_migrations`, `_compatibility_evaluations`, `_validation_results`, `_provider_fallbacks` (`drizzle/0152_atlas_representations_registry.sql`, `manual/20260903_nested_latent_representation_registry_v1.sql`) | EXISTS - a new `AceRepresentationRegistryV1` would DUPLICATE it; extend/consume it |
| LOD ladder | `PacketGlyphV1` / NES ladder LOD0-LOD7 (`atlas/residency/packet-glyph-v1.ts`) | EXISTS - map ACE LODs onto it, do not define a second ladder |
| Cache identity | `AceBitfrostCacheIdentityV1`, `PacketSemanticCacheIdentityV2` | EXISTS |
| Sub-helper / tool registry | none named `SubHelper*`; `ACPToolRegistry.ts` is the registry's `acp_sidecar_tools` CANONICAL_OWNER | extend ACPToolRegistry; do not add a peer |
| MessagePack | referenced in ~52 files (e.g. `packages/semantic-contracts/src/canonical-hashing.ts`); no measured ACE JSON<->MsgPack parity | partly exists; parity proof missing |
| `AcePacketV4` schema | none | genuinely new IF measurement justifies it |
| mmap-compatible matrix header (magic/version/dtype/counts/checksum) | none (current matrix = raw F32LE + `descriptor.json`) | genuinely new, small |
| 2-bit tri-state / nibble LUT | none found | genuinely new, bounded |
| SubHelper GPU/TRT/XGBoost lanes | see registry: cuTile/TRT are `OPTIONAL_CHALLENGER_*`; XGBoost sidecar :8765 exists | do not duplicate |

Reduced tranche (only what is genuinely missing, each gated on evidence):
- [ ] ACE-V4-01a finish this census against `ace-context-manifest.ts`, `fanout-context-compiler-v1.ts`, `atlas_representations` (read them; this pass only grepped names).
- [ ] ACE-V4-03 map ACE artifacts onto `atlas_representations` rather than a new registry; decide via OpenSpec ownership gate.
- [ ] ACE-V4-04 LOD prompt projections mapped onto the existing PacketGlyphV1 ladder; measured token cost per LOD (data so far: ref-only ~60, lineage+summary ~197, full v3 ~1,087, raw row 4,006-17,081).
- [ ] ACE-V4-08 mmap header for the candidate feature matrix (small, additive, checksum-bound to the ordinal map).
- [ ] ACE-V4-05/06/07 MsgPack parity, tri-state, nibble LUT: only after LOD projections show tokens are not already solved by field selection.
- Evidence so far that field selection dominates: v3 packet drop-`schema`+`integrity` = -7.4% tokens (mean 1,079 -> 999, n=48, sampled across shards); lineage+summary subset is ~5x smaller than full v3.

### KV-04b RESULT: compact model-facing variants of real ACE v3 packets (2026-09-27; corrects the note above)
n=48 packets sampled every 3rd row across the 4 shards; llama-server `/tokenize`; transformations applied to an in-memory COPY only (stored packets untouched).

| Variant | mean tokens | median | min-max | vs full |
|---|---|---|---|---|
| A full v3 | 1,079.4 | 1,083 | 1,013-1,140 | baseline |
| B drop `schema`+`integrity` | 999.4 | 1,003 | 934-1,059 | -7.4% |
| C B + `sha256:<64 hex>` -> 8 hex | 607.2 | 613 | 554-651 | -43.7% |
| D C + drop null/empty fields | 424.8 | 434 | 369-478 | -60.7% |

Correction: the "field selection dominates, representation does not" claim recorded in the ACE-V4-01 block is only half right for v3 packets. Section dropping (B) saved 7.4%; hash shortening (C, 9 hashes/packet) saved a further ~36 points. Long hex digests are the single most token-expensive content. Raw row -> lineage subset (4,006 -> 197) is still a field-selection win; within an already-selected v3 packet, hash representation is the lever.
Hard constraints on using C/D: 8-hex prefixes are NOT unique or verifiable identifiers. They are valid only as model-facing display references that resolve back through `packet_key`/registry; the verified full-hash packet stays the stored source of truth; any tool call the model makes must carry the full key or a resolvable short-ref map from the same ContextManifest. Collision rate of 8-hex prefixes within a manifest is unmeasured.
- [ ] KV-04d Measure 8-hex prefix collisions inside a real top-K manifest, and the short-ref -> full-hash round trip.
- [ ] KV-04e End-to-end: same task with variant A vs D as a stable prefix through llama-server; check answer parity, not just tokens.

### KV-04d RESULT: 8-hex hash-prefix collisions in real ACE v3 packets (2026-09-27)
Scanned ALL 4 shards: 15,732 packets, 46,732 distinct sha256 values (mean 4.0 distinct hashes/packet; the same hash repeats within a packet, and 182 hashes recur across packets). Global prefix collisions: 8 hex (32 bits) = 1 colliding pair (2 hashes); 10 hex = 0; 12 hex = 0. Simulated random top-K manifests (20,000 trials each, 8-hex): K=5 -> 0 collisions; K=20 -> 0; K=50 -> 1 (0.005%); K=200 -> 7 (0.035%). Consistent with birthday-bound expectation (not tuned).
Conclusion: 8-hex short refs are collision-safe enough as a model-facing display form for small manifests IF the manifest builder detects a prefix collision between distinct full hashes and lengthens those refs (e.g. to 10 hex) before rendering. Not tested: token cost of 10-hex, sampling is random packets not real retrieval top-K (real top-K may cluster by directory/revision and collide more; the 182 recurring hashes are shared revision/workspace values, not collisions).
- [x] KV-04d done (above). Remaining: KV-04e answer-parity test (A vs D), and collision-detect + lengthen logic belongs in the manifest builder (`fanout-context-compiler-v1.ts` / `ace-context-manifest.ts`, unread).

### KV-04e RESULT (limited): answer parity, full vs compact ACE v3 packets as a stable prefix (2026-09-27)
Setup: 5 real ACE v3 packets (random across shards) as a system-prompt prefix; 5 user questions (one per packet: "for packet_key X return JSON {source_ref, domain_class, som_row, som_col, source_status, source_revision_first8}"); llama-server `:8090`, temperature 0, `cache_prompt: true`; truth computed from the stored packet. Variant D = drop `schema`/`integrity`, `sha256:` -> 8 hex, drop null/empty.

| | A full | D compact |
|---|---|---|
| prompt_tokens | 5,556 | 2,283 (-58.9%) |
| fields correct | 30/30 | 30/30 |
| cache_n on questions 2-5 | 5,423 (97.6% of prompt) | 2,150 (94.2%) |

Limits (do not over-read): (1) 30 field-lookups, one model, one seed, no repeats; (2) every asked field was retained by D, so it does NOT test whether dropped fields (integrity, null structure) matter for any real task; (3) absent values counted as correct when the answer was null, so D's dropped nulls are not stressed; (4) tasks are extraction only, no reasoning, no tool calls, no hash verification; (5) the 5 sampled packets are largely hollow (null summary/model fields, HINT/PENDING statuses), so the token saving on populated packets will be smaller than 58.9%; (6) short refs were never used to call a tool.
- [x] KV-04e done as an extraction-parity smoke. Not proven: reasoning/tool-call parity, populated-packet savings, hash round-trip through a tool call.
- [ ] KV-04f Rerun on populated packets (summary/embedding present) and a mixed reasoning + tool-call task before treating variant D as usable.

#### KV-04f preflight census (read-only; 2026-09-27)
Verified all four ACE v3 packet shard checksums and the manifest root checksum: 15,732 packets, root `2f3d4e0bdf76ab4953000ae795f5a02a5fee46cc0b98d1557e23defa33692056`. No packet has non-empty `summary.text`, an `embedding_digest`, or vector bytes. There are 3,295 summary sections marked HINT, but their text remains null. A further 3,294 embedding sections carry CandidateOrdinal references; every reference resolves by exact packet_key to a unique row with mask=1 in the manifest-bound matrix, and all 3,294 referenced vectors are finite/unit-norm within 1e-4. This is pointer/readiness evidence only: the matrix descriptor says `canonical: false`, `embedding_digest absent`, and representation revision is legacy 0. Therefore no packet currently qualifies as a populated, revision-admitted summary/embedding input for KV-04f. Leave the live reasoning/tool-call comparison open; do not infer admission from the HINT status or ordinal reference.

### External summary reconciliation (2026-09-27): what a pasted second-session summary claims vs what was checked here
The pasted summary (source not identified; treated as untrusted data) asserts: Base32/CRC32 not an active ACE codec + a BitFrost directory-key comment fix; ACE v3 canary 2,604 B / 1,080 tokens (1,100 with a query); MessagePack 2,217 B exact round-trip, and Base64/hex worse for model tokens; Bifrost Atlas config on :8794 vs live :8792 with ~50 s reconnect cycles; selector requested 8 TRACE names but only 6 matched, 976 vs 30,922 schema tokens.

Checked in THIS session (independently):
- ACE v3 packet cost: consistent (this session: mean 1,079-1,087 tokens, 2.6 KB/packet).
- Port drift CONFIRMED: `docker/bifrost/config.json` = `atlas_tools -> :8794`; both bridges listen (8792 pid 13380, 8794 pid 10068); live TCP shows connections/TIME_WAIT churn on 127.0.0.1:8792 and none on 8794, so live Bifrost is still using 8792 (URL is masked in the API; inferred from sockets).
- Reconnect cycles: NOT confirmed. Many short-lived connections to 8792 are visible, but the bridge is stateless (one HTTP request per connection), so connection churn alone is not proof of reconnects; Bifrost logs in the 5-20 min window contained no MCP connect/reconnect lines. Cadence (~50 s) unmeasured.
NOT verified here (accept only as leads): Base32/CRC32/comment fix, MessagePack 2,217 B round-trip, Base64/hex token result, 6-of-8 TRACE name match and 976 vs 30,922 tokens.

Design rules worth keeping regardless (consistent with measurements here): identity = canonicalId/packetKey/sourceRevision (SHA-256 for artifact digests); Base32/64/hex = presentation/transport only, never identity; MessagePack = storage/cache representation, decoded before the prompt; representation registry should EXTEND `atlas_representations` (exists, see ACE-V4-01 census), not add `AceRepresentationRegistryV1` as a peer.
- [ ] BF-CUTOVER-01 Restart/reload `legal-ai-bifrost`, read back that atlas_tools connects on :8794 (via socket evidence + a real `tools/call`), only then retire the :8792 bridge. Two identical bridges currently run.
- [ ] BF-STABILITY-01 Measure the reconnect/ping cadence to the bridges (per-connection timestamps) before calling it a defect.
- [ ] SELECTOR-ALIGN-01 Unverified 6-of-8 TRACE name mismatch: diff selector output against live TRACE `tools/list`.
- [ ] ACE-REV-01/02/03 representation/feature/graph revisions are null in sampled packets (confirmed in this session's packet dump: `representation_revision`, `feature_revision`, `graph_revision` null; summary text null), so token measurements are structural cost, not a valid final ContextManifest.

### BF-CUTOVER-01 result + ACE-V4-01a corrections (2026-09-27)

Bifrost restart / cutover (3 restarts of `legal-ai-bifrost`, each ~6-10 s to healthy, each briefly interrupting the L2 semantic cache):
- DONE: `config.json` now loads on restart: atlas_tools connects on :8794 (2 ESTABLISHED to 8794, 0 to 8792, only TIME_WAIT leftovers), `disable_auto_tool_inject` persists (default request = 17 tokens = direct), TRACE Code Mode persists (opt-in trace 1,783 / atlas_tools 1,088 tokens, unchanged after restart), both clients connect (177 / 10 tools).
- FINDING (root cause unproven): after every restart the standalone `/mcp` gateway lists 0 tools (`tool 'atlas_tools-classify_intent' not found`) even though the clients are connected. What restored 12 tools (8 atlas_tools + 4 code-mode/TRACE-side entries; `record_outcome` hidden) was a runtime `PUT /api/mcp/client/<id>` with `allow_by_default: true`. That does NOT survive a restart: `allow_by_default` in `config.json` was not honored (live API reports `allow_by_default: None`), and adding the deprecated alias `allow_on_all_virtual_keys: true` to `config.json` loads (API shows True) but still lists 0. Chat-path opt-in (`x-bf-mcp-include-clients`) is unaffected and is the path the app would use.
- Consequence: external MCP clients using Bifrost `/mcp` need the runtime PUT re-applied after a Bifrost restart. Startup automation below now reapplies only the bounded `atlas_tools` client's setting when `start-trace-stack.ps1` runs. `config.json` still carries both `allow_by_default` and `allow_on_all_virtual_keys`; live GET confirms only the latter is represented in loaded client config.
- [ ] BF-CUTOVER-01b Retire the :8792 bridge (pid 13380) only after confirming nothing else uses it; two identical bridges still run. Not done.
- [x] BF-GW-01 Startup repair implemented in `sveltekit-frontend/scripts/start-trace-stack.ps1`: after Bifrost and the :8794 bridge are healthy, resolve the connected `atlas_tools` client ID, PUT `allow_by_default: true` for that client only, then verify `/mcp` exposes exactly its configured non-wildcard tool allowlist. PowerShell parse and JSON checks pass. It does not change TRACE admission or restart Bifrost.
- [ ] BF-GW-02 Verify the startup repair on the next approved `start-trace-stack.ps1` run: record PUT success and allowlist readback; also confirm an out-of-band Bifrost restart still requires rerunning the stack startup. Do not retire :8792 as part of this check.

ACE-V4-01a corrections (files actually read; supersede the name-grep census above):
- `sveltekit-frontend/src/lib/server/ace/ace-context-manifest.ts` (261 lines) wires the existing `ContextManifest` contract into the live query-time `ACEContext` (from `features/ai/ace/context-assembler.ts`). It is NOT built on `atlas.ace-packet.v3`. Two distinct ACE artifacts therefore exist: query-time `ACEContext` -> `ContextManifest`, and materialized per-candidate `atlas.ace-packet.v3`. Any "ACE V4" work must say which one it changes.
- `sveltekit-frontend/src/lib/server/atlas/context/fanout-context-compiler-v1.ts` (54 lines) compiles a `FanoutEvidenceBundleV1` into `contextText` with `tokenizerRevision`, `tokenBudget`, `estimatedTokenCount`, `candidateOrdinals`, `contextManifestChecksum`, `canonicalAuthority: false`. This is the natural home for LOD/prompt projection and short-ref rendering (KV-04d collision lengthening) rather than a new compiler.
- CORRECTION: Postgres `atlas_representations` (5 rows) is NOT an artifact registry. Columns are model-representation definitions (`upstream_model_id`, `native/output_dimensions`, `pooling`, `quantization`, `tokenizer_revision`, `artifact_digest`, lifecycle/verification). It has no per-packet artifact address/offset/length/checksum. The earlier line "extend `atlas_representations` instead of a new registry" is only half right: a per-packet artifact registry (packet_key x representation_id x revision -> address/checksum) would be a NEW table that REFERENCES `atlas_representations.representation_id`, layered on it, not a duplicate. Still requires the OpenSpec ownership gate.
- Pokemon/LOD frame: already exists (build-compressed-packets.mjs, derive-lod-summaries.mjs, memory-architecture-freeze Addendum 9, PacketGlyphV1 LOD0-7); no code ties dex 0-151 to UUIDs. Saved to memory (`reference_pokemon_rombank_lod_frame`).
- Checkbox census after this work: whole file 9/63 ticked (14.3%); this session's sections 5/36 (13.9%). Smoke 10/10 PASS, 0 FAIL, 2 INFO (with the runtime `/mcp` PUT applied).

### SPS-E1 result + SPS-D1/D2 result: pinned Bifrost field, and ORDINAL DRIFT between ACE v3 packets and the current matrix (2026-09-27)

SPS-E1 (Bifrost): the running image `legal-ai-bifrost:git` reports `v1.6.0` (API + `/mcp` serverInfo). Its binary `/app/main` contains `allow_on_all_virtual_keys` (14 hits) / `AllowOnAllVirtualKeys` (11) and ZERO hits for `allow_by_default` / `allowByDefault`. So in this build `allow_by_default` is unsupported (upstream docs describe the newer name; do not apply upstream docs to this pin). Removed the redundant `allow_by_default` lines from `docker/bifrost/config.json`; `allow_on_all_virtual_keys: true` remains for both clients. The restart-persistence problem is UNCHANGED: the correct field loads (API shows `allow_on_all_virtual_keys: True`) yet `/mcp` still lists 0 tools after restart until a runtime client `PUT`. New hypothesis (unproven): `/mcp`'s aggregated tool set is only populated by a client add/edit event, not by startup load. Rerun of the third-restart check not repeated to avoid more L2 interruptions.
- [ ] SPS-E2 Test the hypothesis cheaply (edit a client, or a no-op PUT, immediately after restart) and script it into the startup/restart path; prove `/mcp` visible after restart.

SPS-D1 ordinal census (read-only; descriptors/receipts, not payload bytes):

| Artifact | Grain | Rows | ordinalMapChecksum | Notes |
|---|---|---|---|---|
| `candidate-feature-matrix-v1/20260926T174833Z` | packet candidate | 16,151 (dense 0..N-1) | `61f8cf1a...` | order = sourceRef ascending, `canonical:false` (representation_revision legacy 0, som_revision absent, embedding_digest absent); numeric 16151x6 f32 (`numeric.f32le` 387,624 B), semantic768 16151x768 (49,615,872 B; 3,629 real embeddings, 12,522 masked placeholder/absent) |
| `cei24-candidate-ordinal-map-v1/20260926T175013.896Z` | packet candidate (`atlas.candidate-ordinal-map.v1`) | 16,151, dense, unique canonicalId | `90c237c8...` (differs from matrix map; records matrix map `61f8...` as input) | status `PACKET_CANDIDATE_ORDINAL_MAP_PROVEN_CHUNK_CROSSWALK_PENDING`; semanticRepresentationBindings 0; admittedFeatureLanes 0 |
| `candidate-ordinal-bridged-v1/20260926T074719Z` | CHUNK candidate | 6,732 | `ee56c81a...` | different grain (chunk), snapshot `a9777fc5...` |
| `ace-packets-v3/20260925T220337Z` | packet | 15,732 records | manifest references matrix dir `20260925T204124Z`, map `c646301b...` (an OLDER matrix) | |

SPS-D2 row<->identity parity (16,151-row current map vs 15,732-row old map vs ACE v3 packets, joined by `packet_key`):
- Only 3,294 of 15,732 ACE v3 packets carry a `CANDIDATE_ORDINAL` `vector_ref` (12,438 have none). Those 3,294: no duplicate keys.
- vs the OLD matrix that the packet manifest references: 3,294/3,294 ordinals EQUAL (100%).
- vs the CURRENT matrix (`61f8...`): 24/3,294 equal (0.73%); **3,270 MISMATCH**.
- Old vs current matrix: 15,732 shared keys, **15,552 changed ordinal (98.9%)**; 419 candidates only in current, 0 only in old. Cause: ordinal = row index in a sourceRef-sorted order, so inserting 419 candidates renumbered almost everything.
Consequences: (1) a raw ordinal is meaningful ONLY together with its `ordinalMapChecksum`; an ACE v3 packet's `vector_ref` carries kind+value with no map checksum (the binding lives only in the run manifest), so joining old packets to the new matrix by ordinal silently gives wrong rows. (2) Any cache/BitFrost/GPU artifact keyed by raw ordinal must carry the map checksum and be rejected on mismatch. (3) Design decision needed (OpenSpec, not implemented here): keep sourceRef-sorted dense ordinals and version them, OR assign append-only stable ordinals (first-seen order) so additions don't renumber. Not decided.
- [ ] SPS-D3 Decide ordinal stability policy (versioned-dense vs append-only) via OpenSpec; until then require `ordinalMapChecksum` alongside any stored ordinal.
- [ ] SPS-D4 Add a validation gate: reject any consumer that joins an ordinal to a matrix whose `ordinalMapChecksum` differs from the artifact's recorded one (would have caught this).
- [ ] SPS-D5 Re-compose ACE v3 packets against the current matrix (`61f8...`) only after the policy above; do NOT patch ordinals in place.
- Clarification (keeps two things apart): `ace-4x6-routing-matrix.ts` (4 lanes x 6 query signals = routing policy) is unrelated to the 16,151x6 CandidateFeatureMatrix (candidate x numeric features).

### OPS-04 CORRECTION: the startup task could never have succeeded as first written (2026-09-27)
Found by reading `scripts/startup/run-graphify-daily-startup.mjs` after a pasted ledger (ACE-DAILY-STEP-01) said `graphify:daily` (apply) was not run because its admission gate is `NOT_SAFE_TO_PROJECT`. Verified: `npm run graphify:daily` = that wrapper; it runs `require-canonical-projection-admission-v1.mjs` first (skipped only with `ATLAS_GRAPHIFY_TERMINAL_AUTHORIZATION=AUTHORIZE_GRAPHIFY_POST_PHASE16_TERMINAL_RUN_V1`, deliberately NOT set here). Latest verdict (`docs/reports/atlas-canonical-projection-fabric-audit-2026-09-26.json`): `overall_verdict = NOT_SAFE_TO_PROJECT` (10/11 predicates below PASS: REVISION_QUALIFIED NOT_PROVEN, LATENT_FAMILY_PROVEN NOT_PROVEN, GRAPH_MANIFEST_SEALED ABSENT, ORDINAL_MAP_SEALED ABSENT, PROJECTIONS_CHECKSUM_ALIGNED NOT_PROVEN, BITFROST_KEYS_DERIVABLE NOT_PROVEN, ACE_EVIDENCE_GROUNDED NOT_PROVEN, ...). The wrapper then throws and exits 1 ("Fallback disabled"; fallback only if `GRAPHIFY_ALLOW_FALLBACK=1`) BEFORE any apply. The tournament-admission report is ADMITTED (`workspace-revision-tournament-admission-v1.json`, 2026-09-15), so that gate is not the blocker.
Consequence: the original OPS-04 task treated that exit as failure, skipped `karpathy:gpu`, wrote no stamp and would have printed FAILED at every workspace open. FIXED in `.vscode/tasks.json`: `graphify:daily` is now non-fatal (fail-closed, no apply while the gate says NOT_SAFE_TO_PROJECT), `karpathy:gpu` always runs, and the 24h stamp follows `karpathy:gpu` success only. New PowerShell parses. If the admission gate later passes, `graphify:daily` will run its apply chain (documented up to ~3 h, 60K+ packet corpus) inside this background task at folder open; that is a heavier consequence than the operator may expect and deserves a deliberate decision before the gate flips.
Verified today (read-only): `node ../scripts/atlas/karpathy-gpu-enrich.mjs --dry-run --limit 20` from `sveltekit-frontend/` exits 0: 20 Neo4j candidates, 20 with Qdrant embeddings, 20 scored, falling back to direct Ollama (`embeddinggemma:latest`) because the SvelteKit probe failed (dev server down). Dry run wrote NOTHING (`gpu:karpathy:scores` still 0; report file unchanged). The npm script `karpathy:gpu:dry` does NOT exist (CLAUDE.md and `startup-ace-policy.json` `allowedOnStartup` both list it): stale reference, use `--dry-run`.
NOT verified: a real (non-dry) `karpathy:gpu` run and its duration; the task has still never executed at folder open.
- [ ] OPS-04c Reconcile stale docs/policy naming `karpathy:gpu:dry` (does not exist); add the npm alias or fix the references.
- [ ] OPS-04d Decide before the admission gate flips: should a ~3 h apply chain run from a folder-open task, or only from a scheduled/manual run.
Cross-check of the ordinal-drift finding against the pasted ledger: consistent. CEI-08 built the matrix at 15,732 candidates; CEI-23 rebuilt it at 16,151 by adding the 419 stale-sha256 rows (`REVISION_QUALIFIED_PACKET_SHA256_STALE`), which is exactly the 419 new rows that renumbered 98.9% of ordinals. The ledger's `aceTopkRevisionedKeyV1` already includes the ordinal-map checksum, so cache keys are protected; the unprotected artifact is the ACE v3 packet's own `vector_ref` (kind+value only).

### SPS-E2 RESULT: Bifrost `/mcp` visibility after restart is an event/refresh problem, not a permissions field (2026-09-27)
Tests (4th and 5th restarts of `legal-ai-bifrost`, ~6-24 s to healthy each):
1. Fresh restart, no intervention: `/mcp tools/list` = 0 tools at T+20 s and T+60 s (clients connected, 177 + 10 tools discovered).
2. A NO-OP `PUT /api/mcp/client/<id>` (same values as `config.json`, NO `allow_*` field sent) -> `/mcp` immediately lists 12 tools. This disproves the earlier `allow_by_default` / `allow_on_all_virtual_keys` hypotheses as the cause: the field was never what made the difference; the edit event was.
3. `mcp.tool_sync_interval: "1m"` in `config.json` + restart: `/mcp` stayed 0 for 150 s (polled every 25 s). Periodic sync does NOT populate the gateway list. Reverted (no benefit; not kept).
Cause is therefore: on startup Bifrost loads clients and their tools (visible via `/api/mcp/clients`) but the `/mcp` aggregated list is only built when a client add/edit event occurs. Root cause inside Bifrost not investigated (pinned `v1.6.0`; may be a bug fixed upstream; not checked).
Verified workaround (state now applied; smoke SM-BF-05/06 pass with it): after every Bifrost restart, re-PUT each client using values from `docker/bifrost/config.json` `mcp.client_configs` (fields name, connection_type, connection_string, is_code_mode_client, tools_to_execute). Done today via a short inline Python loop reading that file; NOT scripted or scheduled, so it must be repeated by hand after each restart. The chat-path opt-in (`x-bf-mcp-include-clients`) does not need it.
- [ ] SPS-E3 Decide whether to add a small refresh script/startup step (a new file, so operator approval per repo rules) or accept the manual step. The redundant `allow_on_all_virtual_keys: true` in `config.json` (added under the wrong hypothesis) can be removed; harmless meanwhile.
- [ ] BF-CUTOVER-01b unchanged: two identical bridges still run (:8792 pid 13380, :8794 pid 10068); Bifrost now uses :8794; retire :8792 after confirming nothing else uses it.

### OPS-05: Playwright pass over the Studio/admin pages found 3 real UI bugs; 2 fixed (2026-09-27)
Test: `sveltekit-frontend/tests/e2e/admin-atlas-ace-packets.spec.ts` (run `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true npx playwright test tests/e2e/admin-atlas-ace-packets.spec.ts --project=chromium` against `npm run dev` on :5173). Read-only: no Valkey/Postgres writes; real ACE v3 packets from `.tmp/atlas/ace-packets-v3/*` are used only as fixtures and to derive a route-stubbed count. Result now: 6 passed, 2 `test.fixme` (documented gaps).
Findings (in the order found):
1. `node.remove is not a function` (uncaught, `root.svelte`) on the FIRST `/admin/atlas` load. NOT reproducible: 3/3 warm reruns clean and a 6-route probe was clean, so it was a cold/still-compiling dev-server artifact. Root cause NOT established; do not treat as fixed.
2. FIXED: `/api/health/redis` and `/api/cache/stats` returned HTTP 500 `SyntaxError: Unexpected identifier` at module load. Cause: `await using` (explicit resource management) is not parseable on Node v22.23 and Vite's SSR transform does not lower it. Replaced with equivalent `try/finally` + `client[Symbol.asyncDispose]()` in `src/routes/api/health/redis/+server.ts` and `src/routes/api/cache/stats/+server.ts`. Both now 200 (`status: healthy`; stats returns `data.redis.totalKeys` 23,716). This also made `/admin/cache` throw (`stats` undefined).
3. FIXED: `/admin/cache` still threw after (2): `Cannot read properties of undefined (reading 'toFixed')`. The template reads `cartridgeStats.nesMemory.{totalDocuments,allocatedBanks,bankSizeBytes,totalMemoryBytes,utilizationPercent}` but `/api/cartridge/stats` returns a different `nesMemory` shape (`totalRAM, usedRAM, totalCHR, usedCHR, totalPRG, usedPRG, bankSwitches, garbageCollections, compressionSavings, documentCount, averageAccessTime`). Fixed defensively in `src/routes/(app)/admin/cache/+page.svelte` (fields optional in the type; `documentCount` used for total documents; utilization derived as usedRAM/totalRAM when absent; the rest default 0). This is a DEFENSIVE guard, not a resolution of which shape is correct: the panel now shows 0/derived values for NES fields that have no defined mapping.
Still open (not fixed):
- [ ] OPS-05a `await using` still present (same SyntaxError-at-load on Node 22) in `src/routes/api/codebase-index/export/bundle/+server.ts` (2 sites), `src/lib/server/ff1/agent/tool-registry.ts` (2), `src/lib/server/ff1/agent/gemma4-repair-planner.ts` (1). Not tested live; assume broken until converted. Also root/frontend CLAUDE.md advise `await using` as "available now" (TS 5.2+): true for the type-checker, FALSE for this Node 22 runtime. Options: convert each site (mechanical), lower `using` in the Vite/esbuild target, or move to Node 24. Decision not made.
- [ ] OPS-05b Repeatable on every `/admin/atlas` load: `requestfailed` `/src/lib/workers/admin-chat.worker.ts?worker_file&type=module :: net::ERR_BLOCKED_BY_RESPONSE` (worker script blocked by a response header, likely COOP/COEP/CORP). Admin chat worker never loads. Not diagnosed. Test is a `test.fixme`.
- [ ] OPS-05c `/api/cartridge/stats` reports `redisConnected: false` while `/api/cache/stats` reports `connected: true` and Valkey is up: two endpoints disagree on Redis state. Unexplained.
- [ ] OPS-05d The admin cache panel counts only `ace:cartridge|feature|topo:*` and `gpu:karpathy:scores`; `atlas.ace-packet.v3` packets (BitFrost) are not surfaced, and `/api/admin/atlas/cache` uses blocking `redis.keys()`. `test.fixme` records it. A real ACE-v3 cache test needs a SCAN-based count plus a first deliberate BitFrost canary write (DOC-TOPK-04), neither done.
- [ ] OPS-05e `/api/cartridge/stats` `nesMemory` vs template shape: decide the canonical NES memory contract; the defensive guard hides the mismatch.
Side effects left in the working tree: dev server running (`npm run dev`, :5173, log `.tmp-dev-server.log` at repo root), `sveltekit-frontend/test-results/` artifacts, and the new spec file.

### OPS-05a DONE + dev-server ownership + ast-grep packaging (2026-09-27)
- OPS-05a: converted the remaining `await using` sites to `try/finally` + `[Symbol.asyncDispose]()`: `src/lib/server/ff1/agent/gemma4-repair-planner.ts` (1), `src/lib/server/ff1/agent/tool-registry.ts` (2), `src/routes/api/codebase-index/export/bundle/+server.ts` (2). Non-test source now has ZERO `await using` (`rg "^\s*await using "`). Verified: the three files transpile without syntax errors, and `GET /api/codebase-index/export/bundle?limit=3` returns HTTP 200 (~18 KB). NOT verified: the ff1 agent tools were not executed (they only load when the agent runs), so they are syntax-verified, not behavior-verified. Root/frontend CLAUDE.md still recommend `await using` as "available now"; that guidance is wrong for this Node 22 runtime and should be corrected (not edited here).
- Dev server ownership (verified by process tree, 2026-09-27 22:5x): the vite listener on :5173 (pid 61380) is a child of `npm run dev` (pid 56648) started from the assistant's shell, NOT of the operator's `npm run dev:gpu` chain. The `dev:gpu` chain (`scripts/startup/dev-gpu-runtime.mjs`, pid 41584) currently owns only `llama-server.exe` (pid 19668) + a `pwsh` helper; it has no vite child. So "the app is served by dev:gpu" is not what is actually running. Nothing was stopped or restarted.
- ast-grep packaging (installed, verified): npm `@ast-grep/cli` 0.45.3 (repo root and `sveltekit-frontend`), npm `@ast-grep/napi` 0.44.0 (`sveltekit-frontend`), global `sg`/`ast-grep` 0.42.3 on PATH: three different versions (napi is older than cli; global older still). No Python `ast-grep` package is installed. Existing consumers are Node (`analysis/worker.ts`, `ace/code-intel-service.ts`, `source-pos-concept-packet.ts`), so no wheel is needed unless a Python component must call it. (Not verified this session: that PyPI publishes `ast-grep-cli`/`ast-grep-py` wheels for Windows; general knowledge only, check before relying on it.)
- [ ] OPS-05f Reconcile the three ast-grep versions (napi 0.44.0 vs cli 0.45.3 vs global 0.42.3) before any AST identity/census work relies on rule-syntax parity between the CLI and the napi binding.
- [ ] OPS-05g Decide who owns the app dev server: `dev:gpu` (llama only today) vs a separate `npm run dev`; the startup task list already has a "Dev Server (GPU, detached)" folder-open task, whose result should be checked.
- Cross-reference (from a pasted second-session status, not independently verified here except the file check above): an `atlas.ace-packet.v4` envelope (`packages/parent-atlas/src/core/ace-packet-v4.ts`) reportedly binds packet identity + ordinal to `candidateSnapshotRevision` and `ordinalMapChecksum`, addressing the SPS-D2 ordinal-drift finding; a V4 composer/corpus is reported as NOT yet done, and encoder provenance at the Go embedding service (:8097) is reported as the next gate.

### OPS-05c RESOLVED (root cause) + Valkey container census (2026-09-27; read-only, nothing changed)
Valkey container `legal-ai-valkey` (`valkey/valkey-bundle:8.1.1`, server Valkey 8.1.3, 127.0.0.1:6379, healthy, up ~2 h, restart `unless-stopped`, container mem limit 4 GiB, `/data` volume): 23,704 keys; used 241 MB of `maxmemory` 2 GiB; `maxmemory_policy noeviction`; AOF enabled, last RDB save ok; 102 connected clients (30 blocked, likely queue workers); 0 rejected connections; 0 evicted; modules loaded (bundle). `mem_fragmentation_ratio` 0.07 is odd (RSS < used) but unexplained here and probably a container-accounting artifact.
- `/api/cartridge/stats` `redisConnected:false` (was OPS-05c): NOT a Redis outage. `getCartridgeCacheStats()` uses a LOCAL `getRedis()` in `src/lib/server/cache/cartridge-tensor-bridge.ts:103` = `(redisService as any).getClient?.() || globalThis.__REDIS ?? null`. `RedisService` (`src/lib/server/redis-service.ts`, 54 lines, no base class) defines no `getClient`, and nothing in `src` ever assigns `globalThis.__REDIS`. So the helper always returns null and every cartridge cache read/write in that module silently no-ops (`getCachedCartridge` -> null, `cacheCartridge` -> returns). The identical broken pattern exists in `src/lib/server/vector-cache.ts:66`. Live confirmation: 0 keys with the module's `chr97:` prefix in Valkey. Impact is likely small: no caller of `cacheCartridge`/`getCachedCartridge` outside that file was found by grep, so the cache may simply be dead code. NOT FIXED: switching to the shared pooled `getRedis()` (`$lib/server/redis.js`) would activate a cache-write path that has never run, which needs an owner decision.
- `/admin/cache` "LLM hit rate" and "Memory hit rate" are the SAME number (3.62%): `/api/cache/stats` sets both `llm.hitRate` and `memory.hitRate` (and `metrics.overall`) to `keyspace_hits/(hits+misses)` from `INFO stats`, i.e. a server-wide Valkey ratio (49,641 hits vs 1,319,174 misses), and reports `llm.totalResponses: 0`. It is not an LLM-response or memory-cache hit rate; probably dominated by queue-worker polling misses (unproven). The panel is mislabeled and gives a false picture of cache effectiveness. NOT FIXED.
- Policy note: `noeviction` + 2 GiB cap means writes fail (not evict) if the cap is reached; earlier notes already flagged that BitFrost 7-day WARM tiers need `volatile-lru`/TTL discipline. 241 MB used today.
- [ ] OPS-05h Decide: point `cartridge-tensor-bridge.ts` and `vector-cache.ts` at the shared `getRedis()`, or retire them as dead code (archive, do not delete).
- [ ] OPS-05i Replace the admin panel's LLM/Memory hit-rate with real per-cache counters, or relabel it "Valkey keyspace hit rate (server-wide)".
- [ ] OPS-05j Explain `mem_fragmentation_ratio 0.07` and the 30 blocked clients (which services?) before drawing conclusions about Valkey load.

### OPS-06: structural-search / CPU-parallelism ownership census (2026-09-27; read-only)
Verified against real importers (not assumed from package.json alone), answering "N-API ast-grep / service-worker / CPU worker / Tree-sitter / ts-morph, do we have them?":

| Layer | Installed | Real usage |
|---|---|---|
| `@ast-grep/napi` (N-API, in-process) | `sveltekit-frontend/package.json` 0.44.0 | Only offline `scripts/atlas/*` (`audit-atlas-indexing-surfaces.mjs`, `backfill-ast-symbols.mjs`, `prefill-ast-entities.mjs`, `prove-ast-backfill-idempotency.mjs`, `test-ast-entity-utf8-span.mjs`, `smoke-hmm-error.mjs`, `regenerate-ast-declaration-candidates-v1.mjs`, `plan-file-exploration-records-v1.mts`). **Zero server-route or live-app importers.** |
| ast-grep CLI (spawned `sg`/`ast-grep`) | root + frontend `package.json` 0.45.3 | `scripts/atlas/lib/ast-grep-symbol-extraction.mjs`, `audit-atlas-indexing-surfaces.mjs`, `backfill-code-feature-registry.mjs`, `p4-summary-extraction-qa.mjs`, `source-coordinate-map-v1.spec.ts`, and one non-script file: `sveltekit-frontend/src/lib/server/ai/feature-extraction.ts` — verified that file has ZERO importers under `src/routes` (`rg` for "feature-extraction" in routes returned nothing), so it is unreachable dead code, not a live capability. |
| Tree-sitter (`tree-sitter`, `tree-sitter-{go,python,typescript}`, `web-tree-sitter`) | frontend `package.json` | Real live user: `python/miniforge_nlp_sidecar_v2.py` + `miniforge_nlp_sidecar.py` (the `:8095` NLP sidecar, a running service) and its tests. Also `atlas-openspec-awareness-v2/…/clusterer.ts` (separate package). Not called from any SvelteKit route. |
| ts-morph 27.0.2 | root + frontend `package.json` | `packages/parent-atlas/src/core/{temporal-indexing-fabric,structured-value-parity,structured-value-ast}.ts`, `scripts/docs-atlas/index-okf-dev-corpus.mjs`, `python/atlas_kernel_session.py`. Package-level, not wired into a live route. |
| CPU worker pools (`worker_threads`) | in-repo | Canonical: `sveltekit-frontend/src/lib/server/workers/compute-pool.ts` (only importer found is its own `.spec.ts`, so even the canonical pool has no confirmed production caller). A near-duplicate `src/lib/server/atlas/tensors/cpu-worker-pool.ts` (1,378 bytes) has ZERO importers in `src` — dead. Two more byte-identical-path copies exist at repo-root sibling directories `parent_atlas_tensor_residency_integration_v2/sveltekit-frontend/...` and `parent-atlas-tensor-residency-integration/sveltekit-frontend/...` — look like separate worktree/OpenSpec-change checkouts, flagged as a duplication risk, NOT resolved. |
| Service worker (`src/service-worker.ts`) | — | Zero references to ast-grep/tree-sitter/ts-morph (`rg -c` = 0 matches). It is browser cache/offline logic only, unrelated to structural search. |

**Conclusion: every AST/structural tool in this repo is an offline-script or package-level dependency. Nothing in a live SvelteKit route calls ast-grep, Tree-sitter, or ts-morph today.** The one file that looked live (`feature-extraction.ts`) is unreachable. Building the "structural fanout lane" the KV/ACE-V4 plan describes (rg + ast-grep + Tree-sitter + ts-morph behind a domain classifier) is genuinely new wiring, not activating something dormant.
- [ ] OPS-06a Decide whether to wire `feature-extraction.ts` into a route or archive it (dead per this census).
- [ ] OPS-06b Resolve the `cpu-worker-pool.ts` / `compute-pool.ts` duplication (1 dead near-duplicate + 2 stray directory copies) before adding a structural-fanout worker pool on top of it.
- [ ] OPS-06c Same OPS-05f note applies: 3 ast-grep versions (napi 0.44.0 / cli 0.45.3 / global sg 0.42.3) must be reconciled before the CLI or napi path is wired live.

### FORWARD NOTE: structural-fanout proposal received, NOT started (2026-09-27)
An external plan proposes a `StructuralWorkerPool` (Node `worker_threads`) fanning out Tree-sitter + `@ast-grep/napi` + ts-morph into a typed `StructuralCandidateV1` contract, gated by a `DomainClassificationV1` uint8 LUT, feeding the same candidate space as semantic/graph retrieval, ultimately composing `ACEPacketV4`. Sequencing offered: ASTG-01 (version align) -> EMB-PROV-01 -> ORDINAL-VECTOR-01 -> ACE-V4-COMP-01 -> ACE-V4-CANARY-01 -> CTX-V4-01 -> DOMAIN-LUT-01 -> HELPER-FANOUT-01 -> BITFROST-WARM-01 -> KV-PROOF-01 -> GPU-LOWRANK-01 -> GPU-CUTILE-01.
**Correction before anyone starts this**: per OPS-06 above, none of `StructuralWorkerPool`, `StructuralCandidateV1`, a `TsMorphWorker`, or `DomainClassificationV1` exist in this repo. Every live ast-grep/Tree-sitter/ts-morph caller found is an offline `scripts/atlas/*` tool; zero SvelteKit routes call any of them. The "canonical" CPU pool (`compute-pool.ts`) also has no confirmed production caller (only its own spec imports it). So this is genuine new-service construction, not "wire up the existing pool" — treat the proposal's framing of an already-partially-built structural lane as aspirational, not current state.
Agreed-good parts (already reflected in OPS-05f/06c and the ACE-V4 sections above): no Python ast-grep wheel needed; reconcile the 3 ast-grep versions before making N-API authoritative; V4 must bind ordinal to `candidateSnapshotRevision`+`ordinalMapChecksum` (V3's 3,270/3,294 drift is exactly why); keep Valkey / BitFrost / llama-server KV as three distinct layers, never conflate them; Titans/MIRAS/Samba stay research-only (confirmed by search, no implementation or checkpoint in-repo).
- [ ] AST-WORKER-01 (NOT STARTED) Full new-session scope: inventory + design `StructuralCandidateV1`, decide whether to build on `compute-pool.ts` or design fresh, revision-qualify any ts-morph project cache (workspaceRevision + sourceRevision + tsconfig checksum + TS version), before any fanout wiring.

### SESSION HANDOFF: "index all the ACE packets" is NOT wireable yet — do not start it before the gates below (2026-09-27)
User asked to index all ACE packets into tree_node/hypergraph/domain-classification/4D-topology/SOM/KMeans/ontology-tuples across Postgres 18 pgvector + Qdrant + Neo4j + NetworkX + RTX fanout, and to wire semantic/AST/CST/RPC packet assembler + context assembler + materializer + validator + registry + transport (mmap/Arrow/gRPC/tRPC/proto/MCP-aware/Mastra). This is a multi-week build, not a wiring task, and was correctly NOT started this session given the blockers already proven above.

**Hard blocker (already proven this session, see SPS-D1/D2 above): there is nothing valid to index yet.**
- 0 rows in `ace_context_packets` / `ace_chunks` (Postgres canonical ACE tables).
- Local `atlas.ace-packet.v3` artifacts exist (`.tmp/atlas/ace-packets-v3/`, 15,732 packets) but only 3,294 carry a `vector_ref` ordinal, and only 24 of those 3,294 (0.73%) still match the CURRENT `CandidateOrdinalMapV1` (`ordinalMapChecksum 61f8cf1a...`); 3,270 drift. Indexing on top of this would silently bind wrong feature/vector rows to wrong packets.
- `atlas.ace-packet.v4` contract exists (`packages/parent-atlas/src/core/ace-packet-v4.ts`, checksum-sealed, binds ordinal to `candidateSnapshotRevision`+`ordinalMapChecksum`) but has NO composer/corpus yet (per a cross-referenced pasted status, not independently re-verified this session beyond confirming the file and its schema fields).
- `symbol_identity` and `semantic_768` producer are both `UNKNOWN` in `docs/architecture/runtime-ownership-registry.json` (4 incompatible symbol-key schemes live simultaneously; see `parent-atlas-ontology-kernel/tasks.md` SYMBOL-SEMANTIC-BRIDGE-01).
- `:8097` embedding service has no model/tokenizer/runtime provenance receipt bound to vectors or cache keys (per the same cross-referenced status; not independently re-verified this session).

**Structural-tooling reality check (OPS-06 above, fully verified this session):** every ast-grep/Tree-sitter/ts-morph caller in this repo is an offline `scripts/atlas/*` script. ZERO SvelteKit routes call any of them. The "canonical" CPU worker pool (`compute-pool.ts`) has no confirmed production caller either. So a request-time "structural fanout lane" (Tree-sitter + ast-grep N-API + ts-morph behind a domain-classifier LUT) is new construction, not activating dormant code.

**Transport/framework census (this turn, verified by grep):**
| Piece | Status |
|---|---|
| Mastra | REAL, wired (`atlas-mastra-adapter.ts`, `atlas-mastra-request-context.spec.ts`, `prompt-plan-agent.ts`) |
| tRPC | REAL, wired (`routes/api/trpc/[...procedure]/+server.ts`, `lib/server/trpc/{init,routers/agent,agent-run-service}.ts`) |
| Apache Arrow | ONE real usage: `lib/server/atlas/graph/incidence-edge-arrow-artifact-v1.ts` (graph edges only, not a general packet transport) |
| mmap (Node) | NOTHING wired; proposal-only so far |
| gRPC/proto | Service ports exist per CLAUDE.md (embedding/retrieval), but no MCP-aware/packet-transport gRPC contract exists |

**Do not start indexing/fanout work until these close, in this order** (matches the SPS/ASTG numbering already used throughout this file):
1. `ASTG-01` — reconcile the 3 ast-grep versions (napi 0.44.0 / cli 0.45.3 / global sg 0.42.3); capability receipt.
2. `EMB-PROV-01` — bind model/tokenizer/runtime identity to `:8097` vector responses + cache keys (currently keyed by mutable `latest` alias).
3. `ORDINAL-VECTOR-01` — prove packetKey ↔ canonicalId ↔ ordinal ↔ ordinalMapChecksum ↔ exact vector bytes, end to end, for a real snapshot.
4. `ACE-V4-COMP-01` — build the V4 composer, fail closed on any provenance mismatch (do not remap old V3 ordinals onto new matrix rows).
5. `ACE-V4-CANARY-01` — produce ONLY 1-10 packets from the composer; do not run a full corpus yet.
6. Only after the canary is clean: `CTX-V4-01` (ContextManifest) → `DOMAIN-LUT-01` (uint8 domain/intent/lane routing table) → `HELPER-FANOUT-01` (the new structural worker pool + semantic + graph fanout, genuinely new code per OPS-06) → `BITFROST-WARM-01` → `KV-PROOF-01` (measure real llama-server prefill/reuse) → then, only then, GPU challengers (low-rank baseline, cuTile parity).

**Recommendation for next session:** start fresh with full context budget at step 1 (`ASTG-01`). This file (`parent-atlas-kv-cache-adaptation-research/tasks.md`) has the full evidence trail: token/KV measurements (BIFROST-CODEMODE-01, KV-01..KV-04f), the Bifrost cutover + `/mcp` visibility bug (SPS-E1/E2), the ordinal-drift proof (SPS-D1/D2), 3 fixed runtime bugs (OPS-05: Node-22 `await using`, `/admin/cache` crash, daily-startup admission-gate false-failure), the Redis dead-code path (OPS-05c/h), and the structural-tooling census (OPS-06). Do not re-derive any of this — read it first.

## ASTG-01..04 — ast-grep version convergence — CLOSED (2026-09-27)

**Real drift found and fixed, not just documented.** Before this pass, three
different ast-grep binaries disagreed:

| Component | Before | After |
|---|---|---|
| `sveltekit-frontend` `@ast-grep/cli` (package.json) | 0.45.3 | 0.45.3 (unchanged) |
| `sveltekit-frontend` `@ast-grep/napi` (package.json) | 0.44.0 | **0.45.3** (bumped) |
| Global `@ast-grep/cli` npm package (provides `ast-grep`/`sg` on PATH) | **0.42.3** | **0.45.3** (bumped) |

**Why this mattered beyond hygiene**: the live production script
`scripts/atlas/lib/ast-grep-symbol-extraction.mjs` calls
`spawnSync('ast-grep', [...], {shell:true})` — this resolves via PATH to the
**global** npm package, not `node_modules/.bin`. That script was silently
running against 0.42.3 (3 minor versions behind) while the project's own
`package.json` pinned 0.45.3 — a real, previously-undetected version skew in
a live caller, not a hypothetical one.

**ASTG-01 (choose canonical release)**: 0.45.3 — already the project's pinned
CLI version and the newest available on npm as of this check; napi and global
both had real 0.45.3 releases so no compatibility compromise was needed.

**ASTG-02 (align CLI + napi)**: done — `sveltekit-frontend/package.json`
`@ast-grep/napi` bumped 0.44.0 → 0.45.3, `npm install` run (package-lock.json
updated), verified via a live `require('@ast-grep/napi')` parse+findAll smoke
test (real match on a real TS snippet, not just "package installed").

**ASTG-03 (global `sg` developer-only)**: confirmed via the binary's own
`--version` output — 0.45.3 itself prints `WARNING: sg is deprecated. Use
ast-grep instead.` This is now upstream-enforced, not just a repo convention.
No script in this repo spawns bare `sg` (confirmed via grep) — only `ast-grep`
is ever invoked, so no caller needed changing.

**ASTG-04 (capability receipt)**: `scripts/atlas/astg-01-capability-receipt.mjs`
(npm: `atlas:astg:capability-receipt`, run from `sveltekit-frontend/`).
Verifies, live, every run:
- `napi` version from `node_modules/@ast-grep/napi/package.json`
- local `@ast-grep/cli` version from `node_modules/@ast-grep/cli/package.json`
- global `ast-grep` binary version via the exact `spawnSync(..., {shell:true})`
  invocation the real production script uses
- global `sg` binary version (same binary, deprecated alias)
- a real napi parse+findAll smoke (not just presence)

Fails closed (`exit 1`, `status: "ASTG_DRIFT_DETECTED"`) if any version
disagrees or the smoke parse doesn't match. Passing result written to
`docs/reports/astg-01-capability-receipt.json` —
`status: "ASTG_01_02_03_PROVEN"`, `canonicalVersion: "0.45.3"`, all 4
components converged, smoke `matchCount: 1`.

**Verified downstream unaffected**: re-ran the two real napi consumers
(`test-ast-entity-utf8-span.mjs`, `prove-ast-backfill-idempotency.mjs`) after
the bump — both still pass (`status: "PROVEN"` / `"DRY_RUN_PROVEN"`
respectively), same behavior as before the version bump (API surface
unchanged between 0.44.0 and 0.45.3 for the calls this repo makes).

**Next gate**: `EMB-PROV-01` (embedding-service provenance for `:8097`) per
the SESSION HANDOFF build order above. ASTG-01 was step 1 of that order and
is now closed — re-run `npm run atlas:astg:capability-receipt` from
`sveltekit-frontend/` before trusting this is still converged in a future
session (a fresh global `npm install -g` of anything ast-grep-adjacent, or a
future project-side bump, could reintroduce drift).

## EMB-PROV-01 — embedding-service provenance reconciliation — CLOSED (2026-09-27)

**Real config bug found and fixed, not just documented — second gate in the
ASTG-01 build order, closed the same session.**

**What was found**: `sveltekit-frontend/.env` had `EMBEDDING_BASE_URL` set
**twice** — once at `:11434` (Ollama, pairing with `EMBEDDING_PROVIDER=ollama`)
and again at `:8081` (the strict semantic_768 llama-server executor). Real
dotenv `.parse()` semantics mean the second occurrence silently won for the
whole process, which broke `rg-atlas/embed.ts`'s `getBatchedEmbeddings()` P0
fingerprint guard: it pairs `EMBEDDING_PROVIDER`+`EMBEDDING_BASE_URL` for its
OWN self-consistency check (does the configured provider match the live
backend at that URL?) — with `provider=ollama` but `baseUrl=:8081`, that
guard would throw `PROVIDER_URL_MISMATCH`/`BACKEND_UNREACHABLE` on first real
call, even though the actual production embed path
(`getBatchedEmbeddings` → `tryEmbedCanonical` → `ENV.SELF_URL`/`/api/embed`)
never even uses the P0-resolved URL to send its real request — a preflight
sanity check validating the wrong pairing, disconnected from the real request
path. Root cause: **one env var name, two independent logical purposes**
(the general `/api/embed`-route provider/URL pairing vs. the strict
semantic_768 lane's executor URL, both used by different real call sites)
— exactly the kind of unnamed-second-owner collision this repo's own
Duplication Prevention rule warns about.

**Fix**: introduced a dedicated `EMBEDDING_STRICT_BASE_URL` env var
(`env.server.ts`, `.env`), and repointed all 4 real production callers of the
strict lane (`embedSemantic768Canonical`) — `retrieval/embedding-service.ts`,
`features/ai/ace/context-assembler.ts`, `routes/api/atlas/search/+server.ts`,
`server/research/web-research-ingester.ts` — from the shared
`ENV.EMBEDDING_BASE_URL` to `ENV.EMBEDDING_STRICT_BASE_URL`. `EMBEDDING_BASE_URL`
is now single-valued again (`:11434`, matching `EMBEDDING_PROVIDER=ollama`),
so the P0 guard's pairing is self-consistent.

**Live proof, not just code review** — `scripts/atlas/emb-prov-01-embedding-provenance-receipt.mjs`
(read-only; embeds a fixed probe string against both real running executors,
hashes the actual on-disk GGUF, checks `.env` self-consistency):

```
config.configSelfConsistent:            true   (was false before the fix)
strictLane.isDistinctFromGeneralBaseUrl: true
artifact.artifactChecksumMatchesRevision: true   (live sha256 of
  models/embeddinggemma-300m-f16.gguf == recorded EMBEDDING_MODEL_ARTIFACT_REVISION,
  byte-for-byte, not asserted)
crossExecutorParity.cosineSimilarity:    0.999988  (Ollama :11434 embeddinggemma:latest
  vs llama-server :8081 on the checksummed local GGUF — same probe text, both
  L2-normalized 768-dim, near-identical output — proves these are genuinely
  the SAME semantic_768 representation, not two silently-diverging lanes
  sharing a dimension)
status: "EMB_PROV_01_PROVEN"
```

Full receipt: `docs/reports/emb-prov-01-embedding-provenance-receipt.json`.
Regression: `embed.spec.ts` (1), `canonical-embed.spec.ts` (6),
`embedding-service.test.ts` (4) — all 11 pass after the edit, including a
real `[embed] Backend validation passed (provider=llama-server, ...)` log
line from the live test run.

**Also required, done as part of this**: launched the dedicated embedding
executor (`scripts/launch-embed-server.ps1 -Detached -NoEvict`, PID recorded
in `logs/embed-server/`) — it was NOT running when this session started, so
the strict lane's 4 real callers would have failed with `ECONNREFUSED`
against `:8081` regardless of the env-var fix. Left running for this session;
not wired into any startup script by this change — a future session should
decide whether `npm run dev:gpu`/graphify-startup should auto-launch it (per
the launcher's own header comment, it's designed to run alongside the chat
server, not instead of it, at ~600MB extra VRAM).

**Next gate**: `ORDINAL-VECTOR-01` — prove `packetKey ↔ canonicalId ↔ ordinal
↔ ordinalMapChecksum ↔ exact vector bytes`, per the SESSION HANDOFF build
order. This is the harder, multi-week-shaped gate (the ordinal-drift proof
from earlier this session — 3,270/3,294 mismatches — lives here). Recommend
scoping it as its own focused pass rather than continuing in this same
session given accumulated context.


## ISOQUANT-SYNTH-01 / ORNITH-YARN-PROBE-01 — bounded experimental proof (2026-09-30)

- [x] ISOQUANT-SYNTH-01 Add a standalone synthetic rotate -> quantize -> dequantize -> inverse-rotate
  reconstruction harness at `scripts/atlas/prove-isoquant-synthetic-reconstruction-v1.mjs`.
  It covers dimensions 128/256/512, 2/3/4-bit scalar baselines, and deterministic 4D quaternion
  fast/full rotations. It emits only a timestamped JSON report and does not touch llama-server,
  Postgres, Qdrant, Valkey, Neo4j, or any canonical Atlas writer.
- [ ] ISOQUANT-REAL-KV-02 Stage 2 remains OPEN. The synthetic harness is explicitly not sufficient:
  capture a fixed sample of REAL K/V tensors from a supported model/runtime, run the same
  round-trip metrics, and compare against fp16/q8_0 plus any supported cache backend.
  Do not mark IsoQuant runtime support, quality parity, or VRAM/latency benefit as proven before this.
- [x] ORNITH-YARN-PROBE-01 Add `scripts/atlas/prove-ornith-yarn-runtime-v1.mjs`, a read-only
  `:8090` probe that records model identity, exposed context size when available, and a bounded
  deterministic completion. It intentionally reports `provesYaRNAlgorithmActive: false` because
  `/props` is not a stable proof of the exact launcher CLI flags across llama.cpp builds.
- [ ] ORNITH-YARN-LAUNCH-02 Bind any future claim of active YaRN to an exact launcher/process receipt:
  llama.cpp build revision, model checksum, full command line, `--rope-scaling yarn`,
  `--yarn-orig-ctx`, scale/factor fields, configured context, and rollback profile. Keep the
  current :8090 production profile unchanged until that receipt and a quality/latency comparison exist.

**Boundary:** these tasks are research proofs only. They do not create a new KV-cache owner, do not
serialize Ornith recurrent/SSM state into ACE/BitFrost/Valkey, and do not alter ContextManifest,
canonical evidence, or the existing `KvCompressionBackend` promotion gates.
