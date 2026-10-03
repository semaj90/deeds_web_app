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
