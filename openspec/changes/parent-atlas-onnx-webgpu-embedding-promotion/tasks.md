# Tasks: parent-atlas-onnx-webgpu-embedding-promotion

## Re-verified 2026-09-16 — not stale, not blocked by an unrelated finding

Checked a hypothesis before acting on it: root `CLAUDE.md`'s 2026-09-06 finding that an ONNX
export is "numerically broken" (delta 4.386) refers to `AtlasGemmaRankV1` — a from-scratch Gemma4
reranker checkpoint, unrelated model, unrelated purpose. **This change is about a different
model entirely**: `onnx-community/embeddinggemma-300m-ONNX` (confirmed live in
`services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-readonly.mjs`), the community fp32 ONNX
export of the embedding model already canonical for `semantic_768`. The two are not the same
export and one's proven-broken status says nothing about the other's — do not conflate them.

Also confirmed live in `sveltekit-frontend/src/lib/server/grpc/embedding-client.ts:819-873`: the
Tier-0 ONNX-local-first reorder this change is about is still in place, unchanged since
2026-08-30, exactly as described below — real code, still unvalidated. Steps 2-11 have not been
started (matches this file's own "Status" section). This change is accurately reflecting current
reality; no correction needed, just confirmed current as of this date.

## Context

A prior session in this project reordered `embedding-client.ts`'s 5-tier fallback chain to try
ONNX-local first (was Tier 5/last-resort), per an explicit "ONNX primary, Ollama fallback"
instruction — but did this **before** running the standalone WebGPU proof script
(`services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-readonly.mjs`) or checking the model's
actual token-capacity export. The code reorder is real; it should not be treated as a promotion
decision. This change freezes the corrected validation order before any further promotion happens.

## Corrected order (operator-specified, supersedes ad-hoc handoff notes)

- [ ] **1. Reload permissions.** `.claude/settings.local.json` env-read allow rules are JSON-valid
      (`jq -e` passed) but need `/hooks` or a session restart to take effect — not yet done.
- [x] **2. Inspect real env routing.** `sveltekit-frontend/.env` reports
      `EMBEDDING_BACKEND=onnx_directml`; the server ONNX implementation is CPU-only and the
      browser challenger is the separate WebGPU path. No `DEV_GPU_EMBED_SERVER` or
      `ORT_NODE_PACKAGE_DIR` override was found in the targeted env/source audit.
      the ONNX model path var, `ORT_NODE_PACKAGE_DIR` (or equivalent) — confirm what
      `npm run dev:gpu` will actually select, don't assume.
- [x] **3. Inspect `onnx-embed.ts` before starting the app.** Verify: `isOnnxEmbedAvailable()`
      checks real runtime/provider readiness (not just file existence);
      `batchEmbedOnnx()` uses the shared `EmbeddingContextPlanV1`/`semantic_768` validator;
      it reports the actual executor/provider used; it does not silently treat a WebGPU failure
      that fell back to WASM as a WebGPU success.
      **Re-audited 2026-09-27; criteria then NOT met, canonical misuse removed:**
      (a) `isOnnxEmbedAvailable()` loads the CPU session and local tokenizer and checks the required `input_ids` and
      `attention_mask` inputs; that proves this CPU executor can initialize, not WebGPU readiness. (b) `batchEmbedOnnx()`
      still accepts raw strings rather than `EmbeddingContextPlanV1`; its output validator proves dimension/finiteness/L2
      normalization only, not the required EmbeddingGemma projection or semantic-space parity. (c) The implementation is
      explicitly `onnxruntime-node` CPU (`executionProviders: ['cpu']`) and traces `onnx-local-cpu`; WebGPU is a separate
      challenger in `services/embedding-onnx-webgpu/`, not a fallback hidden in this function. (d) The local ONNX graph
      exposes `last_hidden_state`; this code mean-pools and normalizes without the EmbeddingGemma `2_Dense`/`3_Dense`
      projections. Existing parity evidence says this recipe is off-space; no inference was run in this re-audit.
      **Safety correction, 2026-09-27:** source search found two additional canonical call paths not captured by the
      2026-09-24 note: `src/lib/server/embeddings/ollama.ts::tryEmbedCanonical` and
      `src/lib/server/grpc/embedding-client.ts::generateEmbeddings`. Both previously returned the off-space ONNX result
      under the shared EmbeddingGemma label; the latter could write it into the shared embedding cache. Those canonical
      call paths now exclude ONNX, and structured cache entries labeled `onnx-local` are ignored without deletion.
      ONNX remains callable through `canonical-embed.ts::tryEmbedOnnxChallenger`, which explicitly marks
      `canonicalAuthority: false` and `promotionEligible: false`. The 2026-09-27 correction passed 8/8 focused
      regression tests; it made no model inference or cache/DB writes.
      **Closed 2026-09-28 for the inspection contract only:** the current `batchEmbedOnnx()` delegates to
      `createOnnxChallengerBatchV1`, which validates `EmbeddingContextPlanV1` and its rendered-input checksum before
      execution, then reports `ONNX_CPU_CHALLENGER` / `CPUExecutionProvider`. The lower executor remains explicitly
      `onnxruntime-node` CPU and validates 768-dimensional finite L2 output. The result contract keeps semantic-space
      parity `UNPROVEN`, `canonicalAuthority:false`, and `promotionEligible:false`; this does not prove EmbeddingGemma
      projection parity or WebGPU readiness. Focused suites passed 10/10 with `--maxWorkers=1`; no model inference,
      service call, cache write, or database write was performed.
- [x] **4. Harden the standalone proof to fail closed.** Added
      `services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-webgpu-only-v1.mjs` with
      `requestedProvider: 'webgpu'`, `fallbackAllowed: false`, artifact/input/vector checksums,
      actual provider receipt, output dimensions, finiteness, normalization, and repeatability.
      The existing fallback-tolerant script remains separate.
      `prove-embeddinggemma-onnx-readonly.mjs` tries WebGPU, silently falls back to WASM on
      failure. Add a fail-closed variant: `requestedProvider: 'webgpu'`, `fallbackAllowed: false`,
      and check ORT package version, actual provider used, model checksum, tokenizer checksum,
      rendered-input checksum, token-tensor checksum, output dims == 768, all-finite, valid L2
      norm. Keep the existing fallback-tolerant script as a separate availability smoke test.
- [x] **5. Resolve the 512 vs 2048 token-capacity export gate before claiming parity.**
      EmbeddingGemma's model card states 2048-token capacity; the local ONNX export's
      `model_info.json` reports `max_sequence_length: 512`. Inspect the selected model's real
      input metadata (`sequence` dim: dynamic-up-to-2048, or fixed-512). Prove: 512 tokens PASS,
      628 tokens PASS (a previously-identified failing case), 1024 PASS, 2048 PASS, 2049 rejected
      pre-inference. **Do not promote the 304MB QInt8 export merely because a short probe
      succeeds** if it's still the fixed-512 artifact.
- [x] **6. Run the standalone WebGPU proof independently of SvelteKit**, fail-closed mode:
      `node scripts/atlas/probe-onnx-webgpu-semantic-768-v1.mjs`. Acceptance:
      WebGPU-only load PASS, tokenization PASS, dims==768 PASS, all-finite PASS, normalization
      PASS, same-input-3x-repeatable PASS, writes==0.
- [ ] **7. ONNX CPU vs ONNX WebGPU parity** — identical model/tokenizer/input_ids/attention_mask/
      pooling contract, only the execution provider changes. Should be tight; establishes the
      execution-provider swap is safe before touching the representation-equivalence question.
- [ ] **8. Ollama vs ONNX-WebGPU 15-row parity gate.** Frozen candidate set, per-row: cosine
      min/mean/max, absolute delta, 15×15 pairwise geometry delta, query→candidate score rank,
      Top-5/Top-10 overlap, Spearman correlation. Ollama stays canonical `semantic_768` owner;
      ONNX-WebGPU is shadow challenger until this passes.
- [ ] **9. Only then restart `npm run dev:gpu`.** Make one real embed request, inspect the
      `attempts` array/response for evidence — strengthen the receipt to require
      `source: 'onnx-local'`, `provider: 'webgpu'`, `fallbackUsed: false`,
      `representationId: 'semantic_768'`, `executorRevision`. The Tier-0 code reorder alone is
      not evidence WebGPU handled the request.
- [ ] **10. Scale 15 → 128 → 768 row parity benchmark** before any eligibility/primary-lane
      change.
- [ ] **11. Promotion ladder (do not skip stages):**
      `UNTIL PARITY`: `semantic_768` owner = Ollama, `onnx_webgpu` = shadow challenger (no
      traffic). `AFTER 15-ROW PARITY`: `onnx_webgpu` = preferred canary, Ollama = fallback.
      `AFTER 128/768 PARITY + restart proof`: `onnx_webgpu` eligible as primary, Ollama fallback.
      **Do not deprecate Ollama in the same tranche as any of the above steps.**

## Explicitly deferred / out of scope for this change

- Refreshing the stale `codebase-graph.json` (currently 11,500+ min old per repo tooling) is
  **unrelated** to proving WebGPU embedding execution — do not couple them. Refresh Graphify only
  when resuming AST/graph/MCP-fanout/ACE-graph-evidence work, and bind that run to its own
  revision receipt.
- MCP/BitFrost/ACE query-synthesis optimization audit (queued as its own follow-up in
  `parent-atlas-ace-bitfrost-cache-correctness`) — happens *after* embedding promotion is settled,
  not concurrently.

## Status

## Recheck 2026-09-17 — WebGPU execution proven; promotion gates remain open

- Evidence: The fallback-tolerant standalone proof produced a real WebGPU receipt with `768`
      dimensions, finite values, unit L2 norm, and `writes: false`.
- Evidence: The independent runtime probe also reports `actualProvider: webgpu`, ORT `1.29.0`,
      `input_ids`/`attention_mask`, `last_hidden_state`, 768 dimensions, normalized output,
      and `status: WEBGPU_RUNTIME_AND_TOKEN_STATE_INFERENCE_PROVEN`. Receipt:
      `docs/reports/onnx-webgpu-semantic-768-readiness-v1.json`.
- Evidence: Added `services/embedding-onnx-webgpu/prove-embeddinggemma-onnx-webgpu-only-v1.mjs`,
      which refuses WASM/CPU fallback and records model, tokenizer, rendered-input,
      token-tensor, and vector checksums plus three-repeat repeatability.
- Evidence / resolved negatively: The local artifact's ONNX graph accepts `512` tokens but
      rejects `628`, `1024`, `2048`, and `2049`; its dynamic input shape does not prove 2048-token
      support. The artifact is classified `LOCAL_EXPORT_FIXED_512`, with
      `promotionEligibility: BOUNDED_CHALLENGER_ONLY` and `canonicalPrimaryEligible: false`.
- Evidence: The exact-artifact strict ORT probe passes with `actualProvider: webgpu`,
      `fallbackAllowed: false`, `writesPerformed: false`, 768 dimensions, finite normalized
      output, and three-repeat stability. Receipt:
      `docs/reports/onnx-webgpu-semantic-768-readiness-v1.json`.
- Blocker: Same-artifact CPU↔WebGPU parity is not promotion-grade yet: observed cosine `0.9907539`,
      mean absolute delta `0.0037427`, and maximum absolute delta `0.0396154`.
- Evidence: A same-input CPU↔WebGPU probe now records both actual providers, identical
      `last_hidden_state`/masked-mean/L2 contracts, cosine `0.9894528`, mean absolute delta
      `0.0041073`, and maximum absolute delta `0.0204304`; status remains
      `PARITY_OBSERVED_UNADMITTED`. Receipt: `docs/reports/onnx-cpu-webgpu-parity-v1.json`.
- Blocker: The WebGPU proof emits a valid receipt but the native runtime reports a post-receipt
      teardown code (`-1073740791`); keep the lifecycle defect open until independently fixed.

Until these gates close, the Tier-0 reorder in `embedding-client.ts` remains unpromoted:
Ollama owns canonical `semantic_768`, and ONNX WebGPU remains a challenger with no traffic.

## Recheck 2026-09-17 — exact-artifact receipt output and parity replay

The strict local ORT/WebGPU probe reached inference successfully but could not replace the
existing v1 report file on Windows (`UNKNOWN` from `writeFileSync`). Added the optional
`ATLAS_ONNX_WEBGPU_REPORT` output override and emitted a fresh receipt without deleting or
overwriting prior evidence. The v2 receipt records `requestedProvider=webgpu`,
`actualProvider=webgpu`, `fallbackAllowed=false`, ORT `1.29.0`, `last_hidden_state`, 768
dimensions, finite normalized output, three-repeat stability, and
`status=WEBGPU_512_CHALLENGER_PROVEN`. It remains bounded challenger-only with
`canonicalPrimaryEligible=false` and `LOCAL_EXPORT_CAPACITY_BELOW_2048`.

The same-artifact CPU/WebGPU parity replay was also run with the matching output override.
Both providers used `last_hidden_state` with the same masked-mean/L2 contract and 768
dimensions. Observed cosine is `0.9894528117`, mean absolute delta `0.0041073369`, and
maximum absolute delta `0.0204303861`; status remains `PARITY_OBSERVED_UNADMITTED`.
Task 7 remains open because this receipt is evidence, not an admitted parity threshold.
No embedding, PostgreSQL, Qdrant, cache, projection, or source-data writes occurred.

Receipts: `docs/reports/onnx-webgpu-semantic-768-readiness-v2.json` and
`docs/reports/onnx-cpu-webgpu-parity-v2.json`.
Implementation: `scripts/atlas/probe-onnx-webgpu-semantic-768-v1.mjs` and
`scripts/atlas/probe-onnx-cpu-webgpu-parity-v1.mjs`.

The server `sveltekit-frontend/src/lib/server/embedding/onnx-embed.ts` review confirms
that this lane is deliberately `onnx-local-cpu`: it performs real session/tokenizer
availability checks and validates 768-dimensional finite, L2-normalized output, but it
does not instantiate WebGPU and its vector-only return type does not provide a WebGPU
provider receipt. Consequently Task 3 remains an inspection result rather than a
production WebGPU wiring proof, and the Tier-0 client reorder remains unpromoted.

The raw local-artifact diagnostic was also run read-only. The ONNX session exposes only
`last_hidden_state` with shape `1x10x768`; it does not expose `sentence_embedding`.
The tensor is nonzero, nonconstant, finite, and therefore supports the existing
`last_hidden_state → attention-mask mean pool → L2 normalization` contract. This resolves
the local output-shape ambiguity without implying equivalence to the published
Transformers.js sentence-embedding export or to Ollama. No report file or datastore was
written by this diagnostic.

Diagnostic: `scripts/atlas/diagnose-webgpu-onnx-raw-output-v1.mjs`.

The parity probe was replayed with a third immutable output path. It reproduced the prior
CPU/WebGPU provider receipts, output contract, vector checksums, cosine
`0.9894528117`, mean absolute delta `0.0041073369`, and maximum absolute delta
`0.0204303861`. This strengthens repeatability evidence but does not establish an
admitted threshold or change Task 7 from `PARITY_OBSERVED_UNADMITTED`.

Receipt: `docs/reports/onnx-cpu-webgpu-parity-v3.json`.

## Recheck 2026-09-17 — Ollama comparison remains unadmitted

The bounded 15-row Ollama↔local-ONNX-WebGPU comparison was executed with the
same read-only harness and immutable report output. It measured
`status=PARITY_MEASURED_NOT_PROMOTED` with no row errors, but the vectors were
not representation-equivalent: minimum cosine `-0.0778050092`, mean cosine
`-0.0300325352`, and maximum cosine `0.0740490710`. This is a negative parity
result, not a failure of the harness. The local QInt8/512 artifact remains a
shadow challenger and Ollama remains the canonical `semantic_768` owner.

Task 8 remains open. Do not wire traffic, change the canonical owner, or infer
that the result can be repaired by changing the pooling contract without first
proving that the local export, tokenizer/prefix contract, model revision, and
Ollama model are the same representation inputs.

Receipt: `docs/reports/ollama-webgpu-semantic-768-parity-v2.json`.
Harness: `scripts/atlas/prove-ollama-webgpu-semantic-768-parity-v1.mjs`.
No embedding, PostgreSQL, Qdrant, cache, projection, or source-data writes
occurred.

## Future browser cache integration: IndexedDB + WebGPU Transformers.js

- [x] **12. Define `ClientInferenceCacheEntryV1`** for browser-only chat and
      bounded preview inference results. Include model, representation,
      tokenizer, input checksum, schema version, expiry, and
      `canonicalAuthority: false`. **Verified 2026-09-27:** the strict schema
      binds model/representation/tokenizer revisions and input/output checksums,
      caps preview text at 8,000 characters and TTL at 24 hours, rejects
      canonical authority, and rejects hidden-thought, KV, tensor, and embedding
      fields. Focused schema tests pass 3/3; no browser storage or inference ran.
- [x] **13. Add a typed IndexedDB adapter** for client chat transcripts, model
      load metadata, tokenizer metadata, and bounded inference hints. Use the
      existing `idb` dependency or Dexie; do not move canonical chats, source
      identity, embeddings, receipts, or hidden reasoning into browser storage.
      **Verified 2026-09-27:** `client-inference-store-v1.ts` uses a dedicated
      versioned database, revision-pair keys for model/tokenizer metadata,
      strict schemas, visible user/assistant transcript limits, and null/false
      fallback on SSR, invalid records, and storage errors. Six focused tests
      and a scoped TypeScript check pass. Tests use the injected backend; browser
      IndexedDB reload/quota behavior remains for task 16.
- [x] **14. Keep in-memory acceleration optional**. LokiJS/`Map` may serve as an
      L0 session cache; IndexedDB is the persistent browser cache. Cache misses,
      expiry, quota errors, and schema upgrades must fall back safely.
      **Verified 2026-09-27:** an optional injected `Map` is disabled by default
      and serves only the current session when IndexedDB cannot open or write;
      expiry evicts from both tiers, and failures otherwise return cache misses.
      Seven focused tests and the scoped TypeScript check pass. Real browser
      storage reload/quota behavior remains open for task 16.
- [x] **15. Cache model artifacts only through the Transformers.js/runtime
      cache contract**. Store local metadata and checksums; browser cache state
      is not model-promotion evidence. **Verified 2026-09-27:** this adapter
      stores only model load metadata and an optional SHA-256 artifact checksum;
      its strict schema rejects model artifact bytes. Model loading remains
      through the existing `@huggingface/transformers` `from_pretrained` owner.
      Tests verify metadata acceptance and artifact-byte rejection; this is not
      cache integrity or model-promotion evidence.
- [x] **16. Add client replay tests** for cache hit/miss, revision mismatch,
      expiry, reload persistence, deterministic input checksums, WebGPU
      unavailable fallback labeling, and explicit `fallbackUsed` reporting.
      **Verified 2026-09-27:** a focused Playwright Chromium test exercised the
      production adapter against real IndexedDB in an isolated browser context.
      It proved hit/miss, input/model-representation-tokenizer revision-bound
      cache keys, expiry eviction, persistence across page reload, deterministic
      SHA-256 input checksums, and separate WebGPU-unavailable / WASM-fallback
      metadata with explicit `fallbackUsed`. No model/provider call occurred;
      this is local browser storage proof, not model execution or promotion.
- [x] **17. Promotion boundary**: browser WebGPU remains a challenger/preview
      lane. It cannot write canonical vectors, alter CandidateOrdinal, promote
      ontology tuples, or replace server retrieval/chat truth.
      **Verified 2026-09-27:** browser inference persistence is strict local
      preview/transcript/model/tokenizer metadata with `canonicalAuthority:false`;
      unknown vector, canonical identity, CandidateOrdinal, ontology, and
      promotion fields are rejected. The server ONNX challenger remains marked
      non-canonical and not promotion-eligible, and regression tests confirm the
      canonical paths do not route through it. This closes the boundary contract;
      it does not promote WebGPU or claim provider parity.

## 18. WebGPU / Intel CPU Fallback, Shader Cache & E2E-06..09 Lifecycle Gates (2026-10-11)

- [x] **18.1 E2E-06/07/09 Scaffold Verification**: Verified manifest-shape validator (`atlas-offline-model-artifact-manifest-v1.ts`), sequential executor lifecycle port (`atlas-browser-executor-lifecycle-v1.ts`), and frozen prompt/tokenization shape (`atlas-frozen-browser-prompt-v1.ts`). All 11 tests pass via `npx --no-install tsx --test`.
- [x] **18.2 Intel / Integrated GPU & CPU Fallback**: If no discrete GPU adapter is detected, browser WebGPU falls back to integrated Intel CPU graphics or WASM/CPU backend. Requires explicit `fallbackUsed: true` and `adapterType: 'cpu-wasm' | 'integrated-gpu'` tagging; adapter max limits never substitute for verified VRAM budgets.
- [x] **18.3 WebGPU Shader & IndexedDB Cache Integrity**: WGSL compute shaders (e.g. 2×2 matmul oracle, embedding projection) cache compiled modules and metadata in IndexedDB (`idb` / `atlas-webgpu-shader-cache`) keyed by deterministic shader source SHA-256. Prohibits caching untyped model weights or unverified tensor buffers.
- [x] **18.4 E2E-07a/08a/08b Sequential Lifecycle & Teardown Boundary**: Enforce explicit abort, timeout, and release verification (`verifyReleased()`) ensuring Transformers.js WebGPU session releases resources and tears down before LiteRT-LM JS initializes. Reject concurrent browser sessions and block model load until verified memory receipts exist. **Verified 2026-10-11:** `atlas-browser-executor-lifecycle-v1.test.ts` (4/4 tests pass) proves sequential order enforcement, clean disposal on prepare error, release verification gating, and blocking on unverified teardown.


## EmbeddingGemma 2 canonical migration plan (PLANNED 2026-11-17; operator decisions required before any phase runs)

Direction from operator (2026-11-17): EmbeddingGemma 2 becomes the primary embedding model; Ollama `embeddinggemma:latest` (EG1) is kept as the backup representation. Corpus includes all 50 state constitutions. Target: pgvector halfvec, Qdrant with TurboQuant on Qdrant 1.20. Nothing here has run. Each phase below writes data or changes a service.

### Decisions required (operator)
- [ ] D1: EG2 replaces EG1 as canonical `semantic_768`. This supersedes the `CLAUDE.md` rule that `embeddinggemma:latest` is canonical. The policy text must be updated with evidence, and the old rule kept as history.
- [ ] D2: Keep EG1 in Ollama and in its current Postgres and Qdrant representation as the backup. No deletion.
- [ ] D3: Qdrant 1.19.0 to 1.20 upgrade. Datastore lifecycle is human-operated. Take a snapshot of `codebase_chunks_768` and `_v2` first.
- [ ] D4: Approve the re-embed write (Phase 5) and the constitution ingestion write (Phase 3) separately.

### Phases and gates
- [ ] P1 Evaluation (read-only). Run `docs/reports/embeddinggemma2-relevance-evaluation-plan.md` on a frozen, revision-qualified corpus with independently judged queries. Gate: EG2 beats EG1 on the golden set at equal recall@10 with tie-aware scoring. Record CPU latency and throughput for text (not yet measured; the only measured figure is about 33 s per synthetic image on CPU).
- [ ] P2 Parity. The Google PyTorch checkpoint is the quality reference. Measure the Q8 ONNX output against it (cosine per sample, worst case). The upstream report claims 0.9997 worst-case cosine; that is not a Parent Atlas measurement. Gate: measured parity on our corpus, not upstream numbers.
- [ ] P3 Constitution corpus. Choose the source for all 50 state constitutions, pin revisions, record licences and SHA-256 per file. Ingest as new source-revision-qualified rows. Do not overwrite existing rows. Requires approval (D4).
- [ ] P4 MRL policy. 768 is canonical. 512, 256 and 128 are derived by prefix truncation and L2 renormalization of the 768 vector, and each derived lane is a separate, optional representation. The `latent_*` autoencoder is trained on EG2 vectors only, because the v3 checkpoint is an EG1-space model and cannot be reused. Gate: each derived lane is compared to the 768 baseline on the same golden set.
- [ ] P5 Schema (additive). New `semantic_768` representation for EG2 with halfvec(768), an embedding version and a recipe stamp. Dry-run the migration in the scratch database inside a transaction, then roll back. Apply only after approval.
- [ ] P6 Re-embed. Dry-run first (count of 274,465 existing chunks plus constitution chunks). Snapshot the affected columns. Apply in batches with the pre-image compare-and-swap and in-transaction readback from the latent backfill. Requires approval (D4).
- [ ] P7 Qdrant on 1.20. Create a new collection with TurboQuant quantization and payload fields `representation_id`, `embedding_version`, `source_revision`. Populate from Postgres. Verify parity against Postgres for a sample. Swap an alias only after verification. Keep the EG1 collection untouched.
- [ ] P8 Cutover. Query prefix `task: search result | query: `; document prefix `title: none | text: `. Both sides must use the same recipe. A rollback flag returns the query path to EG1 without a re-embed.
- [ ] P9 Retire nothing. EG1 stays as the backup until a later, separate decision.

### Risks recorded now
- The EG2 ONNX file is a community Q8 conversion, not an official Google quantized checkpoint.
- Mixed vector spaces during the migration are unsafe. Do not serve queries from one model against corpus vectors from the other.
- The current latent rows (55,169) and `codebase_topology_64` belong to the EG1 space and must be rebuilt, not carried over.
- The `dev:gpu` `onnx_cpu` backend is currently wired only to the evidence paths. `/api/embed` remains on Ollama until P8.

- [x] P1 status (2026-11-17): BLOCKED, not run. `docs/reports/embeddinggemma2-relevance-evaluation-plan.md` requires human-authored code-search queries, two independent graded judgments per pair (0 to 3), sealed dev and held-out splits, and a reviewed corpus manifest. None exists: the golden review corpus has 60 pending queries with no judgments, and the evidence-table snapshot has no source-bound records. The plan also authorizes no model runs until those artifacts exist. No labels were created.
- [ ] P1 unblock: (a) reviewers author and judge queries (recruiting is an operator action); (b) build the source/chunk manifest with checksums; (c) approve a bounded EG2 run once (a) and (b) exist.
- [ ] P2 parity needs the Google PyTorch EG2 checkpoint as the reference. No PyTorch EG2 weights are on disk, only the Q8 ONNX conversion. Downloading the reference is an external action and needs approval.

- [x] P1 proxy run (2026-11-17, classification proxy, NOT relevance evidence): 370 labeled domain rows with source text on disk; 367 used (12 classes; `error-handling` dropped, 3 rows). Logistic regression, stratified 5-fold, same split for both models, bootstrap 95% CI. Text-only input for both models (fair control): EG1 `embeddinggemma:latest` accuracy 0.649 [0.600, 0.692], macro-F1 0.645 [0.594, 0.688]; EG2 Q8 ONNX (document recipe) accuracy 0.610 [0.564, 0.662], macro-F1 0.593 [0.541, 0.643]. The intervals overlap, so no separation at this size. Confound found: EG1 with the path title (`title: {path} | text:`) reaches 0.766 accuracy, so the path is a strong signal and the recipe must be matched before any comparison. Caveats: labels are weakly verified (see domain-calibration-gold-v2 notes), EG2 is a community Q8 conversion, and this does not meet the relevance gate. No canonical writes. Scratch: `%TEMP%\eg-proxy`.


## Improvement steps and QLoRA requirements (recorded 2026-11-17; nothing run)

### Measured so far (proxy only, not relevance)
- [x] Text-only 367-row proxy: EG1 accuracy 0.649, EG2 0.610 (intervals overlap).
- [x] With file path: EG1 0.766, EG2 0.711 (point estimates; intervals not computed for this run).

### Embedding steps
- [ ] E1 Match the recipe. Use the model-specific query prompt for code retrieval: `task: code retrieval | query: ` (from EG2 `config_sentence_transformers.json`). Our adapter currently uses `task: search result | query: `.
- [ ] E2 Context window. The official card gives an 8K context (8,192 tokens). Our adapter truncates at 2,048 (`EMBEDDINGGEMMA2_ONNX_TEXT_MAX_TOKENS_V1`). Test longer inputs in the evaluation; longer inputs change the vectors, so chunk size becomes an evaluated variable.
- [ ] E3 Quantization cost. Run full precision (FP32 or a verified FP16 path) against Q8 on the same inputs, to measure what the Q8 conversion costs.
- [ ] E4 Path and title. Keep the file path in the document recipe for both models, and record it in the recipe revision.
- [ ] E5 Relevance evaluation. Human-written queries and graded judgments, as in the P1 gate. Nothing above is a substitute for it.

### Classifier steps
- [ ] C1 Human labels. Use the 455 reviewed domain rows, after confirming reviewers actually made independent judgments (identical timestamps and the note "a human must confirm" suggest batch confirmation).
- [ ] C2 Reach the floor. Requires at least 200 reviewed rows and 30 per class; `error-handling` has 3 rows.
- [ ] C3 Retrain on reviewed labels with a fixed seed and a held-out split, and record the model revision.
- [ ] C4 Fix the README and the host/container copy so they match the image (the container copy loads the checkpoint; the host copy does not).
- [ ] C5 Keep the output a proposal until accuracy and calibration are measured.

### QLoRA: what it would require
- [ ] Q1 Base weights in Hugging Face safetensors form. We have GGUF for inference only; the Gemma 4 safetensors base must be downloaded (external action, needs approval).
- [ ] Q2 GPU budget. The RTX 3060 Ti has 8 GB. The `:8090` server holds about 6 GB, so training needs `:8090` stopped (human-operated, gated). A 4-bit base for a model of this size is tight on 8 GB; measure before committing.
- [ ] Q3 Software. transformers, peft, trl and bitsandbytes at pinned versions. bitsandbytes support on Windows is limited; WSL2 is likely needed. Verify before installing (DEPENDENCY-CAPABILITY-GUARD).
- [ ] Q4 Data. Training pairs from reviewed sources only, with a sealed held-out set. We have neither yet.
- [ ] Q5 Admission. An adapter is a new, revisioned artifact with immutable checksums, held-out evaluation, rollback metadata and a promotion receipt. It is not canonical until admitted (AGENTS.md).
- [ ] Q6 Decision first. QLoRA is not on the critical path; the embedding and classifier steps above come first.

- [ ] E6 Token budgets. Recorded 2026-11-17: text cap 2,048 tokens (our choice, no recorded rationale); images 280 soft tokens each (processor config); audio window 480,000 samples (30 s) but processor config says 280 audio tokens at 40 ms (about 11 s). These disagree, so verify the audio window before using it. The official 8,192-token budget is shared across text and media; set limits per input type, not by raising text alone.

- [x] E2 partial (2026-11-17): the text token cap is now configurable with `EMBEDDINGGEMMA2_TEXT_MAX_TOKENS` (64 to 8192), read at call time. Default unchanged at 2,048, so no existing output changes. A non-default cap appends `.t{n}` to the preprocessing revision, so vectors from different caps are never mixed. Spec 8/8 pass; reader checked for unset, valid, out-of-range and non-numeric values. Not yet evaluated: P1 gate applies before any non-default cap is used for canonical output. Audio window unchanged (see E6).


## RAM and dense-search options (recorded 2026-11-17)

Scale: `codebase_chunk_index` holds 274,465 rows (about 0.27 million vectors, not 278 million). fp32 is about 843 MB, fp16 about 422 MB, int8 about 211 MB at 768 dimensions. Index: pgvector HNSW on halfvec, canonical.

Snapshot (free RAM 4.1 of 31.9 GB): TypeScript server node process about 4.8 GB (probable), unidentified node about 3.5 GB, WSL VM about 3.5 GB (Docker datastores), Memory Compression about 1.4 GB.

- [ ] R1 Restart the VS Code TypeScript server (user action, about 4.8 GB).
- [ ] R2 Cap the WSL VM with `.wslconfig`, then restart WSL (human-run; restarts containers).
- [ ] R3 Keep dense search inside Postgres HNSW; do not copy vectors into Node.
- [ ] R4 Store int8 or memory-map raw vectors after the int8 recall check passes.
- [ ] R5 Run one EG2 worker with 4 threads until the benchmark is done.
- [ ] R6 Lower the llama context (65,536) only after a measured need; requires a `:8090` restart.
- [ ] R7 DiskANN or GPU build: revisit only above about 1 million vectors (SNIA estimate: DiskANN and HNSW about 18 GB each at 1M, 768 dimensions).


## HANDOFF INDEX (2026-11-17): open work by owner and gate

Start here. Each item names its owner; nothing below has run unless marked done. Gate = what must be approved first.

| Area | Owner (openspec change) | Open item | Gate |
|---|---|---|---|
| Embedding canonical | parent-atlas-onnx-webgpu-embedding-promotion | P1 relevance eval (needs human qrels); P2 parity (needs Google PyTorch EG2 reference); P5 to P8 migration | Human reviewers; download approval; D1 to D4 |
| Embedding recipe | same | E1 code-retrieval query prompt; E2 token cap (configurable, default 2048, uncommitted); E3 Q8 vs FP32; E4 path recipe; E6 audio window mismatch (30 s vs 11 s) | Evaluation first for any non-default cap |
| Latent autoencoder | parent-atlas-neural-prefill-encoder | Exclude 53,466 unvalidated latent rows; live apply (gated, rehearsed); rebuild codebase_topology_64; per-row provenance | Snapshot plus approval for any live write |
| Qdrant | parent-atlas-onnx-webgpu-embedding-promotion (P7) and neural-prefill | Upgrade 1.19 to 1.20 (operator); TurboQuant collection; latent_64 route stays gated (ENABLE_LATENT64_LANE) | Operator-run upgrade and snapshot |
| Corpus | legal-corpus-california-codes; parent-atlas-source-qualified-corpus-admission | 50 state constitutions (P3); full repo ingest (about 113k files, index covers 28k paths); scope decision | Scope decision; dry run; write approval |
| Classifier | parent-atlas-onnx-webgpu-embedding-promotion (C1 to C5) | Checkpoint is weak-label only; 455 rows need independent review; README and host or container copy mismatch | Human review; 200 reviewed rows and 30 per class |
| SAM 2 silhouettes | parent-atlas-spz-detective-renderer | Mask lineage registry (schema approval); collision check; check:fast; spawn test; enablement | Schema approval; live write approval |
| Launcher and llama-server | parent-atlas-spz-detective-renderer (llama section) | Double-launch live test; status check with a speculative flag; profile-mismatch kill risk; MTP fork build (not started); vision projector decision | Operator decisions; build approval |
| RAM and GPU | parent-atlas-onnx-webgpu-embedding-promotion (RAM section) | Restart TypeScript server; WSL memory cap; GPU window for cuGraph PageRank and cuVS KMeans parity | Operator-run restarts; :8090 stop for GPU window |
| Dependencies | sveltekit-frontend gpu-compute-lanes consolidation | onnxruntime-common in 4 versions (runtime mismatch already hit); zod 3 and 4 mixed; typescript-eslint 6, 7, 8 | Read-only dedupe report first; per-package approval |
| Code analysis | (new owner needed) | Structural duplicate detection with ast-grep and tree-sitter hashing; symbol index for missing functions | Capability gap check first |
| Offline analytics | (new owner needed) | DuckDB offline analysis of chunk metadata export (read-only, scratch) | Export approval |
| Uncommitted | this branch | Commit: SAM 2 follow-ups, dev-gpu banner, EG2 token cap, tasks notes (dev-gpu-runtime.mjs has an earlier unrelated change) | Commit approval |

Decisions still open: /api/embed provider (recommend Ollama); vision projector on or off; Headroom for OpenCode; NLP estimate field meaning; commit scope.

Scratch artifacts: %TEMP%\eg-proxy (proxy embeddings and scripts). Nothing written to Postgres, Qdrant or canonical vectors in this session except a rehearsal schema, which was dropped.


## HANDOFF UPDATE (2026-11-17, latest): embedding provider and context

Operator direction: use EmbeddingGemma 2 through `onnx_cpu` for embeddings, not Ollama, and use the longer context window. Ollama `embeddinggemma:latest` stays as the backup representation.

Status: NOT switched. Query-path switch is blocked on the corpus re-embed. The 274,465 stored vectors are EG1, so EG2 queries against them would return wrong neighbors silently.

Required order:
- [ ] H1 Approve the dry run: time 100 chunks through EG2 on CPU at the chosen cap (`EMBEDDINGGEMMA2_TEXT_MAX_TOKENS`, 2048 default, up to 8192). Writes nothing.
- [ ] H2 Approve a snapshot of the embedding columns (read-only backup, then a restore path).
- [ ] H3 Approve adding a new EG2 representation column (halfvec, recipe-stamped). EG1 columns are not overwritten.
- [ ] H4 Approve the full re-embed into H3, in batches with pre-image compare-and-swap and in-transaction readback (same pattern as the latent backfill, rehearsed in scratch).
- [ ] H5 Only after H4 reads back: switch the query path to `onnx_cpu` with the matching query recipe, keep a flag that returns queries to Ollama EG1.
- [ ] H6 Quality gate: the P1 human-judgment evaluation still applies before EG2 is called better than EG1. The context window change needs its own evaluation, because a longer cap changes the vectors.

Not yet decided: which cap to use (2048 is the current default; 8192 is the official limit, costlier on CPU).

Context note: the MS-era 8K figure is the official card value; the local config reports a larger max position, which is not the evaluated window.


## SIMD inventory (2026-11-17): AVX2 and AVX-512 alignment

CPU: Intel Core i7-11700F (11th gen). AVX2 expected; AVX-512 expected on this generation but NOT verified here (no runtime flag check run).

Existing AVX2 owners (tests exist):
- `simd-bridge/cpp/nes_lut_filter_avx2.cpp` and `.h` (NES LUT filter; 50 test refs in `test_nes_lut_filter_avx2.cpp`).
- `mrl_prefix_renorm_avx2.cpp` and `.h` (MRL prefix renormalization; `test_mrl_prefix_renorm_avx2.cpp`). Directly relevant to the 512/256/128 lanes.
- `spatial-simd-morton.ts` (Morton spatial keys, TypeScript).
- `quantized_feature_block.h` (packed bit codes, LSB-first; cross-language parity checked).
- `atlas_byte_synth_core.*` (64-byte canonical records), `indexed_palette_4bpp.h`.

AVX-512 kernels: none found in the repo.

Not found as SIMD code: contextual engineering, MLP, FSM and ACE JSON insert paths. They are not vectorized; any SIMD work there needs a measured hotspot first.

Next steps (gated):
- [ ] S1 Verify AVX2 and AVX-512 support at runtime (CPU feature query on this machine) before any AVX-512 work.
- [ ] S2 Benchmark MRL renormalization (AVX2) against scalar on the chunk sample, with a parity check.
- [ ] S3 Profile the ACE JSON insert and MLP paths to find a real hotspot before choosing SIMD.
- [ ] S4 Any AVX-512 kernel needs a CPU reference and a parity receipt; it is not promoted without one.

Timing run status: 100-chunk sample written to %TEMP%\eg-timing\chunks.json (read-only). EG2 timing run not yet executed; cap defaults to 2048.

- [x] S1 verified (2026-11-17): the .NET 10 runtime reports AVX2, AVX-512F, AVX-512BW, AVX-512VL and AVX-512 VBMI supported on the i7-11700F. This is a runtime capability check, not a benchmark. No AVX-512 kernel exists in the repo, so the capability is unused.

- [x] H1 timing run (2026-11-17, read-only, 100 random chunks, default cap 2048): total 77 s; mean 774 ms, p50 622 ms, p95 1,506 ms per chunk on CPU; mean 269 tokens, max 558 tokens; no chunk reached the cap. Projection for 274,465 chunks at the mean: about 59 hours single-thread; multi-worker needs RAM headroom. The longer cap only affects the few long chunks; measure the long tail before choosing it. Summary: `%TEMP%\eg-timing\timing-summary.json` (writesPerformed false).

- [x] H2 snapshot (2026-11-17, read-only export): `%TEMP%\eg-snapshot\eg1_768_snapshot.csv` (274,428 rows, content_embedding_768 text, 2.6 GB) and `eg1_snapshot.csv` (57,243 rows, halfvec content_embedding, 0.5 GB). No restore script written yet. WARNING: C: has 9.1 GB free; a new column plus the re-embed needs room, and the snapshot files already use about 3.2 GB. Move snapshots off C: or free space before H3.
- [ ] H3 add the EG2 column: NOT done; awaiting explicit approval and the cap decision.
- [ ] H4 re-embed: NOT done; awaiting H3 and approval.


## Upstream version check (2026-11-17, web search, unverified)
- [ ] U1 OAKlib: newest found is v0.7.3 (Zenodo, July 16, 2026); v0.6.24-rc1 in April. Confirm against the GitHub releases page before any upgrade. Repo runtime version not yet checked against this.
- [ ] U2 cuVS and cuGraph: sources conflict (v26.06.00 vs v26.10.00); no November 2026 release found. Our WSL env is pinned at 26.06.00. Confirm on rapids.ai and the cuVS GitHub releases page. Any upgrade is a separate decision (no second RAPIDS environment).
- Status: user is checking these release pages directly. Nothing changed in the repo or services.

