# Legal AI Platform — Claude Project Instructions

## Current runtime and ACE/BitFrost status (2026-09-28) — condensed (full text archived 2026-10-03)

Verbatim original (all bullets, the 8-step remaining implementation order, the MCP/Atlas census note): `docs/archive/claude-md-status-and-governance-2026-10-03.md`. Detailed checklist: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`. Historical status banners later in this file must not override this note.
- **Semantic storage:** the `semantic_768` physical owner is `codebase_chunk_index.content_embedding_768` (`vector(768)`) per the 2026-09-27 correction; `semantic-representation-v1.ts` and its receipts keep the historical `content_embedding` (`halfvec(768)`) coordinate; new bindings use the additive V2 contract. A populated column does not prove source/tokenizer/model/representation lineage; do not rewrite historical receipts.
- **Native CUDA/LibTorch build (2026-09-27):** the forced rebuild of `tensorrt_bridge.node` passed configure, build, addon-exists and GPU-load stages on RTX 3060 Ti/sm_86, CUDA 13.0.48, LibTorch `2.9.0+cu130` (`scripts/startup/build-cuda-libtorch-on-startup.mjs`). Not a CUDA 13.4/TensorRT-RTX build, a 13.2.2 migration, or production-inference proof; preserve the working CUDA 13.0 + cu130 path.
- **Synthesis/tool model:** Ornith 1.5 9B on llama-server `:8090` (resolve via the runtime model resolver); not the embedding writer. TRACE MCP `:8788` starts on its own task (not part of `graphify:daily:chain`). No Docker MCP server is registered; never expose generic `shell.run` or Docker control to the model — keep operations typed and governed.
- **Bifrost != BitFrost:** Bifrost = inference/MCP gateway; BitFrost = disposable Valkey residency/cache policy. A `gpu:karpathy:*` write or a healthy Bifrost is not proof ACE packets were admitted to BitFrost.
- **Graphify vs TRACE startup:** `graphify:daily:chain` ends in `scripts/atlas/graphify-daily-ace-packet-step-v1.mjs`, which only repeats the projection-admission gate, does a read-only eligible-packet count and writes a local receipt (`PACKET_COMPOSITION_NOT_WIRED`); the root wrapper fails closed while admission is `NOT_SAFE_TO_PROJECT`. Success of either startup is not an ACE promotion receipt.
- **ACE incremental startup is manual:** `scripts/startup/ace-incremental-startup.mjs` + `config/startup-ace-policy.json` can index, spawn services and prune stale PostgreSQL rows; `startup:ace:detached` is an explicit operator task, not folder-open.
- **Hit-demand** (`ace:hit-demand[:dry]` → `scripts/seed-hit-demand.mjs`, consumed by `context-for-file.ts::loadHitDemand()`) atomically replaces Redis `ace:rank:demand` (1 h TTL) from `chunk_hit_log`: a coarse path-keyed hint, not token/semantic warming, BitFrost admission or an embedding trigger.
- **Existing owners (do not duplicate):** `packages/parent-atlas` `buildAcePacketV3`; SvelteKit `AcePacketWriter.writeRevisionQualifiedV3ToBitfrost`; HyperRAG Packet RPC (`retrieval/hyperrag-packet-rpc.ts`, `api/hyperrag/packet-rpc`); live OpenAI facade calls `assembleACEContext()`/`buildACEPromptCached()`. Retrieval RPC packets, request-time prompt context and persistent `AcePacketV3` cache objects are different things; the missing link is an admitted producer/caller that binds `ContextManifest` + packet/source/representation identity, derives `embedAllowedPacketKeys`, writes BitFrost and verifies readback.
- **LangGraph/TRACE boundary:** TRACE MCP owns typed tool transport/execution; the LangGraph bridge only admits executed results into bounded state. Current `src/mcp/langgraph-bridge.ts` is legacy Headroom (character budgets, arbitrary JSON truncation, discards low-confidence state, runtime `ensureSchema()` table). V2 policy: UTF-8 byte budgets, pinned identity/DAG/evidence refs/ContextManifest checksums, prune only optional refs, receipt/artifact refs for large outputs, fail closed.
- **Wire format:** ACE packet JSON is a bounded descriptor — no 768-float vectors or bulk arrays inline; preserve `packet_key` and source/revision identity; UUIDs, packet keys, ordinals, Qdrant IDs and checksums are not interchangeable; large numerics use qualified references plus Arrow IPC or mmap/tensor artifacts.
- **Admission closed:** `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-28.json` = `NOT_SAFE_TO_PROJECT` (only the ontology-cohort predicate passes); `gan-readonly-live-proof-v1-20260928T022800Z.json`: 61,718 packet rows read, 5 structural `source_ref` failures, 1,520/1,520 qualified chunks, semantic projection `NOT_EXERCISED`. No promotion follows from a receipt's existence.
- **Separate cache path:** the admitted Karpathy path wrote `gpu:karpathy:scores` (190 fields first run); this is not `BITFROST-LIVE-WARM-01` proof (blocked pending admitted packet identity and a bounded write/readback/expiry canary). Last BitFrost census 2026-09-27 — not a live measurement.
- **MCP:** TRACE MCP tools and the HyperRAG HTTP Packet RPC are separate surfaces; process presence is not a live handshake. TRACE tool counts are runtime- vs static-derived (2026-09-08 reconciliation: static 120, runtime 176, 0 unexplained — `npm run trace:mcp:census-reconcile`, `TRACE-MCP-AUDIT-COMPLETE.md`); never cite one count as "the" count. Active config wires `trace` plus local `atlas-tools`.
- **Remaining order:** `ACE-GATE-RECONCILE-01` → `ACE-STARTUP-BOUNDARY-01` → `ACE-PRODUCER-TRACE-01` → `ACE-BITFROST-CALLER-01` → `ACE-BITFROST-CANARY-01` (explicit operator authorization) → sealed `LearningOutcomeV1` into OaK/DSPy-GEPA in shadow mode only → optional breadth plane (HLL telemetry, `CentroidArtifactV1`, simdjson/Arrow/mmap, bounded RLM/OaK DAG; cuTile stays a challenger behind cuBLASLt/LibTorch/cuVS) → LangGraph Headroom V2 (see tasks.md `HEADROOM-V2-01`).

---

## 🔄 Ollama Phase-Out + Chat/Synthesis Model Switch (2026-09-03 — IN PROGRESS, not complete)

Two related, active changes — neither finished, both stated operator direction rather than
completed migrations. Read before trusting any Ollama-, Gemma4-, or `:8090`-related statement
elsewhere in this file (many predate both changes and are now stale on specifics, though still
correct on architecture/roles unless noted otherwise).

**1. Chat/synthesis model switch — Gemma4 → Ornith 1.5 9B, confirmed live.** llama-server on
`:8090` currently serves `ornith-1.5-9b` (`models/ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf`), not
Gemma4 — verified directly via `GET :8090/props`: `"model_alias":"ornith-1.5-9b"`,
`"modalities":{"vision":false,"audio":false}` (text/tool-calling only; no vision projector is
loaded — a separate `mmproj-Ornith-1.5-9B-*.gguf` would be required for that, and none exists in
the model directory as of this check). The "❄️ CANONICAL LLAMA-SERVER STARTUP CONTRACT" section
immediately below this one is FROZEN from Aug 4 and documents the old Gemma4/hforf setup — treat
its *process* (chat-template wiring, `--skip-chat-parsing` ban) as still valid, but its specific
model identity (`gemma4-legal-iq4xs-direct.gguf`) as historical, not current. Fixed this session:
`sveltekit-frontend/src/lib/ai/model-ids.ts`'s `SERVER_CHAT_MODEL`/`TURBOQUANT_MODEL` constants
(were hardcoded to `gemma4-rotorquant:latest`, sent literally as the `model` field in live chat
requests — a real bug, not just stale docs) and `scripts/validate-graphify-startup.mjs` (hardcoded
model-name gate was rejecting Ornith as "wrong model"). **`SERVER_VLM_MODEL` was deliberately NOT
changed** — the separate VLM server on `:8085` (FastAPI + HF Transformers) is untouched by this
switch and still reports `"vlm_model":"gemma4:e4b"` live; do not conflate the two lanes.
`scripts/launch-turboquant.ps1` already has a first-class `ornith-1.5` profile (not stale), but its
doc comment still calls `gemma4-direct` the default profile — minor, not fixed yet.

**2. Ollama removal — direction only, replacement backend undecided.** Ollama is intended to be
removed from this stack entirely, including the embeddings lane (currently the *only* thing the
"Ollama vs llama-server Boundary" hard rule elsewhere in this file permits it to do — see that
section, and the mirrored note in `sveltekit-frontend/CLAUDE.md`, for the full rule). **No
replacement has been chosen.** Two live/in-progress candidates, neither confirmed final:
- Go Embedding service (`:8097`) — already running, health-checked 768-dim/GPU this session.
- Local llama.cpp GGUF embedding executor ("EG-GGUF") — early-stage proof (gates 0-2 only),
  not yet parity-checked against Ollama's actual output.

**Until this section says the migration is complete: do not delete Ollama, do not stop its
service, do not remove `embeddinggemma:latest` calls, and do not treat any other Ollama-embeddings
reference in this file as dead.** Every "PRIMARY EMBEDDING MODEL: `embeddinggemma:latest` (via
Ollama `/api/embed`)" style statement elsewhere in this document remains the current, correct,
load-bearing state — this note documents an intent, not a completed cutover. When a replacement is
picked, update this section with which backend won, the parity proof that justified it, and the
migration status of every embeddings call site — the same evidentiary bar this file already
requires (see e.g. the Embedding Dimensions Policy section's own history of undocumented
re-decisions and what it cost to unwind them).

## 🧭 Client Model Direction: Gemma3-270m → Gemma4-Assistant Family (2026-09-06 — DIRECTION ONLY) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-status-and-governance-2026-10-03.md`; trail `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md` (`ONNX-EXPORT-01`, `GEMMA-RANK-FASTAPI-01`, `AGMR-*`, `MICRO-*`).
- **`gemma3_270m_onnx` is still the live client model** (`CLIENT_LLM_*` in `src/lib/ai/model-ids.ts`, `src/lib/ai/onnx/{inference,session}.ts`); nothing replaced.
- **ONNX export of the Gemma4 assistant checkpoint is NOT usable:** `python/atlas_gemma_rank_onnx_export_feasibility_v1.py` exports and passes `onnx.checker`, but PyTorch-vs-ONNX output differs by 4.386 (tolerance 1e-3; not a `dynamic_axes` issue; Gemma4 `layer_scalar`/sliding-window attention is the suspect), and the artifact is 310 MB (external-data `.onnx.data`). Not wired to `client-router.ts`; no browser/WebGPU proof. Server-side alternative: `GEMMA-RANK-FASTAPI-01` (PyTorch over FastAPI; rank head still untrained).
- **`AtlasGemmaRankV1`** = from-scratch reranker from Google's tiny Gemma4-E4B assistant checkpoint (4 layers, hidden 256) with independent K/V projections and a scalar `RankHead`. AGMR-01..06 and MICRO-02/03/04 (+train smoke, loss 5.49→0.0 on 10 toy pairs) done on CPU; MICRO-05-CUDA ran real CUDA forwards on the RTX 3060 Ti but BF16/FP16 vs FP32 parity is unresolved (BF16 max delta 3.8; FP16 ~1.96 and reorders candidates) — FP32 is the only trusted reference; the MoE/REAP pruning gate (MICRO-05) is untouched.
- **Do not** claim the client model is replaced, `AtlasGemmaRankV1` is production-ready or GPU-parity-proven, or that MTP/speculative-decoding work is the same effort. When this moves, update with real evidence.

---

## ❄️ CANONICAL LLAMA-SERVER STARTUP CONTRACT (FROZEN — Session 188C, Aug 4 2026)

**Status**: ✅ VALIDATED | **Validation**: 3-point contract PASS | **Commit**: TBD

### Root Cause Found & Fixed
`--skip-chat-parsing` flag forced llama-server to bypass template validation, leaking reasoning/tool-call syntax (`<|think|>`, `<thinking>`, `<|channel>`) into ordinary content, breaking Cline/OpenCode tool parsing and causing 1,506 identical retry attempts. **Solution: Deleted conditional block from launcher.**

### Canonical llama-server Direct Profile (FROZEN)
```
model: hforf.gguf
alias: gemma4-legal-iq4xs-direct.gguf
chat-template-file: configs/templates/custom_pub_chat_template_gemma4.jinja
jinja: on
reasoning: off
reasoning-format: deepseek
reasoning-budget: 0
cache-prompt: on
cache-reuse: 256
cache-type-k: q8_0
cache-type-v: q8_0
❌ MUST NOT HAVE: --skip-chat-parsing (DELETED from launcher)
```

### 3-Point Validation Contract (PROVED Aug 4)
1. **Clean streaming** ✅ — No control tokens in content (test 1 PASS)
2. **Tool calls parsed** ✅ — Real `tool_calls` array, not textual (test 2 PASS)  
3. **Model identity correct** ✅ — hforf.gguf (alias: gemma4-legal-iq4xs-direct.gguf), context=65536 (live /slots)

### Launcher Change (FROZEN)
- **File**: `scripts/launch-turboquant.ps1`
- **Change**: Lines 1057-1065 deleted (skip-chat-parsing conditional block)
- **Replacement**: Chat parsing **ALWAYS ENABLED** (cannot be bypassed)
- **Result**: No more raw template leaks into Cline/OpenCode tool parsing

### Recovery if Issues Recur
1. `taskkill /F /IM llama-server.exe`
2. Verify: `rg "skip.chat.parsing"` (should return 0 hits)
3. Start: `npm run turbo:start`
4. Validate: See `docs/STARTUP-CONTRACT-LLAMA-RECOVERY.md` (3-point contract tests)

---

## Archival Rules (NOT DELETION — July 23, 2026)

**We do NOT delete. We archive.**

Files that need removal from the active repo are moved to cold storage with:
- **Manifest entry**: `manifest.json` in archive directory listing SHA-256, path, date archived, reason
- **SHA-256 hash**: Computed at archival time, verified on recovery
- **Recovery path**: Full retrieval instructions documented in memory
- **Lifecycle**: Archived files can be recovered; deleted files cannot

**Archive locations**:
- `deeds_labs/archive/` — primary cold storage (gitignored)
- `.archive/` — secondary if deeds_labs unavailable (gitignored)
- `docs/archive-manifest.json` — manifest index (NOT gitignored, readable for recovery)

**Example**:
```bash
# Archive a file (do NOT delete)
mkdir -p deeds_labs/archive/2026-07-23
cp src/old-module.ts deeds_labs/archive/2026-07-23/old-module.ts.bak
echo '{"path":"src/old-module.ts","sha256":"abc123...","archived":"2026-07-23T20:35:00Z","reason":"superseded by new-module.ts"}' >> docs/archive-manifest.json

# Recovery (if needed)
cp deeds_labs/archive/2026-07-23/old-module.ts.bak src/old-module.ts
```

---

## 🧠 Embedding Dimensions Policy — condensed (full text archived 2026-10-03)

Verbatim original (forensic trace of the 5 policy flips, live Qdrant census, latent-lane detail): `docs/archive/claude-md-embedding-dimensions-policy-2026-10-03.md`; history in `openspec/changes/codereview-semantic-dimension-regression-aug22/tasks.md` §1. **Do not re-decide this policy without reading that trace** — five uncoordinated flips happened in under a month.

- **Canonical:** `semantic_768` = native EmbeddingGemma 768-dim (`embeddinggemma:latest`) is the primary persisted semantic representation (operator-confirmed 2026-08-23). Postgres `codebase_chunk_index` is truth; Qdrant/Redis/Neo4j are mirrors. Never use different models for the same dimension.
- **Columns (both exist — recipes differ, see recipe census):** `content_embedding` (halfvec 768, ~55k rows, canonical per this policy) and `content_embedding_768` (vector 768, ~219k rows; named the current owner in the 2026-09-27 note). Census 2026-10-03: `content_embedding` is ~55–63% `title: {relative_path} | text:` with 24–37% UNKNOWN; `content_embedding_768` is raw. A physical column existing does not prove source/model/recipe lineage.
- **Derived lanes only after a validated 768 source:** MRL-prefix + L2-renorm 512/256/128 are optional secondary lanes (Qdrant `codebase_chunks_512` exists, derived; `_256`/`_128` do not exist — don't build them speculatively). Never primary retrieval authority; never computed ahead of or in place of an incomplete 768 index; a cache/collection miss must not block retrieval.
- **384 is retired:** column dropped 2026-08-30 after zero-loss verification (CSV archived under `deeds_labs/archive/2026-08-30/`); do not reintroduce a 384d lane or cite `gpu:warden:cache:384d:*`.
- **Autoencoder latents are a separate, learned mechanism (not MRL):** `latent_256` real (55,169 rows PG + Qdrant `codebase_chunks_latent256`); `latent_128` derived by `SLICE_FIRST_N`+renorm of latent_256 (55,169 rows, PG only, registry promotion skipped); `latent_64` 1,703 rows PG only (autoencoder weights recorded untrained). Routing prefilters, never retrieval truth.
- **Qdrant 768 collections coexist:** `codebase_chunks_768` (older multi-vector content/error/signature + sparse; `ACTIVE_SEMANTIC_PROJECTION`; 328,348 points at 2026-09-27) and `codebase_chunks_768_v2` (EMB3A challenger, 52,816 points, `NOT_PROMOTED`; 43 files reference it). Do not merge, delete or cut over either without the EMB3A owner; `codebase_chunks_384*` are near-empty leftovers. Re-check live (`GET /collections/<name>`) before citing any count.
- **`embedding_dimension` metadata column is unreliable** (was mistagged 384 on 52,402 real 768-dim rows; backfilled 2026-08-30). Never gate an audit/backfill on it — verify with `vector_dims(col::vector)` or the column type.
- **Hard rules:** (1) 768 from embeddinggemma is the primary source for Qdrant and Postgres; (2) any 512/256/128 projection comes from an indexed, validated 768 source; (3) projection lanes are optional and never block retrieval; (4) no truncated lane is the primary retrieval authority; (5) no 384 lane; (6) don't silently re-decide.
- **Retrieval decision tree:** embed (recipe-stamped) → Qdrant ANN `codebase_chunks_768` (top-20) → Postgres join (`source_ref`, summary, …) → optional Neo4j expansion → rerank (GPU cosine) → optional 512d MRL routing cache (miss ⇒ use 768 score) → top-10 to the ACE context assembler. Never answer from Qdrant payloads alone.
- New scripts follow `REDIS_CONNECTION_FIXES.md` (host/port/password options, not URL strings).


---

## 🔌 Qdrant Backfill + API Strategy + Script Safety — condensed (full text archived 2026-10-03)

Verbatim original (Phase 108D status tables, Qdrant API Strategy with code samples, Cross-Directory Script Safety, `workspace_id` convention): `docs/archive/claude-md-ops-incidents-2026-10-03.md`.
- **Never serialize bulk vectors through a shell** (`execSync` + `docker exec` + `curl`, temp files + `curl @file`, base64): 768-d JSON ≈ 3 KB/vector, 1000 vectors ≈ 3 MB → `spawnSync ENOBUFS` (Windows cmd buffer ~8 KB). Use in-process `fetch` to the Qdrant REST API (`PUT /collections/{name}/points`, not `/upsert`; one JSON serialization per batch), NDJSON streaming (`Content-Type: application/x-ndjson`, simdjson addon for parsing), or gRPC (`@grpc/grpc-js`, not a current dependency) for the fastest path. Python sidecar with `qdrant-client` for recurring backfills.
- **Phase 108D scripts:** `scripts/atlas/phase108d-embeddings-backfill-ndjson.mts` (recommended, ~60–80 s for 52,380 vectors, `--dry-run`), `…-grpc.mts` (analysis only), `…-native.mts` (legacy, <1000 vectors). Findings: named-vector response field is `vector.content`; allow a 1 s wait between upsert and retrieval; batch Postgres reads (50 rows) to avoid ENOBUFS; `qdrant_point_id` regex must allow slashes and dots. 108D-1 (10 rows) and 108D-2 (1000 rows, idempotent) PASSED; the full run was blocked on Docker at the time — re-verify before running (and see the Qdrant warning in the identity alignment section: duplicate mappings exist).
- **Cross-directory scripts:** all config paths must be absolute or project-root-relative (a relative `data/atlas-ml/atlas-analytics.duckdb` created a 327 MB duplicate DuckDB under `sveltekit-frontend/data/`). Resolve the root via `PROJECT_ROOT` or by walking up from `import.meta.url`, and validate `package.json` exists in cwd. Fixed: `packages/atlas-duckdb/src/config.ts`, `scripts/atlas/duckdb/build-full-snapshot.mts`; still needing the fix: `build-domain-snapshot.mts`, `freeze-vector-snapshot-5k.mts`, `build-vector-index-lanes.mts`, and any script reached from `sveltekit-frontend/package.json` using relative paths.
- **`workspace_id` Qdrant payload field** (required; scopes snapshot/backfill enrichment): Phase 12 uses `ATLAS_WORKSPACE_ID` or `snapshot-phase12-<YYYY-MM-DD>`; Phases 15+ inherit from `atlas_packets.workspace_id` (column does not exist yet). Never leave it empty, random, or mixed within a collection without intent.

---

## 🧮 Wire Format Layering Rule (CANONICAL — recorded 2026-08-23)

**JSON/MessagePack describe things. Bitmaps select things. Ordinals address things. mmap/Arrow
stores large things. Pinned memory stages things. CUDA tensors compute things.** Don't let
serialization, caching, retrieval, and canonical identity collapse into one coupled system.

**Hard rule**: Bulk numeric arrays (`semantic_768` rows, feature matrices, any vector/matrix
payload) SHALL NOT be serialized through JSON or MessagePack. Use Arrow IPC, raw FP32 `mmap`, or
PyTorch/CUDA tensors instead — unpacking thousands of scalar JSON/MessagePack values back into a
numeric array defeats the point of a compact binary array format, and this repo already hit
exactly this failure mode once for Qdrant vectors (see the Qdrant API Strategy section directly
below — `ENOBUFS` from JSON-serializing 768-dim float arrays through a shell).

**JSON stays the default for logical/descriptor packets** (ordinals, revisions, routing flags,
policy hints — e.g. an `AcePacket`-shaped envelope) while the schema is still evolving. MessagePack
is a valid *later* codec swap for the same logical schema once it stabilizes — introducing it
should never mean inventing a second schema, only an alternate encoding of the existing one, and
it still must not carry numeric matrix data.

**A packet descriptor referencing a large vector/matrix carries a reference** (mmap offset, Qdrant
point id, ordinal into a `CandidateFeatureMatrix`), never the raw float values inline.

Full design context, live-codebase audit of what of this already exists (`ContextManifest`,
`CandidateOrdinal*`, packet bitmaps, LOD manifest — several are already substantially built under
different axes than a later proposal assumed), and the undecided architectural questions this
raised are recorded in
`openspec/changes/parent-atlas-memory-architecture-freeze/proposal.md`. That document also records
a companion rule already consistent with this file's existing AST/ast-grep guidance: a
model/regex/NLP classifier proposes structural facts (is this a function, is this the caller) but
never decides them — ast-grep/Tree-sitter/Graphify evidence is the decision-maker.

---

## Historical July 2026 status — archived (pointers only)

Dated July 2026 status (OpenCode bash-permission fix, MCP/LSP status, `.mcp.json` history, Phase 7 summary-queue snapshot, "three weak areas") moved verbatim to `docs/archive/claude-md-stale-status-and-bitfrost-audit-2026-10-03.md`. Do not use it as current health evidence. Still-true facts:
- `.opencode/opencode.jsonc` is the single OpenCode config (bash: explicit denylist for `rm`/`del`/`rmdir`/`Remove-Item`, `"*": "allow"`); ignore the global `~/.config/opencode/opencode.jsonc`. MCP servers: `trace` (remote `:8788/mcp`), `atlas-tools`, `engram-embed`, `gemma4-offload`, `ldr-research`, `playwright`; `turbovec` is called from code, not MCP. LSP: typescript, svelte, json, css via local `node_modules`.
- `/api/retrieval/unified` 307-redirects to `/api/retrieval/search-unified` (call it directly); `provenance.retrievalSources` shows which lanes contributed. Historical 6-signal blend: `0.30 qdrant + 0.20 turbovec + 0.20 rg_lexical + 0.15 ast + 0.10 postgres + 0.05 freshness` (verify in `retrieval/unified-orchestrator.ts` before citing).
- Graphify startup gate: `npm run graphify:validate` (embedding, llama-server `:8090`, Go retrieval `:8100`, TurboVec `:8791` critical; Qdrant/Postgres/Valkey optional).

## ⚡ Graphify Startup Daily Validation Gates (July 1, 2026) — condensed (full text archived 2026-10-03)

Verbatim original (7 curl/psql probe commands and expected values, status snapshot): `docs/archive/claude-md-ops-incidents-2026-10-03.md`. Run `npm run graphify:validate` (`scripts/validate-graphify-startup.mjs`) before `graphify:daily` (which calls it first; `graphify:daily:skip-validation` bypasses).
- **Critical (exit 1 if down):** embedding (Ollama `:11434`, `embeddinggemma:latest`, 768-d), llama-server `:8090`, Go retrieval `:8100` (`embeddingServiceUp`, `pgvectorConnected`, `qdrantConnected`), TurboVec `:8791`. **Optional (warn):** Qdrant `:6333`, Postgres (`:5434` from Windows, 5432 inside Docker), Valkey `:6379` (`docker exec legal-ai-valkey valkey-cli PING`).
- **Rules:** llama-server `:8090` is the synthesis owner (never Ollama for synthesis; never call the chat model for embeddings); all vectors 768-d; Postgres first, Redis invalidation after; run graphify and DuckDB/RabbitMQ export scripts from the repo root. Counts/dates in the old snapshot (58,304 packets, 34 collections) are stale — re-query.

---

## ⚡ CURRENT MILESTONE: Parent Atlas Library Consolidation

**Status**: P1 implementation complete. Now refactoring from loose `scripts/atlas/` into reusable monorepo plugin.

**Pivot**: Parent Atlas becomes a **library**, not an app feature.

**Current package map**

```
deeds-web-app/
  packages/
    atlas-core/              (canonical contracts, validation, RPC, GPU types)
    parent-atlas/            (CLI, audits, adapters, cache/mapreduce orchestration)
    parent-atlas-core/       (identity/schemas/adapters bridge)
    parent-atlas-ingest/     (repo scanning, AST, packet generation)
    parent-atlas-retrieval/  (Bifrost, TurboVec, GPU/SIMD bridges)
    parent-atlas-opencode/   (OpenCode integration)
  sveltekit-frontend/        (consumes the packages)
```

**Boundary rule**: `packages/atlas-core` is the canonical contract layer. `packages/parent-atlas`
is the operational CLI / adapter boundary. The specialized `parent-atlas-*` packages are
the package surfaces for ingest, retrieval, and OpenCode integration.

**Boundary verifier**: `npm run verify:spec-supersedes` reads
`docs/atlas/package-boundary-registry.json` and keeps active docs free of stale package-boundary
drift. Historical references remain reference-only.

**See**: `docs/P1-PACKAGE-CONSOLIDATION-IN-PROGRESS.md` for phase tracking.

### Hard Rule: Audit `packages/*` Before Moving Anything From `scripts/atlas/` (Aug 30, 2026)

`scripts/atlas/` (main repo, loose `.mjs`/`.mts` scripts) is mid-migration into
`packages/atlas-core` / `packages/parent-atlas` / the `parent-atlas-*` package
family above. **Before moving, copying, or reimplementing any file out of
`scripts/atlas/` into a `packages/atlas-*` package, grep `packages/parent-atlas/src/core/`
and `packages/atlas-core/src/` for an existing contract covering the same
capability.** Do not assume the package side is empty just because the
migration isn't finished — it already contains real, tested, canonical
contracts for things you might expect to still be script-only.

**Why this is a hard rule, not a suggestion**: during the 2026-08-30 adaptive-
DAG-fabric pass, a search scoped to `sveltekit-frontend/src` alone concluded
an ast-grep evidence-envelope contract ("DAG-STRUCT-01") didn't exist yet.
It already did — `packages/parent-atlas/src/core/ast-grep-observation-adapter.ts`
(`AstGrepObservationV1`, wired into production via `graphify-structural-
intelligence-adapter.ts`). The mistake wasn't inventing a duplicate (caught
before writing code), but the search scope itself: `packages/` was checked
last, not first, even though this file has said since the consolidation
milestone above that canonical contracts live there. See
`openspec/changes/parent-atlas-adaptive-dag-fabric/tasks.md` (2026-08-30
entries) for the full trace of what else this same mis-scoped search nearly
duplicated.

**Rule**: `packages/parent-atlas/src/core/` and `packages/atlas-core/src/`
are checked **first**, before `sveltekit-frontend/src` and before
`scripts/atlas/`, for any capability that sounds like it should be a
canonical contract (an evidence envelope, an identity type, a validation
schema, a checksum/revision-bound artifact). Only after that comes up empty
does new work belong in `scripts/atlas/` (script-side, still mid-migration)
or `sveltekit-frontend/src` (app-side consumer/bridge, per the Duplication
Prevention section above).

---

## 🚫 Duplication Prevention — Audit Before You Build (HARD RULE, condensed)

Verbatim original (the four 2026-08-09 incidents: 5 competing PageRank owners, 4 nonexistent relationship types, 14 reranker files, an un-registered NLP sidecar): `docs/archive/claude-md-duplication-prevention-2026-10-03.md`. Before implementing any new owner of a capability (ranking, retrieval lane, identity join, job, cache key pattern, anything that smells like "the codebase probably already does this"):
1. **Grep first** across `src/`, `scripts/`, `python/`, `packages/` — read matches and check **callers** (`grep -rl "fn("`), not just file existence. **Check `packages/parent-atlas/src/core/` and `packages/atlas-core/src/` first** for canonical contracts. A literal-name search is not proof of absence (the "Ewin Tang" machinery exists under different names); use multi-line patterns for SQL.
2. **A file existing is not evidence it is live** — check callers and whether the data it writes is fresh.
3. **A config value existing is not evidence it is correct** — verify each referenced entity (relationship types, tables, endpoints) exists in the live system.
4. **Layered ownership, not competing owners** — name each tool's layer (parser engine vs chunking vs structural query vs canonical contract); contracts stay stable, producers beneath them can be swapped.
5. **Agent-facing capabilities register in `ACPToolRegistry.ts`** (`GET /api/acp/tools`), not as side-channel HTTP.
6. **Record what you find even when you don't fix it** (relevant `openspec/changes/*/tasks.md`) — a flagged duplicate beats an unflagged one.
Tracking: `openspec/changes/parent-atlas-graph-analysis-contract/`, `parent-atlas-nlp-sidecar-feature-compiler/`. Hard rule on package migration: audit `packages/*` before moving anything out of `scripts/atlas/`.

### "Ewin Tang" low-rank sampling — real, EXPERIMENT, do not rebuild (Sep 15 2026)

A literal-name search returning zero hits is not proof a mechanism is absent. The machinery exists on `main`: `python/atlas_compute/low_rank.py`, `sveltekit-frontend/src/lib/server/atlas/sampling/sample-query-matrix-v1.ts` (+ spec), used by `recommendation-evidence-bundle-v1.ts` and `python/prove_atlas_compute.py --low-rank`. It is challenger evidence only (`canonicalIdentityAuthority:false`, `retrievalVoteAdded:false`). Do not build a second low-rank/length-squared-sampling module. An unmerged, breaking-rename evolution exists on `origin/agent/sample-query-matrix-ewintang-20260822`; porting it is an operator decision (`TANG-BRANCH-DECISION-01`). Full census: `docs/archive/claude-md-gpu-compute-history-2026-10-03.md`; open work: `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`.

### One Canonical Runtime Owner Per Capability (condensed)

Invariant: ONE capability → ONE canonical runtime owner → MANY backends/adapters/experiments → ZERO uncoordinated peer owners. Registry: `docs/architecture/runtime-ownership-registry.json`; baseline of tolerated debt: `docs/architecture/runtime-ownership-baseline.json`; check: `npm run atlas:audit:ownership` (`scripts/atlas/audit-runtime-ownership.mjs`). Verbatim original: `docs/archive/claude-md-duplication-prevention-2026-10-03.md`.
- **Labels (exactly one per implementation):** `CANONICAL_OWNER`, `BACKEND` (swappable behind the owner), `ADAPTER` (wraps an external tool to the contract; never a source of truth), `EXPERIMENT`, `COMPATIBILITY`, `FIXTURE_ONLY`, `DEAD` (zero callers → archive, not delete).
- **Before adding** a retrieval lane, reranker, graph algorithm, representation, sidecar, ACP/MCP tool, persistence writer, cache, feature producer or chunker: find existing implementations, identify callers/contract/persistence boundary, classify each, extend the `CANONICAL_OWNER`. If ownership cannot be established, stop and record the ambiguity in an OpenSpec change.
- **Prohibited without an explicit classification decision:** a second production RRF vote for one logical lane; a second canonical persistence writer; a second `representation_id` for the same semantic representation (same dimension ≠ same representation); a second graph-algorithm dispatcher; a second reranker external contract; a second ACP/MCP tool for one capability; a second AST identity authority; a new sidecar created only because a library has a convenient API.
- **Existing debt is a tolerated warning; a new peer owner introduced by a diff is a failure.** Inventory first, remediate later.

### GPU compute lanes — standing rules (consolidated 2026-10-03)

Measured results (GPU-MINI-FABRIC-01 phases A/B/B3/D, ACE-RADIX-01, CUTILE-ACE-01 L2/L3, BITFROST-L2-01, CUDA 13.x lanes, LibTorch census) and all open work live in `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md` (have-vs-need). Verbatim history: `docs/archive/claude-md-gpu-compute-history-2026-10-03.md`. Extend `parent-atlas-gpu-mini-fabric-01`, `parent-atlas-ace-radix-residency`, `parent-atlas-cuda134-tensorrt-rtx-lane`; never add a peer owner. Nothing here is production-promoted.

- **Environments (keep separate):** RAPIDS/cuVS/cuGraph = WSL2 `/home/james/miniforge3/envs/atlas-rapids-cu13` (26.06, CUDA 13.0-13.3 range). cuTile/SIMT = WSL2 `/home/james/.venvs/atlas-cutile-cu132`. Invoke by absolute Python path; a bare `python3 -c "import cuvs"` in a non-interactive WSL shell proves nothing. No second RAPIDS env, no 26.06→26.08 upgrade, no cuTile in Docker 8098 without a recorded reason.
- **Ampere 8 GiB (RTX 3060 Ti, sm_86):** do not load cuDF/cuGraph/cuVS, cuTile and a large decoder concurrently; bounded fixtures, FP32 accumulation, dims divisible by 8, release tensors between stages; cap RMM pools inside measured workers.
- **LEVEL ladder:** LEVEL 1 vendor primitive/CPU oracle → LEVEL 2 simple SIMT → LEVEL 3 cuTile. No level skipped; graph traversal is never a first custom-kernel target. Current ladder for glyph-score/residency-key-pack: L1 PROVEN, L2 DRY_RUN_PROVEN, L3 Python `cuda.tile` DRY_RUN_PROVEN (C++ `cuda_tile.h` PROVEN_BLOCKED, optional). ACE-RADIX-01: CUB half DRY_RUN_PROVEN, cuTile half ENVIRONMENT_BLOCKED on CUDA 13.0.
- **Ownership:** CUB radix is a backend under ACE/BitFrost residency, never a retrieval vote. cuBLASLt = dense scoring; cuGraph = PageRank/BFS (parity oracle is NetworkX); cuVS = ANN; SOM = experimental routing only. `PacketGlyphV1`, `ResidencySortKeyV1`, `SomCoordinateV1` are GPU-local and never carry/replace `packet_key`.
- **Naming:** "ACE" in cuVS HNSW docs (Augmented Core Extraction) is NOT Atlas ACE. Atlas names use `AtlasAceResidencyV1`; cuVS code uses `CuvsHnswAceBuild`.
- **ANN facts to respect:** CAGRA recall depends on `build_algo` and `itopk_size`, not VRAM pressure; default ivf_pq fails at N=65,536 on synthetic noise, real semantic_768 passes (.9905 default / .9995 itopk=512). Do not cite either as "CAGRA fails".
- **PageRank parity** requires identical graph semantics (directedness, vertex set, edge set) in both engines; check `GraphExecutionSemanticsV1` first.
- **VRAM go/no-go:** `cudaMemGetInfo` on Windows follows the WDDM Budget and overstated free VRAM ~20x here; size allocations from `nvidia-smi` outside the CUDA process.
- **BITFROST-L2-01:** L2 persistence showed no measurable net effect at this host's scale (7 runs, mean -0.76%); a null result, not proof the mechanism fails.
- **DEPENDENCY-CAPABILITY-GUARD-01:** no `pip`/`conda`/`docker`/`npm` install without a proven capability gap. Resolve against `docs/reports/runtime-capability-registry-v1.json` first; reuse the existing owner. Capability parity, not version symmetry, is the bar.
- **CUDA lanes:** nothing moves to CUDA 13.4 except the TensorRT-RTX 1.6 challenger (side-by-side, fresh runtime cache, 13.0 lane untouched). LibTorch migration target is CUDA Toolkit 13.2.2+ with `libtorch cu132` (13.2.0/13.2.1 carry the compiler bug); needs both installs. RAPIDS 26.08 supports only 13.0-13.3. Installers are license-gated: operator supplies the path.
- **LibTorch dependency:** all 19 native APIs in `tensorrt_bridge.node` have real production callers; none is dead. No parity/latency/VRAM proof exists, so no row is cleared for removal (`LIBTORCH-PARITY-01`). Native scripts must prefer `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node`.
- **Helpers (use, don't rebuild; detail in `.../parent-atlas-gpu-compute-lanes-consolidation/tasks.md` §6-§8):** the helper registry is `sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/helper-registry-v2.ts` (12 read-only helpers: rg-exact, postgres-fts/trigram, tree-sitter-chunk, ast-grep-structural TS/JS-only, ts-morph, LSP, docs-corpus, semantic-768, graph-ppr, langextract-grounding). Live FastAPI helpers answer `/health`: `:8095` NLP/OAK, `:8097` Go embedding, `:8098` GPU graph/tile (Docker; no KMeans route), `:8100` Go retrieval, `:8121` neural decoder, `:8791` TurboVec, `:8090` llama-server, `:8788` TRACE MCP (188 tools). Searches: use the Grep tool with multiline patterns for SQL (`UPDATE atlas_packets … som_*` found 5 SOM writers a name search missed); a name-only search is not proof of absence.
- **Gemma4 → Ornith naming is NOT a blanket rename (tasks.md §11):** rename/migrate only role A (chat/synthesis/tool runtime: resolve the model via `llama-server-model-resolver.ts`/`SERVER_CHAT_MODEL`, never another literal; ~70 non-spec files) and role E identifiers (one file at a time, with a re-export shim). KEEP real Gemma4 artifacts (VLM `:8085`, `gemma4_e2b_onnx`, `AtlasGemmaRank`, unsloth training, `gemma4-offload` alias) and never rename history (reports, sessions, vault). Env `GEMMA4_*` (147 files): alias neutral-first, don't remove.
- **Tool controller is Ornith 1.5:** `sveltekit-frontend/src/lib/server/ai/gemma4-tool-controller.ts` (file name kept for imports) exports `runOrnithToolLoop`; `runGemma4ToolLoop` is a deprecated alias. It is model-agnostic (`callModel` injected; resolve the served model via `llama-server-model-resolver.ts`, never hardcode). `context_timeline.pipeline` label is now `ornith-agent` (older rows say `gemma4-agent`; no code reader filters on either). Production uses `dispatchToolCall` (`api/agent/execute`, `dev-context-planner.ts`); the loop itself has no production caller.
- **Neural decoder `:8121` `status:"degraded"` = model not yet loaded** (lazy load on first encode/decode, verified 2026-10-03: after one synthetic encode → `ok`, `cuda`, mounted checkpoint loaded). Not a fault.
- **KMeans executor is cuVS** (`python/atlas_compute/cluster_softmax.py::run_cuvs_soft_kmeans`, WSL `atlas-rapids-cu13`), not PyTorch; the PyTorch-less FastAPI helpers (`:8095`, `:8098`) need no torch for it. `atlas_rapids_sidecar_graph.py` defaults to port 8098, which the Docker `atlas-gpu-8098` service already holds — use `ATLAS_RAPIDS_SIDECAR_PORT` for another port if started.
- **"Vibreti" = Viterbi (HMM MCP-tool-path decoder), `CHALLENGER_ONLY`:** `analysis/k-best-viterbi.ts` + `retrieval/{hmm-tool-selector,mcp-tool-viterbi-bridge-v1}.ts` (proposal-only, `canonicalAuthority:false`); `DEFER-VIBRETI-01`; reintegration preconditions incomplete (0/9 eligible). Query→tool selection in production is `scripts/atlas/runtime-mcp-tool-selector.mjs` (Qdrant `tool_manifest`, currently empty → registry fallback). Gaps/tasks: `tasks.md` §9. Search both spellings.
- **Embedding prefixes:** `/api/embed` → `embedText()` applies no EmbeddingGemma task prefix; only `embedding-contract-768.ts` formats them. Query and corpus recipes must match. **Recipe census (EMB-RECIPE-03, 2026-10-03, n=100/stratum, `docs/reports/embedding-recipe-census-v1.json`):** `content_embedding` = `title: {relative_path} | text: {content.trim()}` for 94–99% of rows (the writer `scripts/atlas/reembed-corpus-document-prefix-v1.mjs` trims content; `title: none` is NOT the recipe; raw 6–21% on older rows; the earlier 24–37% UNKNOWN was untrimmed-comparison error); `content_embedding_768` = raw for the 219,259 rows where it is the only column, but the 739 both-column rows match no tested recipe (best cosine ~0.92, not content drift) and stay UNKNOWN. A canonical recipe may now be chosen; the prefix-aware adapter is EMBED-CALLER-CONVERGENCE-01.
- **DB readiness contract:** `sveltekit-frontend/src/lib/server/db/readiness.ts` (`starting | healthy | unavailable`; SQLSTATE 57P03 / `pg_isready` exit 1 = STARTING; `shouldCreateRepairTask` is false for STARTING). `/api/health/database` uses it; `/api/health/ready`, Playwright global-setup, `start-all.ps1` and the repair-task creator are still to wire (tasks.md DB-READY-WIRE-02).

---

## 🔐 Atlas Data Persistence + Retrieval Contract (HARD RULES) — condensed (full text archived 2026-10-03)

Verbatim original (volume-inspect and backup command blocks, 2026-era row counts, recovery checklist): `docs/archive/claude-md-status-and-governance-2026-10-03.md`. Core: Postgres pgvector = canonical truth (not rebuildable except by restore); Qdrant = ANN mirror, Redis/Bifrost = hot cache, Neo4j = topology mirror (all rebuildable from Postgres).
- **Docker is disposable; volumes are the only durable layer.** Before any destructive command run `docker inspect legal-ai-{postgres,qdrant,neo4j,valkey} | jq '.[0].Mounts'`. Never `docker compose down -v`, `docker volume prune` or `docker system prune --volumes` without explicit operator approval plus backups.
- **Order:** write Postgres first; invalidate Redis only after Postgres succeeds; rebuild Qdrant (idempotent upsert, `npm run atlas:qdrant:768:restore:apply`) and Neo4j (deterministic Cypher) from Postgres; never make a mirror the source of truth; never answer from Qdrant payloads alone — join back to Postgres before synthesis.
- **Schema split:** `atlas_packets` = identity/metadata (join on `packet_key` + `source_ref`; its `embedding` column is legacy, not the embedding source); `codebase_chunk_index` = canonical chunks with embeddings (the embedding truth source) mirrored to Qdrant `codebase_chunks_768`. The count gap between packets, chunks and Qdrant points is expected — do not force all packets into Qdrant. Re-query live counts (the 2026 numbers once listed here are stale: see the Embedding Dimensions Policy and the status note).
- **Dimension policy:** `PROJECT_CANONICAL_EMBED_DIM = 768`, `embeddinggemma:latest`, hard stop if an index is not 768; full policy lives in the Embedding Dimensions Policy section. Verify with `npm run atlas:audit:embeddings --verbose`.
- **Query flow:** same as the Retrieval decision tree in the Embedding Dimensions Policy; an exact-match Redis L1 lookup on the literal query can short-circuit before embedding.
- **Backups:** `pg_dump -Fc` via `docker exec legal-ai-postgres`, Qdrant `POST /collections/<name>/snapshots`, `valkey-cli SAVE`, `neo4j-admin database dump`.
- **Status language (enforced):** `CREATED` (exists, syntax valid) / `WIRED` (ready for dry-run) / `DRY_RUN_PROVEN` / `APPLY_PROVEN` (verification gate passes) / `NOT_PROVEN`. Never claim "production-ready" from dry-run evidence.
- **Multi-step proof runs:** record a failing step as an explicit null with a failure reason and continue; a null step never counts toward PROVEN/READY/eligibility; never default or coerce a missing identity/revision (`packet_key`, `sourceRevision`, `workspaceRevision`) — classify and block; fix harness defects rather than relaxing the gate. Reference: `scripts/atlas/audit-graphify-authority-reader-shadow-census-v1.mts`.

---

## 🔧 NPX Execution Context & Module Alias Resolution

**Updated: June 26, 2026 (Session 82 Phase 2 Real Client Wiring)**

When wiring real Postgres/Redis/NATS clients into TypeScript modules that use `$lib` module aliases, **execution context matters**:

### Context A: Workspace Root (Fails module resolution)
```bash
cd "c:\Users\james\Videos\deeds-web-app"
npx tsx scripts/atlas/test-gan-audit-integration.mts
```
**Result**: ❌ `Cannot find package '$lib'` — module aliases not active
**Reason**: `tsx` doesn't inherit SvelteKit's `vite.config.ts` module alias setup
**Output**: Tests pass (via graceful fallback) but no real Postgres connection

### Context B: SvelteKit Frontend Directory (Module aliases resolve)
```bash
cd "c:\Users\james\Videos\deeds-web-app\sveltekit-frontend"
npx tsx ../scripts/atlas/test-gan-audit-integration.mts
```
**Result**: ✅ Module aliases resolve, Postgres query visible in error trace
**Output**: `params: 10, SELECT packet_key, ... LIMIT $1` (query executes)
**Fallback**: Still handles DB connection failure gracefully (non-blocking)

### When to Use Each Context

| Task | Context | Why |
|------|---------|-----|
| **Unit test** (no DB) | Workspace root | Fast, no Postgres needed |
| **Mock Postgres read** (test framework only) | Workspace root | Tests pass, module aliases don't matter |
| **Real Postgres integration** | `sveltekit-frontend/` | Module aliases active, query executes |
| **Production deployment** | SvelteKit app load hooks | Full SSR context, all aliases bound |

### Module Alias Resolution Rules

1. **`$lib` requires SvelteKit context** — vite.config.ts defines it as `src/lib` (relative to `sveltekit-frontend/`)
2. **`tsx` from workspace root**: Aliases not inherited → dynamic imports fail → empty array returned (expected)
3. **`tsx` from `sveltekit-frontend/`**: Node resolves `tsconfig.json` paths → aliases bound → imports succeed
4. **Drizzle ORM in production**: App's server-side routes load via SvelteKit hooks (full context) → no issues

### Testing Pattern

```typescript
// In packages/atlas-core/src/validation/gan-audit-integration.ts
async readPacketsFromPostgres(limit: number): Promise<any[]> {
  try {
    // This import works in SvelteKit context; fails standalone
    const { db } = await import('$lib/server/db/client.js');
    // ... real query executes
  } catch (err) {
    // Expected in workspace-root context; graceful fallback
    return [];
  }
}
```

### When Implementing Real Clients in Packages

For modules in `packages/atlas-core/src/` that need to read real Postgres/Redis:
1. **If the module is called from SvelteKit routes**: Use `$lib` imports freely (context guaranteed)
2. **If the module is called from standalone scripts**: Wrap imports in try/catch + provide graceful fallback
3. **For tests**: Keep both paths — mock test from workspace root, live test from sveltekit-frontend/

---

## 🧠 ACP Memory Hierarchy: Canonical Architecture (MASTER REFERENCE)

**Document**: `docs/architecture/ACP-GEMMA4-MEMORY-HIERARCHY.md`

**Core Principle**: Gemma4 is the LAST stage of a 6-stage pipeline, not the memory system. This is historical guidance; the live synthesis owner is `llama-server` on `:8090`.

The ACP (Agent Control Plane) handles all memory, search, caching, and packet compaction. Gemma4 receives only a compact, tokenized, validated bundle and performs attention/synthesis.

**6-Stage Pipeline**:
1. User prompt (text)
2. ACP Planner (decision: cache or search?)
3. BitFrost cache (Redis L1 memory, 5–20ms lookup)
4. Cache miss → Search pipeline (rg → Postgres → Qdrant → Neo4j → ...)
5. Packet compaction (4,800 tokens instead of 18,800)
6. Gemma4 synthesis (only now, with compact bundle; historical label for the live llama-server synthesis stage)

**Current memory ownership (supersedes the historical cache hierarchy below):**
- **Model KV prompt cache:** ephemeral reuse inside the active llama-server/model execution; not durable memory, canonical identity, or a source of truth.
- **BitFrost/Valkey:** disposable hot residency and cache for revision/checksum-addressed evidence and context artifacts; never canonical identity or durable knowledge.
- **PostgreSQL:** durable canonical packets, source/revision bindings, and semantic/evidence facts. Qdrant and Neo4j are rebuildable retrieval/graph projections; filesystem and Internet are source/evidence inputs, not additional memory tiers.

**Workflow retrieval note (derived projection only):** Searchable workflow packets may be projected to Qdrant from PostgreSQL-owned, revision-qualified records; Qdrant does not own durable workflow memory or canonical identity.

**Key Win**: 75% token reduction, 80% latency reduction, Gemma4 focused on reasoning not search.

---

## Sessions 82–84 summary — archived (pointers only)

Verbatim in `docs/archive/claude-md-stale-status-and-bitfrost-audit-2026-10-03.md`. Standing facts: LangGraph is loop controller only (`packages/atlas-core/src/langgraph/{worker,clients}.ts`; no datastore ownership); telemetry in `packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts`; GAN audit orchestrator wired Postgres→validate→Postgres→Redis invalidate→NATS (`atlas_packets.ganValidated/ganValidationError/ganWarnings`); Go retrieval bridge `src/lib/server/retrieval/go-search-bridge.ts` (HTTP `:8100`/`:8096` primary; gRPC `:50055` collides with chr97 — HTTP is sufficient); admin routes `/api/admin/retrieval/{search,clusters,clusters/[id]}`, UI `/command-center/retrieval`.

## ⚡ PRIORITY: Parent Atlas P0–P7 Roadmap (Identity Frozen)

**Authoritative Reference**: `memory/parent-atlas-frozen-identity-contract.md`

### Core Rule: Do Not Optimize Broken Lineage

**Canonical Identity Chain** (immutable):
```
directory_path → source_ref → file_path → function_symbol 
→ feature_id → feature_label → packet_key
```

**Execution Order** (strict sequential):
```
P0  Freeze identity
P0A Verify directory/source_ref stability
P0B Cold storage manifest
→ P1  Agentic error fixing (uses frozen identity)
→ P2  Rust parser N-API
→ P3  Qdrant payload v2 normalization
→ P4  Higher-hop enrichment
→ P5  GPU acceleration health
→ P6  AE/SOM optimization
→ P7  QLoRA/PPO export
```

### Hard Fail Conditions (Non-Negotiable)

Scripts **MUST** fail (do not continue) if:
- `missing source_ref`, `missing feature_id`, `missing feature_label`, `missing packet_key`
- `duplicate source_ref`, `duplicate packet_key`
- `orphaned qdrant payload`, `orphaned redis centroid`, `orphaned cold manifest`
- `directory mismatch`, `packet missing postgres row`

### Forbidden Identity Sources
- Neo4j as truth (topology only, not identity)
- Qdrant as truth (mirror only, not identity)
- Redis as truth (cache only, not identity)
- feature_id-only joins (always use source_ref + directory_path)
- community_id-only joins
- legacy pseudo-refs (sourceRef v1, stable_key, canonicalSourceRef)

### Retrieval Contract (Strict Order for Error Fixing)
```
Redis BitFrost exact (L1)
→ Postgres packet_key/source_ref (canonical)
→ Qdrant dense + tags (mirror)
→ Postgres FTS/trigram (fallback)
→ Neo4j bounded k-hop neighbors (topology only)
→ DuckDB offline reports (analytics only)
→ llama-server synthesis (last resort)
```

### Storage Mirrors (All Synchronized)
| Store | Role | Truth Authority |
|-------|------|-----------------|
| Postgres | Identity + lifecycle | **YES** — canonical |
| Qdrant | Dense retrieval | Mirror (payload must match Postgres) |
| Redis | L1/L2 cache | Cache only (may be stale) |
| Neo4j | Topology + edges | Topology only (NOT identity) |
| DuckDB | Offline analytics | Reports (non-blocking) |
| CouchDB | Cold archive | Archive (immutable after written) |

### Key Commands
```bash
npm run atlas:lineage:verify        # P0: Freeze identity
npm run atlas:dir:verify            # P0A: Directory stability
npm run atlas:cold:verify           # P0B: Cold manifest
npm run atlas:error:audit           # P1: Error fixing audit
npm run atlas:error:plan            # P1: Error fixing plan
npm run atlas:error:apply --apply   # P1: Error fixing apply
npm run atlas:qdrant:audit-v2       # P3: Qdrant v2 audit
npm run atlas:qdrant:backfill-v2    # P3: Qdrant v2 backfill
npm run atlas:qdrant:verify-v2      # P3: Qdrant v2 verify
npm run atlas:gpu:health            # P5: GPU health audit
```

---

## IDE Linter Warning

VS Code ESLint/Prettier auto-reformats files on disk change, sometimes reverting Edit tool changes.

**Workarounds** (ranked by reliability):
1. **Write tool** for full file rewrites (linter reformats style only, not logic)
2. **Batch edits** into single Write instead of multiple Edits
3. **Re-read after Edit** to verify changes survived
4. **Detection**: "file was modified by user or linter" system reminder = linter reverted

See `memory/ide-linter-workarounds.md` for full details.

---

## Technology Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes) + bits-ui v2.16.2 + UnoCSS v66.5 (svelte-scoped)
- **Forms**: sveltekit-superforms v2 + Zod validation
- **Local Cache**: IndexedDB + Loki.js
- **Server Cache**: Valkey (`valkey/valkey-bundle:8` — AGPL-free Redis Stack drop-in with valkey-json + valkey-search; bind `127.0.0.1:6379`; zero ioredis code changes)
- **Database**: PostgreSQL 18.4 + Drizzle ORM 0.44 + pgvector
- **Vector DB**: Qdrant (GPU-accelerated)
- **AI Models**: 
    - **Embeddings Lane**: Ollama (`embeddinggemma:latest` via `/api/embed`)
    - **Generation Lane**: `Gemma4` / `Qwen` via `llama-server` (TurboQuant + Bitfrost)
    - **Vision**: `gemma4-rotorquant:latest` (unified text+vision, GRPO legal LoRA merged)
- **Client AI**: ONNX Runtime (WebGPU → WASM SIMD → CPU) + gemma 270M quantized
- **Real-Time**: Server-Sent Events (SSE)
- **State Machines**: XState v5 (client orchestration) + RabbitMQ (server async)
- **Message Queue**: RabbitMQ (7 queues, 5 exchanges)
- **MCP**: FastMCP agentic tool calling (108 tools live in `src/mcp/server.ts` as of 2026-08-31, verified by booting the process — the "9 tools" figure once here was fictional, not just stale; see the "FastMCP Agentic Tools" section under Technology Stack for the finding and the dynamic query-scoped selection now wired in, and the "MCP/Atlas status note" at the top of this file for TRACE's separate, larger tool count)

---

## Client-Backend Multi-Tier Architecture — condensed (full text archived 2026-10-03)

Verbatim original (fallback chain diagram, cache tiers, retrieval pipeline, Qdrant collection table, MCP tool-set selection and MCP-SELECT hardening, evidence pipeline, key file tables): `docs/archive/claude-md-legacy-reference-2026-10-03.md`. Standing facts:
- **Inference:** client router `src/lib/ai/client-router.ts` → local ONNX (`gemma3_270m_onnx`, WebGPU→WASM→CPU) for simple queries, server for legal/complex. Embeddings via Ollama `/api/embed` (`embeddinggemma:latest`) → Redis → Qdrant → Postgres; generation via llama-server. Cache tiers: LokiJS → IndexedDB → server memory → Redis → service logic.
- **Qdrant:** live `GET /collections` (43 at 2026-08-31) is the only exhaustive list; `codebase_chunks_768` is the active code collection (see Embedding Dimensions Policy). RabbitMQ queues: `cache.invalidate`, `document.embed`, `evidence.process`, `vector.index`, `chat.context`, `analytics.track`, `codebase.index`.
- **MCP:** `src/mcp/server.ts` registers ~108 tools (verified by booting the process; a static grep undercounts). The old "9 FastMCP tools" list was fictional. `selectMcpToolSubset()` filters `tools/list` when `_meta['com.parentatlas.tool_query_hint']` is set (discovery optimization only, never authorization; fails open; filtered responses carry `ttlMs:0, cacheScope:'private'`). The semantic path needs Qdrant `tool_manifest` populated (empty → registry fallback, so different queries can return the same subset). TRACE's larger count is tracked separately (see the MCP/Atlas status note).
- **Evidence pipeline (8 stages):** SeaweedFS upload + SHA-256 + Postgres → pdf-parse/OCR → `legal-chunker.ts` → embedding (gRPC → embeddinggemma → nomic fallback) → pgvector `evidence_vectors` + Qdrant `evidence_items` → entity extraction → forensic patterns → summarization (non-fatal).
- **Key files:** `src/lib/ai/{client-router,client-cache,client-embed,model-ids}.ts`, `src/lib/ai/onnx/session.ts`, `src/lib/server/{redis,cache,rag-pipeline}.ts`, `src/lib/server/vector/qdrant-manager.ts`, `src/lib/server/queue/rabbitmq-manager-fixed.ts`, `src/lib/server/grpc/embedding-client.ts`, `src/lib/server/indexer/legal-chunker.ts`, `src/lib/machines/retrieval-machine.ts`. References: `docs/KARPATHY_PIPELINE_ARCHITECTURE.md`, `docs/ACE_STARTUP_CUDA_BRIDGE.md`.

---

## Redis L1 + Bifrost L2 Cache System — condensed (full text archived 2026-10-03)

Verbatim original (architecture, measured latencies, usage/header examples, monitoring, tuning, audit script, file table): `docs/archive/claude-md-legacy-reference-2026-10-03.md`. The "PRODUCTION READY (April 2026)" banner is historical; BitFrost warm buckets are `NOT_PROVEN` (see the consolidated BitFrost section below).
- **Two different systems share a name:** **Bifrost** (one `f`, Go service `:3040`, `go-microservice/cmd/bifrost/`, client `bifrostChat()` in `$lib/server/ollama.ts`) = inference/semantic gateway cache. **BitFrost** (with `t`) = ACE/Karpathy residency cache; live keys are `bitfrost:*` and `gpu:*`, never `bifrost:*`. The Canonical Lineage "Redis/Bifrost key pattern" (`bifrost:packet:*`, `centroid:*`) matches zero live keys — aspirational.
- **Tiers:** L1 Redis exact-match (`src/lib/server/cache/redis-exact-match.ts`, SHA-256 of model+messages+temperature+maxTokens, 1 h TTL) → L2 Bifrost semantic (Qdrant-backed, threshold 0.8 via `x-bf-cache-threshold`; headers `x-bf-cache-type: none` bypass, `x-bf-cache-ttl`) → L3 direct inference. Stats: `GET /api/cache/exact-match/stats`; invalidate via `/api/cache/invalidate`.
- **`gpu:karpathy:encoded` stays absent** until a trained autoencoder writes `ace:autoencoder:weights` (a deliberate skip, not a bug).
- **Redis memory:** the example `maxmemory`/`allkeys-lru` commands target a different container (`deeds-redis-prod`); live Valkey is `legal-ai-valkey` (policy decision pending).
- **Health:** `bash scripts/audit/backend-infrastructure-audit.sh` (17 gates, see `BACKEND_INFRASTRUCTURE_AUDIT.md`).

---

## Degraded Response Contract (API Routes)

**All GET API routes MUST return the same JSON shape on error as on success.** Clients destructure responses identically — a shape mismatch causes `undefined` reads and console errors.

```typescript
// SUCCESS path
return json({ sessions: [...data], total: 5 });

// DEGRADED path (catch block) — SAME top-level keys, empty/zero defaults
return json({ sessions: [], total: 0 });

// WRONG — missing sessions/total keys, client breaks
return json({ error: 'Failed' }, { status: 500 });
```

**Rules:**
- Catch blocks on GET handlers return **200** with empty-but-valid data (not 500 with error-only JSON)
- Every top-level key from the success response must appear in the degraded response
- Use empty arrays `[]`, zero `0`, `null`, or empty string `''` as defaults
- POST/DELETE/PATCH action routes can return `{ error: '...' }` since clients check `response.ok`
- Client-side fetches for GETs should always be able to destructure without `?.` on top-level keys

**UUID validation on client fetch calls:**
- Any component that fetches `/api/cases/${caseId}/...` must validate `caseId` is a UUID before fetching
- Use `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` guard
- Return early (skip fetch) if ID is empty string or non-UUID — prevents noisy 400s in console

---

## Svelte 5 Runes (REQUIRED — No Svelte 4 Patterns)

### Svelte 5 Runes vs. XState v5 Decision Matrix

| Use Case | State Store choice | Implementation Pattern |
|---|---|---|
| UI Toggles & Modals | Runes / Bits UI | Use `$bindable()` properties directly in Bits components |
| Linear Multi-step Wizards | Runes | Use class-backed `.svelte.ts` class with `$state.raw({ step: 1 })` |
| Async Form Validation | Runes / Superforms | Use `superValidate` with server-side Zod + client state |
| Parallel Fetch & Watchdog timers | XState v5 | Use XState machine with `Promise.race` + `watchdog` timer |
| Multi-Actor Retries & Back-offs | XState v5 | Use XState machine (`retrieval-machine.ts`, `chat-machine.ts`) |

```typescript
// State
let count = $state(0);
let user = $state({ name: '', email: '' });

// Derived (simple expression)
let doubled = $derived(count * 2);

// Derived (complex — use $derived.by for blocks)
let filtered = $derived.by(() => { /* complex logic */ return result; });

// Effects
$effect(() => { console.log(count); });

// Props
let { value, onChange }: Props = $props();
```

**Svelte 4 → 5 mapping:**
| Svelte 4 | Svelte 5 |
|----------|----------|
| `export let x` | `let { x } = $props()` |
| `$: doubled = x * 2` | `let doubled = $derived(x * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `on:click={fn}` | `onclick={fn}` |
| `<slot>` | `{#snippet children()}{/snippet}` + `{@render children()}` |
| `writable()` stores | `$state()` in `.svelte.ts` files |

### Store Migration Patterns (Session 63)

**In `.svelte` files** — replace `writable()` inline:
```typescript
// Before (Svelte 4)
import { writable, get } from 'svelte/store';
const items = writable<Item[]>([]);
$items.push(newItem);       // auto-subscribed via $ prefix
items.set([]);               // .set() method
items.update(i => [...i]);   // .update() method

// After (Svelte 5)
let items = $state<Item[]>([]);
items.push(newItem);         // direct mutation (proxied)
items = [];                  // direct assignment
items = [...items, newItem]; // spread for new reference
```

**In `.svelte.ts` files** — class-backed `$state` (preferred for shared stores):
```typescript
// src/lib/stores/user.svelte.ts
class UserStore {
  user = $state<User | null>(null);
  isAuthenticated = $derived(this.user !== null);

  login(u: User) { this.user = u; }
  logout() { this.user = null; }
}
export const userStore = new UserStore();
```

**In plain `.ts` files** — runes do NOT work, use plain TS:
```typescript
// Server-side or plain utility .ts files
export class SimpleStore<T> {
  private value: T;
  private subscribers = new Set<(v: T) => void>();

  constructor(initial: T) { this.value = initial; }
  get() { return this.value; }
  set(v: T) { this.value = v; this.subscribers.forEach(fn => fn(v)); }
  subscribe(fn: (v: T) => void) {
    fn(this.value);
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }
}
```

**SSR Safety Rules:**
- Global `$state` in `.svelte.ts` persists across SSR requests — **leaks user data between requests**
- Server-side per-request state → use `event.locals` in hooks, NOT global `.svelte.ts` stores
- `.svelte.ts` stores are fine for **client-only** state (auth, UI preferences, chat sessions)
- Don't export raw `$state` variables — wrap in classes or closures

---

## Bits UI v2.16.2 Import Patterns

```typescript
// Namespace imports from main entry
import { Accordion, Dialog, Select, Checkbox, ScrollArea } from "bits-ui";

// Dialog (full pattern with Portal + Overlay)
<Dialog.Root bind:open={isOpen}>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <Dialog.Title>Title</Dialog.Title>
      <Dialog.Description>Description</Dialog.Description>
      <Dialog.Close>Close</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

// Dialog with transitions (forceMount + child snippet)
<Dialog.Overlay forceMount>
  {#snippet child({ props, open })}
    {#if open}
      <div {...props} transition:fade>overlay</div>
    {/if}
  {/snippet}
</Dialog.Overlay>

// ScrollArea
<ScrollArea.Root type="hover">
  <ScrollArea.Viewport><!-- content --></ScrollArea.Viewport>
  <ScrollArea.Scrollbar orientation="vertical">
    <ScrollArea.Thumb />
  </ScrollArea.Scrollbar>
  <ScrollArea.Corner />
</ScrollArea.Root>
```

**Key v1 → v2 changes:**
- Transition props removed — use `forceMount` + `child` snippet with Svelte 5 transitions
- `let:` directives → `{#snippet child({ props, open })}` for data exposure
- `multiple={true}` → `type="multiple"` (Accordion/Select)
- `el` → `ref` for element binding
- `asChild` → `child` snippet (spread `{...props}` on your element)
- Local wrapper components are obsolete — import bits-ui directly
- Use bits-ui component API, NOT melt-ui builders directly
- `onOpenChange` callback available on Root components

**Ambient type shadowing warning:** `src/types/bits-ui.d.ts` shadows bits-ui's own shipped types. bits-ui v2.16.2 ships complete `dist/index.d.ts` with proper compound namespaces. The ambient file was needed historically but may cause type mismatches with newer API features.

**Button**: Default import: `import Button from '$lib/components/ui/Button.svelte'`

---

## SSR Classification (A/B/C Buckets)

When wiring components to routes, classify each into:

**A) SSR-safe** (keep SSR enabled):
- Reads data via `load()` / server endpoints
- No browser-only globals
- Uses lucide/bits-ui primitives only
- Icons use UnoCSS `i-lucide-*` classes via `<Icon name="..." />` wrapper (SSR-safe, pure CSS)

**B) Client-only** (set `export const ssr = false`):
- Canvas/WebGL/WebGPU rendering
- Direct `window`/`document` usage in module scope
- localStorage/IndexedDB in module scope
- Heavy client-only demos
- Put behind `/dev-tools/*` or `/demos/*` routes

**C) Mixed** (prefer SSR, guard browser code):
- Mostly SSR-safe with small client-only areas
- Move browser-only code behind `onMount()` and `typeof window !== 'undefined'` guards
- Keep SSR enabled unless truly impossible

---

## UnoCSS Configuration

Config at `sveltekit-frontend/unocss.config.ts`. Svelte-scoped mode via `@unocss/svelte-scoped/vite`.

**Theme colors**: sand, sandDark, panel, panelSoft, accent, accentSoft, danger, warning, info
**Shortcuts**: `app-bg`, `panel`, `btn-base`, `btn-primary`, `tag`

**Consistency rule**: Use UnoCSS utilities everywhere — do NOT mix with raw Tailwind classes. Keep one utility system to avoid class collisions and mental overhead.

```css
/* CSS class syntax — NO spaces before pseudo-class colons */
hover:bg-accent focus:border-blue-500 disabled:opacity-50
```

---

## Superforms v2 (Zod as Source of Truth)

**Pipeline**: Zod schema → superforms adapter → Drizzle insert types from schema
- Zod schema is the runtime validator (single source of truth)
- superforms uses the Zod adapter (`import { zod } from 'sveltekit-superforms/adapters'`)
- Drizzle insert/select types come from Drizzle models (not custom `DrizzleTypes`)
- In SvelteKit routes, use `import type { RequestHandler } from './$types'` — no parallel type layers

```typescript
// Server: import from sveltekit-superforms (NOT @sveltejs/kit)
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

// Client
const { form, errors, enhance, delayed } = superForm(data.form, {
  validators: zodClient(schema),
  dataType: 'form', // Required for file uploads
});

// File upload: use fileProxy
const file = fileProxy(form, 'file');
```

See `memory/superforms-reference.md` for full patterns.

---

## Database Migration Safety

**CRITICAL: Always use `drizzle-kit migrate` (not `push`) on databases with real data.**

**STOP if you see:**
```
Warning: You're about to delete kg_nodes table with 2764 items
```
Answer NO or Ctrl+C immediately. Drizzle marks tables not in schema for deletion.

**Safe approaches:**
1. Add missing tables to schema (prevents deletion)
2. Use `tablesFilter` in drizzle.config.ts: `['!phase89_*', '!kg_*']`
3. Use `introspect` to auto-generate schema from DB
4. Raw SQL for simple changes: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

**Table rename pro-tip:** Drizzle generates DROP+CREATE for renames. Edit the SQL to `ALTER TABLE "old" RENAME TO "new"` before running migrate.

**Pre-flight checklist:** Review SQL for DROP statements, verify schema includes all existing tables, test on dev first.

---

## PostgreSQL 18 Query Optimization & Export Performance (July 4, 2026) — condensed (full text archived 2026-10-03)

Verbatim original (stats-table DDL, `refresh_codebase_chunk_stats()`, perf table, config values): `docs/archive/claude-md-ops-incidents-2026-10-03.md`. PostgreSQL 18.4 is not the bottleneck; slow exports came from unindexed full scans with expensive string work (`regexp_split_to_array`, `cardinality`) over ~39K summary rows (30–60 s timeout).
- **Fast-export pattern:** precompute aggregates into `codebase_chunk_index_stats` (10-row history) via `refresh_codebase_chunk_stats()` on a schedule or app startup (pg_cron if available), then read one row (<1 ms); a partial index on `summary` (`WHERE summary IS NOT NULL AND btrim(summary) <> ''`) brought the filtered scan to ~78 ms.
- **Rules:** never run `regexp_split_to_array` unfiltered over a large text column; add partial indexes on text columns used in WHERE; prefer materialized stats over recomputed aggregates; refresh on a schedule. Settings then: `shared_buffers 128MB`, `effective_cache_size 4GB`, `work_mem 4MB`, `jit on`, `random_page_cost 4`. The July counts (39,151 chunks) are stale.

---

## PostgreSQL 18 vs 17 — removed function overloads (found August 8, 2026)

**`isfinite(double precision)` / `isfinite(real)` no longer exist in PostgreSQL 18.4.** Confirmed
live via `pg_proc`:

```sql
SELECT proname, pronamespace::regnamespace, proargtypes::regtype[] FROM pg_proc WHERE proname = 'isfinite';
--  isfinite | pg_catalog | {date}
--  isfinite | pg_catalog | {"timestamp without time zone"}
--  isfinite | pg_catalog | {"timestamp with time zone"}
--  isfinite | pg_catalog | {interval}
```

Only the `date`/`timestamp`/`timestamptz`/`interval` overloads remain — the float8/real overloads
were dropped (PostgreSQL 17 introduced the standard SQL `IS NAN`/`IS INFINITE` predicates and the
old float `isfinite()` builtin was removed as part of that cleanup). Any SQL written against
PG16-or-earlier assuming `isfinite(some_double_precision_column)` works will fail at execution
time on this project's PG18.4 with `function isfinite(double precision) does not exist`.

**Fix pattern (already used correctly elsewhere in this repo, e.g.
`drizzle/0112_parent_atlas_graph_v2.sql`)**:

```sql
-- ❌ BROKEN on PG18+
CHECK (isfinite(pagerank_raw) AND pagerank_raw >= 0)
WHERE NOT isfinite(x)

-- ✅ WORKS on PG17+ and PG18
CHECK (pagerank_raw >= 0 AND pagerank_raw NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8))
WHERE x IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)
```

**Fixed 2026-08-08**: `sveltekit-frontend/drizzle/manual/0099_pagerank_authority_contract.sql` —
its `CREATE TABLE` `CHECK` constraints for `atlas_graph_authority_scores` used
`isfinite(pagerank_raw)` / `isfinite(pagerank_l1)`. Before editing, confirmed via `\d
atlas_graph_authority_scores` that the live table (50,164 rows) does **not** actually have these
specific constraints attached — only `authority_band`/`contract_version`/`normalization_method`
checks exist live — so this was a fresh-deploy/replay risk, not an active production landmine,
and safe to patch in place (no Drizzle Safety Rule conflict: nothing live needed altering). Patched
to the `NOT IN ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)` form and re-ran the whole
file directly against the live DB to confirm it now executes cleanly end to end (every statement a
safe no-op via `IF NOT EXISTS`, zero errors). Also fixed in application code: `sveltekit-frontend/
src/lib/server/graph/pagerank-promotion-gate.ts` (see
`openspec/changes/parent-atlas-agentic-repair-bundle-integration`
T0a for the full bug writeup — this was one of three real bugs found while wiring that file live).

**Before writing new PG18 SQL that checks for NaN/Infinity**: grep for `isfinite(` (case-sensitive
— `isFinite`/`Number.isFinite` in TypeScript are unrelated, real, and fine) before assuming the
Postgres builtin still works.

---

## ParadeDB / pg_search + pgvector HNSW — live state (verified 2026-09-26)

**Any older note in this repo saying "pg_search is not installed" is stale** (e.g. dated entries in
`parent-atlas-neural-prefill-encoder/tasks.md`, `parent-atlas-workstation-todo.md`). Receipt:
`PG-SEARCH-ENVIRONMENT-IDENTITY-01` in `openspec/changes/parent-atlas-repair-candidate-feature-matrix/tasks.md`.

| Item | Live value |
|---|---|
| Server | container `legal-ai-postgres`, image `pgvector-pgsearch:pg18-local`, host port **5434**, PostgreSQL 18.4, `shared_preload_libraries=pg_search` |
| Extensions | `pg_search` 0.25.1 (ParadeDB BM25), `vector` 0.8.3, `pg_trgm` 1.6 |
| Size | `pg_search.so` 183 MB; BM25 index 91 MB |
| BM25 index | `idx_codebase_chunk_pgsearch_bm25` on `codebase_chunk_index (id, content, relative_path)`, `USING bm25 ... WITH (key_field=id)` |
| API | Both work on installed 0.25.1: `@@@` with `paradedb.score`, and the triple-pipe (any term) and triple-ampersand (all terms) operators with `pdb.score`. `USING paradedb` untested. Upstream has since published 0.25.9 and 0.25.10 packages for PostgreSQL 18; upgrade remains a separate, unmade decision. |
| Native FTS | Built in (not an extension): GIN `idx_codebase_chunk_bm25_search` on `codebase_chunk_index.search_vector` (English tsvector, misleadingly named "bm25"). Declared owner path `search_code_lexical` reads `code_retrieval_chunks` (41,662 rows, `stable_key`), a different table and grain |
| Canonical HNSW | `codebase_chunk_index_content_hnsw` on `content_embedding` halfvec(768), `halfvec_cosine_ops`, m=16, ef_construction=200. HNSW comes from pgvector, not ParadeDB. Measured recall@10 0.997 vs exact (100 in-corpus queries, ef_search 40/100/200), ~5-30 ms vs ~530-730 ms exact. Filtered/iterative-scan not yet proven |

**Rules**
- **Probe the right server first.** Host port 5432 is a separate Windows-native `postgres.exe` service; the app uses 5434. Before any extension/index probe record `inet_server_port()`, `data_directory`, `version()`; never let a probe without that fingerprint overwrite this table.
- **Ownership:** native FTS = declared lexical owner; pg_search BM25 = installed, unpromoted challenger (no relevance labels, so no quality claim). `Bm25Lane` (`'bm25'` in `search-lanes.ts`) is actually pg_trgm `similarity`, not BM25; the string is a live routing key (`cognitive-router.ts`), so rename only with an alias.
- No `CREATE`/`DROP`/`ALTER EXTENSION`, index rebuild, or pg_search upgrade without an explicit decision.
- Postgres needs only SQL; TypeScript calls it via Drizzle `sql` templates. Keep extension DDL in SQL migrations.

---

## UI bugs are HOT — never deferred (May 11, 2026)

The "do not touch" lists below (Drizzle Safety Rule § 1-4, identity strategy, hypergraph write fire, CUDA Graphs, cuVS, new LangGraph workers) cover **infrastructure/data-layer changes** that need operator review. They do **NOT** cover broken UI affordances. **UI bugs jump the queue.**

**What counts as a UI bug:**
- Buttons that visually exist but click does nothing (no console.log, no network request, no state change)
- Forms that submit but no `fetch()` fires (`onsubmit` handler missing or returns false silently)
- File inputs / drop zones that don't accept files (drag/drop handler missing or `e.preventDefault()` not called)
- Modals that won't open OR won't close (state binding broken)
- Pages that render blank (uncaught exception in load() or top-level component)
- Service Worker / Web Worker registration failures (cascade into offline + analytics breakage)
- `console.error` on page load (always a real bug — not "noise")
- Network requests that never arrive at the server (intercepted by SW, blocked by COEP, CORS, or rate limiter)

**The diagnostic discipline** (use `tests/e2e/upload-button-diagnostic.spec.ts` as the template):

A Playwright test that captures EVERY browser signal — `console`, `pageerror`, `request`, `response`, `requestfailed` — for a single user action. Output is verbose by design (forensic, not CI gate). Run it BEFORE guessing what's broken.

```ts
page.on('console', (msg) => log.consoleMessages.push({type, text, location}));
page.on('pageerror', (err) => log.pageErrors.push({message, stack}));
page.on('request', (req) => log.requests.push({method, url, resourceType}));
page.on('response', async (res) => { if (status >= 400) capture body });
page.on('requestfailed', (req) => log.requestFailures.push({url, failure}));
```

**Real example (this commit, 2026-05-11):** User reports "nothing uploads". Server probe shows `POST /api/evidence/upload` returns HTTP 201 with full evidence record. Diagnostic captures `SW: Registration failed: TypeError ... script evaluation failed @ src/lib/client/sw-register.ts:24`. Root cause: 1-line syntax bug in `static/sw.js:480` (corrupted `key: value` colon-mix from a prior auto-fixer pass — same pattern as the `cache.put()` bug fixed in commit `e54bc0850e`). One-line edit + diagnostic re-run shows `Console errors: 0`. Done.

**Workflow when a UI button "doesn't work":**
1. Write a forensic Playwright test that captures all 5 signals (template above)
2. Run it once, eyeball the output
3. Fix the FIRST root-cause error (don't chase warnings)
4. Re-run, confirm signal goes 1 → 0
5. Commit with the diagnostic script committed too — the next person needs it

**Do NOT:**
- Bury UI bugs under the "operator-only" hard rules (those are for DB/infra/identity, not UX)
- Assume "the SW bug is unrelated" — SW fail cascades into upload failures, telemetry loss, analytics gaps
- Defer to "P1 mechanical batch" — broken buttons block actual users; mechanical type fixes don't

---

## Object Storage: SeaweedFS is canonical (MinIO deprecated, May 11, 2026) — condensed (full text archived 2026-10-03)

Verbatim original (architecture ports, cutover code, verification, deprecation timeline): `docs/archive/claude-md-ops-incidents-2026-10-03.md`.
- **Rule:** SeaweedFS (Apache 2.0, S3 gateway `:8333`) is the storage product for all new code/prompts/docs; no new MinIO-first naming. Legacy `minio_key`, `MINIO_*`, `minio-client.ts` remain until an explicit storage-contract rename; write SeaweedFS-compatible S3 keys into them. Old `evidence.fileUrl` rows may carry `minio://`.
- **Cutover mechanism:** `src/lib/server/env.server.ts:300-307` maps `SEAWEED_S3_PORT`/`SEAWEED_ENDPOINT`/`SEAWEED_ACCESS_KEY`/`SEAWEED_SECRET_KEY` onto `ENV.MINIO_*` (set in the `package.json` dev script via cross-env and in `.env`; `.env` is gitignored so deployments must set them). Containers: `legal-ai-seaweed-{master:9333,volume:8380,filer:8382,s3:8333}`; bucket `legal-evidence`; credentials live in `etc/seaweedfs/s3.json` / `.env`, not code. `/api/health` probes the master (`:9333/cluster/status`).
- **Pending operator decisions:** mirror existing MinIO objects (`mc mirror`), stop/remove `legal-ai-minio`, rename `MINIO_*` → `S3_*`. Don't use MinIO admin commands or the MinIO console; use the Filer UI (`:8382`); check the AWS SDK matrix before adopting advanced multipart.

---

## Drizzle Safety Rule (May 11, 2026 — operator-only gate)

**Do NOT run `drizzle-kit push` or apply generated DROP migrations until ALL four hold:**

1. **DB-only live tables are protected** by `tablesFilter` in [drizzle.config.ts](sveltekit-frontend/drizzle.config.ts) OR explicitly declared in the canonical Drizzle schema. As of 2026-05-11 the filter protects 50 DB-only tables (`!ace_chunks`, `!embedded_summaries`, `!trace_runs`, `!warden_*`, etc.) plus the legacy `!phase89_*` / `!kg_*` patterns.
2. **The identity strategy for `users.id` / `user_id` is decided** by the operator. See "Schema Mismatch" section below — until the operator commits to Path A (all integer), B (all uuid), C (two-tier `users.id` + `users.uuid`), or D (defer/coerce forever), broad migration work blindly hardcodes the wrong choice.
3. **Generated SQL has been manually reviewed** — every CREATE/ALTER/DROP must be eyeballed before journaling. `drizzle-kit generate --name=foo` writes to `drizzle/0NNN_foo.sql` AND `drizzle/meta/_journal.json`. To inspect without journaling: generate, copy the SQL, then `git checkout drizzle/meta/_journal.json && rm drizzle/0NNN_foo.sql`.
4. **Manual SQL sidecar migrations are accounted for.** `drizzle/manual/*.sql` files are NOT in the journal — they were applied by hand. Any auto-generated migration that re-CREATEs those tables will collide. Cross-check generated CREATEs against `ls drizzle/manual/` before applying.

**`tablesFilter` semantics** (subtle): the `!table_name` patterns suppress `drizzle-kit generate` from emitting **DROP TABLE** for DB-only tables. They do NOT suppress **CREATE TABLE** for tables declared in `schema-postgres.ts` but missing from DB. To skip a CREATE, the table must be removed from the schema file OR the generated CREATE must be manually deleted.

**Current schema state (verified 2026-05-11):**
- Drizzle declares **148 tables** in canonical `schema-postgres.ts` + ~30 in sidecar schema files
- Live DB has **247 tables** (148 declared + 50 DB-only protected + ~50 legacy/sidecar)
- Inspection-only generate run produces **34 CREATE statements** (5 are audit-approved "migrate now" — `ace_retrieval_runs`, `ace_retrieval_hits`, `memory_gain_audits`, `metadata_envelopes`, `code_llm_index`; 7 are duplicates of filter-protected tables; 22 are deferred-feature scaffolding)
- 0 DROP statements (filter working)

**Audit references:**
- [docs/audits/db-schema-drift-2026-05-10.md](sveltekit-frontend/docs/audits/db-schema-drift-2026-05-10.md) — Drizzle vs Postgres drift inventory
- [docs/audits/feature-parity-2026-05-10.md](sveltekit-frontend/docs/audits/feature-parity-2026-05-10.md) — feature-level reality check
- [docs/audits/summary-2026-05-10.md](sveltekit-frontend/docs/audits/summary-2026-05-10.md) — action list
- [docs/audit/2026-05-11_feature-spec-implementation-audit.md](sveltekit-frontend/docs/audit/2026-05-11_feature-spec-implementation-audit.md) — directory-density feature audit

**AGENTS.md authority** (clarified): treat directory-level `AGENTS.md` files as **searchable index cards**, not source-of-truth specs. Canonical authority for features lives in `docs/master_agents.md` + this CLAUDE.md + `docs/audit/*.md` + actual code/tests/DB introspection. The 383 dir-level AGENTS.md files are auto-generated retrieval cards for ACE/KAG context hints.

---

## Schema Mismatch: `user_id` columns — RESOLVED (May 30, 2026)

**Previously fragmented (May 10, 2026): 16 integer / 24 uuid / 3 text.**
**Now (verified live 2026-05-30): 45 integer / 0 uuid / 3 text.** All 24 legacy uuid `user_id` columns have been migrated to integer, aligning with Lucia's integer `users.id`.

```sql
-- Verify (should match 45 integer / 0 uuid / 3 text):
SELECT data_type, count(*) AS tables
FROM information_schema.columns
WHERE column_name IN ('user_id','uploaded_by') AND table_schema='public'
GROUP BY data_type ORDER BY data_type;
```

**Confirmed identical on pg17 production and pg18 restored side container** (`legal-ai-postgres18-test:5433`).

**Lucia contract (unchanged):** `users.id` is `serial` integer. `locals.user.id` is `string` (Lucia v3 always strings IDs). `sessions.user_id` is integer in DB ✅.

**Simplified coding pattern (post-migration):**
- Going INTO Lucia API (`createSession`, `getSession`): `String(user.id)`
- Going INTO Drizzle `eq()` against an `integer user_id` column (45 tables): `Number(locals.user.id)`
- Going INTO Drizzle `eq()` against a `text user_id` column (`admin_ai_chat_sessions`, `agent_actions`, `saved_citations`): pass `locals.user.id` as-is
- **Per-table verification still recommended** for any newly-created table: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d <table>"`

**Drizzle schema cleanup remaining:** Several files in `schema-postgres.ts` still declare `userId: uuid('user_id')` reflecting the OLD intent. The DB has moved on — these declarations are inert but should be migrated to `integer('user_id')` for documentation accuracy. Use `drizzle-kit introspect` to regenerate the canonical schema from the live DB.

**Migrations applied this session (2026-05-10):**
- `password_reset_tokens.user_id`: uuid → integer (0 rows; safe; matches `users.id` PK)
- `vlm_image_tags`: created (uuid PK + name unique) — was missing entirely
- `0013_codeintel_indexes.sql`, `0016_codeintel_schema.sql`, `0016_courtroom_3d_animation.sql`, `0018_output_meta_manifold4.sql`: applied (mostly idempotent — already in place)

**Until a structural fix lands:** every new auth-touching route MUST verify column types via `\d` before writing the query. JSONB `Record<string, unknown>[]` columns need `as unknown as T[]` double-cast on read AND write. New JSONB columns should use `.$type<T>()` in the schema so consumers skip the double-cast.

---

## Migration history (May 10, 2026 — applied) — condensed (full text archived 2026-10-03)

Verbatim original (commands, verification matrix): `docs/archive/claude-md-legacy-reference-2026-10-03.md`. Standing facts: 5 SQL files not in `drizzle/meta/_journal.json` were applied by hand with `docker exec -i legal-ai-postgres psql …` (all `IF NOT EXISTS`); `vlm_image_tags` created; `password_reset_tokens.user_id` uuid→integer. SeaweedFS retargeting is the `SEAWEED_S3_PORT` override in `env.server.ts` (see the Object Storage section). **`PLAYWRIGHT_SKIP_GLOBAL_SETUP=true`** was required while `cases.user_id` was uuid and the global-setup case seed failed; re-check against the current schema before relying on it. Known degradations then: `/cases` empty-state when integer `users.id` meets a uuid `cases.user_id`; ownership filters should use `evidence.uploaded_by` (integer), not `evidence.user_id`.

---

## tsconfig Services Status (Updated April 7, 2026)

`src/lib/services/` is **un-excluded and fully type-checked** — 35 files across 3 subdirectories, **0 errors**.

Previously 312+ corrupted files were blanket-excluded. After archival and cleanup, only 35 clean files remain:
- **Root**: 7 files (api-client, couchdb-client, qdrant-client, tts, voice-commands, rag/source validation)
- **error-analysis/**: 17 files (DecisionEngine, FixSynthesizer, GRPOPolicy, KAGTraverser, etc.)
- **knowledge-search/**: 11 files (ACPToolRegistry, KnowledgeSearcher, KnowledgeIndexer, stores, etc.)

All 35 are actively imported by routes, components, or server modules (25 external consumers, 12 dynamic imports).

---

## Phase 99 Corruption Reference

Commit `0a2bd98929` corrupted 83 `.svelte` files via auto-migration tool. Clean versions at `fa8498dc4a`. Only ~5 imported by active routes. DO NOT run the Phase 99 tool again.

See `memory/corruption-patterns.md` for detection patterns and fix strategies.

---

## Unified Audit Gate System — pointer (archived 2026-10-03)

Full G1–G55 command tiers and the G4/G5 route tables are archived verbatim in `docs/archive/claude-md-audit-gates-2026-10-03.md`. Tiers: A code connectivity (G1–G9), B data layer (G10–G12), C infrastructure (G13–G17), D security/runtime (G18–G20), E Svelte 5 rune compliance (G21–G26), F pytorch-graph wiring (G27–G35), G glyph/cartridge/ACE (G36–G47), H search analytics (G48–G55). Run Tier A with `bash sveltekit-frontend/scripts/audit/orphan-detector.sh [dir]`; skills `/deep-audit`, `/audit-components`, `/prune-codebase`, `/wire-modules`. Rune gates G21–G25 must all return 0 hits: `export let`, `$:`, `on:click`-style events, `createEventDispatcher`, runes in plain `.ts`.

**Decision tree (post-gate):** G1–G9 all zero → orphan candidate → read the file (corrupted/<10 lines → ARCHIVE; superseded or no integration point → ARCHIVE; Svelte 4 syntax but valuable → REWRITE; <30 min to wire → WIRE else DEFER) → after wiring verify import → render → trigger → API → props → data flow (gaps = SHALLOW). Route files (`+page.svelte`, `+server.ts`, `+layout.svelte`) and config refs (`unocss.config.ts`, `svelte.config.js`, `vite.config.ts`) are never orphans.

**Known false negatives (look dead, are wired):** `$lib/webgpu/` (root layout), `$lib/gpu/` (WGSL shaders, reranker), `$lib/ai/onnx/` (client inference), `simd-bridge/cpp/` (N-API addon, G14), `AnalysisPanel.svelte` (dynamic import + `yorha:open-analysis`), `KeyboardShortcutsPanel.svelte` (dynamic-only), `chr97-builder.ts` / `cartridge-tensor-bridge.ts` (4 API endpoints), `lib/server/db/drizzle.ts` (`@vite-ignore`). `deeds_labs/` is gitignored — moving files there is permanent deletion.

**Open G4/G5 findings (deferred while `DEV_BYPASS_AUTH` is active; fix in one production-hardening pass with tests — do not fix piecemeal):** *Unauthenticated and unvalidated:* `api/ai/emotion` (POST, unbounded local-LLM cost), `api/batch-summary/jobs`, `api/retrieval/dual-lane`, `api/telemetry/implementation-clusters`, `api/phase102/retrieval-pipeline` (mock scaffold), `api/metrics/retrieval`, `api/retrieval/cache-layers/{health,metrics}`; `api/trpc/[...procedure]` needs a router-level check. *Authenticated but no Zod on mutating methods (19 routes):* `api/admin/atlas/taxonomy-candidates`, `api/admin/citations/discover`, `api/admin/packets/enrich-labels`, `api/analytics/research-summaries/[id]`, `api/cases/[id]/export/pdf`, `api/codebase-index/{cluster-assign,couchdb-pagerank,index-stream}`, `api/evidence/analyze`, `api/evidence/[id]/{gpu-analysis,suggest-summary}`, `api/files/[id]`, `api/library/ingest-codebase-docs`, `api/persons-of-interest/[id]/{associates/[associateId],gpu-analyze}`, `api/phase89/{analysis,reindex}`, `api/reports/[id]/publish`, `api/wiki/watch`. Note: the graph's `hasAuth:false` flag does not recognise `requireAdmin(event)` (12 of 28 were false positives). `api/atlas/domain-taxonomy/classify` (POST, `.strict()` Zod, read-only) sits behind the global `/api/atlas` ADMIN_ONLY prefix; its original 403 cause was never established.


---

## Backend Infrastructure Audit (17 Gates) — condensed (full text archived 2026-10-03)

Verbatim original (tier table, integration commands, service port table, baselines): `docs/archive/claude-md-small-refs-2026-10-03.md`; definitions `BACKEND_INFRASTRUCTURE_AUDIT.md`. Runtime service health (complements the static code-audit gates): `bash scripts/audit/backend-infrastructure-audit.sh` (~30 s) before deployment, after a Docker restart, or when debugging cache/inference. Tiers: A cache (Redis, Bifrost, Qdrant) G1-G5, B inference (Ollama, GPU, models, latency) G6-G9, C RabbitMQ G10-G12, D Langfuse G13-G15, E codebase index + simdjson G16-G17. Ports: SvelteKit 5173, Redis/Valkey 6379, Bifrost 3040, Qdrant 6333, Ollama 11434, RabbitMQ 5672/15672, Langfuse 3030, SeaweedFS master 9333 / S3 8333 / filer 8382. The Redis container name in the script (`deeds-redis-prod`) differs from the live `legal-ai-valkey`; baselines (Redis GET <10 ms, Bifrost L2 hit <10 s, Ollama GPU <60 s) are from the RTX 3060 Ti setup.

---

## gRPC Service Port Map (Audited April 19, 2026)

| Port  | Service                  | Client                   | Status        |
|-------|--------------------------|--------------------------|---------------|
| 50051 | EmbeddingService (Go)    | `grpc/embedding-client.ts` | FULLY WIRED |
| 50052 | GenerationService        | `grpc/generation-client.ts` | ORPHANED   |
| 50053 | RetrievalService (Go)    | `grpc/retrieval-client.ts` | FULLY WIRED |
| 50055 | CHR97 / LibSearch (Go)   | `grpc/chr97-agent-client.ts` | PORT COLLISION |
| 50056 | GraphML (PyTorch GPU)    | `grpc/graph-ml-client.ts` | MISSING ENV |
| 50057 | ToolCalling              | `grpc/tool-calling-client.ts` | FULLY WIRED |
| 8096  | go-search-service HTTP   | direct fetch             | OPERATIONAL   |
| 8097  | go-embedding-service HTTP| direct fetch             | COMPILED      |
| 8100  | go-retrieval-service HTTP| `grpc/retrieval-client.ts` | OPERATIONAL |

**Known issues:** Port 50055 collision (CHR97 + go-search-service), `GRAPH_ML_GRPC_URL` missing from `env.server.ts`, `generation-client.ts` has zero consumers.

**All gRPC services default to disabled** (`*_GRPC_ENABLED=false`). Each client has graceful fallback chains (gRPC → HTTP → inline TypeScript).

---

## Docker WSL2 VHDX Management

**Windows 10 limitation:** Docker's VHDX never auto-shrinks. Must compact manually after cleanup.

**VHDX locations:**
- `C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx` — main data volume (158 GB as of 2026-06-06)
- `C:\Users\james\AppData\Local\Docker\wsl\main\ext4.vhdx` — WSL system (~0.09 GB)

**Compact script** (saved to Desktop for convenience): `C:\Users\james\Desktop\compact-docker-vhdx.ps1`

**Compaction steps** (requires Admin — OOM errors mean this is needed):
```powershell
# 1. Prune inside Docker FIRST (frees space inside the VHDX before compacting)
docker system prune -a --volumes
docker builder prune -a
# 2. Quit Docker Desktop from system tray
# 3. Shut down WSL
wsl --shutdown
# 4. Run compact script AS ADMINISTRATOR (right-click -> Run with PowerShell as Admin):
& "C:\Users\james\Desktop\compact-docker-vhdx.ps1"
# OR manually via diskpart (Admin PowerShell):
diskpart
# Inside diskpart interactive prompt:
#   select vdisk file="C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx"
#   attach vdisk readonly
#   compact vdisk
#   detach vdisk
#   exit
```

**CRITICAL: diskpart requires Administrator elevation** — it will silently do nothing without it.

**Set disk cap:** Docker Desktop Settings > Resources > Advanced > Disk image size (e.g., 64 GB)

**Move to another drive:** Docker Desktop Settings > Resources > Advanced > Disk image location

## Docker: Use docker exec directly (NOT Node.js wrappers)

**OOM errors occur when Node.js loads Docker SDK or spawns child processes for Docker commands.**
Use `docker exec` directly via Bash/PowerShell tool — never wrap in Node.js scripts.

```bash
# ✅ CORRECT — direct docker exec
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM users"
docker exec legal-ai-valkey valkey-cli PING
docker exec legal-ai-qdrant curl -s http://localhost:6333/collections

# ❌ WRONG — Node.js Docker SDK (causes OOM)
# const docker = new Docker(); docker.getContainer('...').exec(...)
# require('dockerode') / import Docker from 'dockerode'
# child_process.exec('docker ...') from inside a Node.js script

# ✅ CORRECT — DB queries from scripts (use pg Pool directly, not Docker SDK)
# const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

**For smoke/seed scripts that need DB access:** connect directly via `pg.Pool` to `127.0.0.1:5434` — never spawn Docker from Node.

---

## GPU Acceleration Stack (N-API + LibTorch + simdjson) — condensed (full text archived 2026-10-03)

Verbatim original (architecture diagram, simdjson/LibTorch bridge APIs, N-API build, troubleshooting, perf tables): `docs/archive/claude-md-legacy-reference-2026-10-03.md`. Standing rules:
- **GPU accelerates tensor math only** (embeddings, cosine/matmul, top-k, rerank batches, AE/SOM/kmeans, LibTorch inference). NOT GPU: AST/tree-sitter parsing, JSON parsing/validation, CRUD, joins, Postgres FTS — use CPU parallelism (worker pool), not a GPU port (e.g. `scripts/atlas/lib/ast-grep-symbol-extraction.mjs` is a sequential loop; a pool helps, a GPU rewrite does not). simdjson is AVX2/SSE4.2 **CPU SIMD**, not GPU; TurboVec is CPU-side 4-bit ANN.
- **Native addon:** `tensorrt_bridge.node` (prefer `simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node`) exposes `simdJsonParse`, `libtorchCosineSimilarity`, `tensorrtInference`. TS wrappers: `src/lib/server/gpu/simdjson-bridge.ts` (`fastJsonParse`, falls back to V8 `JSON.parse`; payloads <1 KB bypass native) and `libtorch-bridge.ts` (`computeGpuSimilarity`, `isCudaAvailable`). If the addon fails with `ERR_DLOPEN_FAILED`, CUDA/LibTorch DLLs are not on PATH — V8 fallback is acceptable. Backend audit gate G17 checks `isSimdJsonAvailable()`.
- **NetworkX vs Neo4j:** NetworkX = CPU parity oracle (`python/graph_snapshot_parity_networkx_oracle.py` vs cuGraph `…_cugraph_oracle.py`, driven by `scripts/atlas/export-graph-snapshot-parity-parquet.mts`); Neo4j = topology **mirror** only. The NetworkX↔cuGraph pipeline is the trusted PageRank + Louvain compute path (162,234 nodes / 108,156 edges, `status: PASS`, correlation 1, ARI/NMI 1.0 — `sveltekit-frontend/docs/reports/graph-snapshot-parity/receipt.json`). Neo4j GDS `pageRank` properties (3,667 nodes) predate the pivot and are stale — never the canonical PageRank. Before adding a graph computation check `src/lib/server/graph/graph-analysis-runner.ts` and its adapters (pagerank/kcore/betweenness/cheirank → `graph_community_assignments`, `graph_communities`, `graph_node_metrics`); the repo already has too many graph-algorithm owners.

---

## Drizzle ORM 0.44 (PostgreSQL 18.4 + pgvector)

**Main schema**: `src/lib/server/db/schema-postgres.ts` (70+ tables, 14 enums)

```typescript
// Imports — use .js extension (bundler resolves .js → .ts)
import { users, cases, evidence, caseStatusEnum } from '$lib/server/db/schema-postgres.js';
import type { User, NewUser } from '$lib/server/db/schema-postgres.js';
import { eq, desc, and, or, sql } from 'drizzle-orm';

// Type inference: $inferSelect (read) / $inferInsert (write) — canonical approach
// Always infer from Drizzle schema definitions, NOT custom DrizzleTypes layers
export type Case = typeof cases.$inferSelect;
export type NewCase = typeof cases.$inferInsert;

// Common query patterns
const result = await db.select().from(cases).where(eq(cases.status, 'open'));
const [newCase] = await db.insert(cases).values({ title, status: 'open', priority: 'medium' }).returning();
await db.update(cases).set({ status: 'closed' }).where(eq(cases.id, caseId));
```

**Key enums**: `userRoleEnum`, `caseStatusEnum`, `casePriorityEnum`, `evidenceTypeEnum`, `documentTypeEnum`, `documentStatusEnum`, `patchStatusEnum`, `threatLevelEnum`

**Core table groups**: Auth (users, sessions), Cases (cases, caseNotes, caseStatuteLinks), Evidence (evidence, evidenceRelationships), Documents (documents, legalDocuments, documentChunks), Legal (citations, statutes, statuteChunks, legalPrecedents), RAG (ragSessions, ragMessages), Embeddings (6 vector tables, 768 dims), Workspaces, Route Health, Error Tracking

### pgvector Column Types (Drizzle-native)

```typescript
// PREFERRED — Drizzle-native (built into drizzle-orm/pg-core since ~v0.30)
import { vector, halfvec, sparsevec, bit } from 'drizzle-orm/pg-core';

// LEGACY — pgvector npm package (experimental, DO NOT use for new code)
// import { vector } from 'pgvector/drizzle-orm';

// Distance functions — use typed API, not raw SQL operators
import { cosineDistance, l2Distance, innerProduct } from 'drizzle-orm';

// Similarity search
const results = await db.select({
  id: items.id,
  distance: cosineDistance(items.embedding, queryVec)
}).from(items)
  .orderBy(asc(cosineDistance(items.embedding, queryVec)))
  .limit(10);

// HNSW index (Drizzle 0.44 native — but keep manual SQL convention for production)
index('embedding_hnsw_idx')
  .using('hnsw', table.embedding.op('vector_cosine_ops'))
  .with({ m: 16, ef_construction: 64 }),
```

See `memory/drizzle-schema-reference.md` for full table reference.

---

## Route Map

**App routes** (23 — `src/routes/(app)/`): active-cases, admin/*, ai-dashboard, all-routes (SSE), analysis-center, cases, citations, command-center, dashboard, error-brain, evidence, evidence-library, global-search, gpu-evidence-graph, persons-of-interest, phase78, system-configuration, terminal

**API routes** (43 — `src/routes/api/`): auth, cases, chat, citations, embed, evidence, health, indexing, kb, knowledge, ollama, persons, rag (search/validate/answer), reports, routes (SSE), sse, stream, summarize, topology, tools, and more

See `memory/drizzle-schema-reference.md` for full route map.

---

## XState v5 Patterns

```typescript
// Runtime functions — NOT types
import { assign, createMachine, fromPromise } from 'xstate';

// Svelte 5 integration
import { useMachine } from '$lib/utils/xstate-svelte5';
const { snapshot, send } = useMachine(myMachine);
const isLoading = $derived(snapshot.matches('loading'));
```

---

## Graceful Error Handling Pattern (Session 35)

All page server load functions use graceful degradation instead of `throw error(500)`:

```typescript
// safe() helper — wraps DB queries to prevent 500s
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

// Usage in load functions
const rows = await safe(
  db.select().from(table).where(eq(table.id, id)).limit(1),
  []
);

// Return loadError instead of throwing
if (!rows[0]) {
  return { data: null, loadError: 'Not found or database unavailable' };
}
return { data: rows[0], loadError: null };
```

**Rules:**
- `throw redirect()` is still correct for auth guards
- `throw error(404)` → return `{ data: null, loadError: '...' }` for missing records
- `throw error(500)` → NEVER in catch blocks; use `safe()` + `loadError` field
- API routes (`+server.ts`) can still return error JSON responses — this pattern is for page loads

---

## Test Scripts

**NEVER delete working scripts.** Move them to `scripts/tests/` if they're in the wrong place. We keep scripts that worked — we might need them later.

Visual regression / route-screenshot testing is currently delegated to Playwright in `tests/e2e/`. The `scripts/tests/test-screenshots.mjs` referenced in older sessions was never committed to the tree (and isn't in `deeds_labs/` archive either) — it was a local-only helper. Re-create as needed using Playwright's `page.screenshot({ path })` per the existing `tests/e2e/*.spec.ts` patterns.

---

## ORT WASM: Git vs Local Differences

The ONNX Runtime browser inference needs 3 `.wasm` binaries + 3 `.mjs` loaders in `sveltekit-frontend/static/ort/`:

| File | Size | In Git | In Local |
|------|------|--------|----------|
| `ort-wasm-simd-threaded.asyncify.mjs` | ~4KB | Yes | Yes |
| `ort-wasm-simd-threaded.jsep.mjs` | ~4KB | Yes | Yes |
| `ort-wasm-simd-threaded.mjs` | ~2KB | Yes | Yes |
| `ort-wasm-simd-threaded.asyncify.wasm` | 24.3MB | **No** (pre-commit hook rejects >10MB) | Yes |
| `ort-wasm-simd-threaded.jsep.wasm` | 22.7MB | **No** | Yes |
| `ort-wasm-simd-threaded.wasm` | 11.4MB | **No** | Yes |

**After cloning, copy WASM binaries from node_modules:**
```bash
cp node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.wasm sveltekit-frontend/static/ort/
```

**Verify serving:** Hit `/ort/ort-wasm-simd-threaded.wasm` in browser — should return 200.

**Cross-origin isolation:** If using threaded runtime, app needs COOP/COEP headers or threaded WASM degrades silently.

---

## UnoCSS Extraction Limitations (Session 38)

UnoCSS generates CSS only for utilities it can **extract at build time**. Dynamic Svelte class expressions prevent extraction:

```svelte
<!-- FAILS — UnoCSS can't extract "flex", "gap-3", etc. from dynamic expressions -->
<div class={`flex gap-3 ${isActive ? 'bg-accent' : 'bg-panel'}`}>
<div class="flex gap-3 {someVar}">

<!-- WORKS — static class strings are extractable -->
<div class="flex gap-3 bg-accent">
```

**Current fix:** Scoped `<style>` blocks for layout-critical components (tabs, filters, toolbars). Most deterministic approach — bypasses UnoCSS entirely.

**Alternative:** Safelist critical layout utilities in `uno.config.ts` to force generation regardless of extraction:
```typescript
safelist: [
  'flex', 'inline-flex', 'items-center', 'justify-between',
  'gap-1', 'gap-2', 'gap-3', 'gap-4',
  'px-2', 'px-3', 'px-4', 'py-1', 'py-2',
]
```

---

## Gemma4 LLM Call Rules (Hard Rules — June 2026) — condensed (full text archived 2026-10-03)

Verbatim original (SSE assembly code, Ollama example, OLLAMA_HOST normalization): `docs/archive/claude-md-ops-incidents-2026-10-03.md`. Written for the Gemma4 thinking model; the chat model is now Ornith 1.5 (resolve via `llama-server-model-resolver.ts`), but the transport rules still apply to any thinking/reasoning model.
- **llama-server `:8090`: always `stream: true`**, assemble `choices[0].delta.content` from SSE until `[DONE]`, 90 s timeout. With `stream:false` a thinking model spends `max_tokens` on `reasoning_content` and returns empty `content` with `finish_reason:"length"`. Streaming also enables `cache_prompt` KV reuse.
- **Ollama `:11434`: always `think:false`** (`/api/chat`, `stream:false`, `num_predict:200`, read `message.content`), 60 s timeout.
- **`batch=1`:** one completion at a time; concurrent requests queue and the first `AbortSignal.timeout` fires before queued ones start.
- **Normalize `OLLAMA_HOST`:** `0.0.0.0` is not connectable; replace with `127.0.0.1` and default the port to 11434.

---

## Post-Audit Alignment (May 3, 2026) — condensed (full text archived 2026-10-03)

Verbatim original (8-tier inference cascade, TurboQuant fork build instructions, TURBO_PROFILE table, TurboQuant paper summary, ACE scoring spine, A2A/MCP/ACP wiring, `using` examples): `docs/archive/claude-md-legacy-reference-2026-10-03.md`; full compiler doc `sveltekit-frontend/scripts/docs/compiler-stack-explainer.md`. Standing facts:
- **Compiler stack:** tsgo = CPU type-graph traversal (no GPU); `tensorrt_bridge.node` = LibTorch cuBLAS on the RTX 3060 Ti; WASM SIMD128 is browser last-resort. ioredis: `setex` lowercase, `.quit()`.
- **KV cache policy (llama-server):** production-stable `-ctk q8_0 -ctv q8_0`; TurboQuant `-ctk q8_0 -ctv turbo3` only on a TurboQuant-enabled binary and only after the stability harness passes (`npm run turbo:test:stability:turbo`, server must already be running); avoid symmetric `-ctk turbo3 -ctv turbo4`. Flash Attention (`-fa on`) is mandatory for quantized KV. Gemma-4-class `head_dim` 256/512 needs a fork with D=256/512 kernels (the `test1111…/llama-cpp-turboquant-gemma4` source build); TheTom's D=128-only prebuilts crash or emit garbage on Gemma 4. The launcher `-h` probe cannot detect head-dim incompatibility.
- **`TURBO_PROFILE`** (`scripts/launch-turboquant.ps1`): `stock` (q8_0/q8_0, default), `turboquant` (q8_0/turbo3), `turboquant-safe` (q8_0/q8_0 with larger ctx); `TURBO_KV_K`/`TURBO_KV_V` override; invalid profile or disallowed cache type throws; a `turbo*` profile on a binary without turbo support throws (no silent downgrade). Daily default `turboquant-safe`, `TURBO_CTX=65536`.
- **TurboQuant is a manual runtime milestone** — do not block ACE/KAG/hypergraph retrieval work on it.
- **ACE scoring spine (verified weights):** `semantic_vector×0.60 + tag×0.12 + ast_graph×0.10 + som_boost×0.08 + hyperedge×0.10` (+ community context preamble, not scored inline).
- **Live surfaces:** A2A card `GET /.well-known/agent.json`; `POST /api/ai/agent`; MCP `src/mcp/server.ts`; ACP `GET /api/acp/tools`, `POST /api/acp/execute`. TS 5.2+ `using`/`await using` is available (`lib: ["es2025","esnext.disposable"]`).

---

## Graphify/Karpathy Stack (LEGACY / REFERENCE ONLY — May 4, 2026)

3-layer codebase intelligence with `graphify:*` npm aliases over existing scripts:

| Layer | Command | Output | Cost |
|-------|---------|--------|------|
| 1 — Map | `graphify:daily` / `graphify:map` *(legacy alias; real writer is `scripts/index-codebase-fast.mjs`)* | `docs/graph/codebase-graph.json` + `codebase-map.md` + Redis `code:index:*` + `wiki:note:dir:*` | ~3-5s, no GPU |
| 2 — Semantic | `graphify:semantic` / `graphify:topology` | Qdrant `codebase_chunks_768` + hypergraph + Qdrant tags | ~30-60s |
| 3 — Full GPU | `graphify:full` / `graphify:gpu:turbo` | SOM + hypergraph + PageRank + Neo4j + cluster synthesis + ACE plans | ~5-10 min |

**5-pillar smoke**: `npm run smoke:graphify` (read-only, <1s) — checks graph JSON + map.md + Redis fast cache + KAG notes + Qdrant `codebase_chunks_768` + ACE `FAST_AST_SCORE_CAP ≤ 0.07`. Flags: `--strict`, `--no-redis`, `--no-qdrant`.

**Correction (2026-09-28)**: `smoke:graphify` and `graphify:full` (used in the table above) are
confirmed **absent** from both `package.json` files — found by `npm run atlas:audit:startup-tasks`
(new, see the Karpathy section's correction below) and spot-verified by direct `grep`, not just tool
output. Only `smoke:graphify:symbols` exists under a similar name. Not investigated further in this
pass (root-cause/rename target unknown) — treat every command in this Graphify table as unverified
until re-checked against live `package.json`, not just this doc.

**ACE priority order** (verified in `context-assembler.ts`): Qdrant semantic → ACP cross-feed → Redis KAG (cap 0.08) → Redis fast-AST (`FAST_AST_SCORE_CAP = 0.07` named constant) → SOM/hypergraph/PageRank.

**Topo-byte Redis cache (May 5, 2026)**: Stage A0 in `fetchACPKnowledgeResults()` checks `ace:topo:{topoClass}:{queryHash}` (TTL 300s) before ANN. On cache hit, Qdrant is skipped entirely. `TopoPrefilterStats` flows to `ACEContext.retrievalTrace.topoPrefilter`. Implementation: `src/lib/server/cache/topo-candidate-cache.ts`.

**Topology node coloring**: `src/routes/code-intel/topology/+page.svelte` — color mode toggle (topo / node type), legend overlay for classes present in the node set, topo badge in inspector (glyph + label + hex byte).

**Topology 6-tier fallback clusters (May 5, 2026)**: `scripts/project-codebase-topology.mjs` assigns every file a `clusterKey` via a priority ladder — `gpu-kmeans` (confidence 0.90) → `directory-fallback` (0.60, `cluster:dir:<slug>`) → `topo-class-fallback` (0.50) → `kind-fallback` (0.35) → `unclassified` (0.10). Fallback cluster nodes are included in both graph JSONs so all BELONGS_TO_CLUSTER edges are non-dangling. Validator reports **real** (gpu-kmeans) and **total** coverage separately. Do NOT treat fallback clusters as GPU clusters — filter by `clusterSource` before applying authority boosts.

VS Code tasks: `🗺️ Graphify: Daily Map`, `🔎 Graphify: Semantic Index`, `🧠 Graphify: Full ACE Index`, `🏭 Graphify: Full GPU + TurboQuant`, `🩺 Graphify: Smoke (5-pillar health check)`.

---

## Karpathy GPU Authority Blend + Redis ACE Cache (LEGACY / REFERENCE ONLY) — condensed (full text archived 2026-10-03)

Verbatim original (pipeline, Redis key table, embed cascade, auto-fire policy, verification commands): `docs/archive/claude-md-legacy-reference-2026-10-03.md`. Historical blend only; current retrieval ownership is elsewhere.
- **Pipeline** `scripts/atlas/karpathy-gpu-enrich.mjs`: Neo4j top-N → Qdrant 768-d embeddings → `/api/embed` risk probe → `attentionScoreGPU` on raw 768-d → blend `0.4·PR + 0.3·attn + 0.3·authority` → Redis `gpu:karpathy:{scores,summary}` (+ `encoded` only with trained AE weights; the AE is bypassed for attention scoring because untrained Xavier weights saturate tanh).
- **Correct entry point (2026-09-28):** bare `karpathy:gpu` was broken (needs `ATLAS_WORKSPACE_REVISION` + `ATLAS_SOURCE_COHORT_CHECKSUM`). Use `karpathy:gpu:admitted` (`scripts/atlas/run-karpathy-gpu-admitted-v1.mjs`, derives both from the latest COMPLETED `graphify_runs` row and the real candidate set; fails closed with `NO_ADMITTED_WORKSPACE_REVISION`); `karpathy:gpu:dirty`/`:top200` route through it, `karpathy:gpu:dry` is read-only. Live: `gpu:karpathy:scores` 0→190→390 (verified by `HLEN`). Trail: `openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md` (`STARTUP-BITFROST-WARM-DIAGNOSIS-01`).
- **Embeddings never via llama-server `:8090`** (chat-only; returns 501 without `--embeddings`, which OOMs on 8 GB). Cascade: SvelteKit `/api/embed` → direct Ollama.
- **Startup tasks:** `npm run atlas:audit:startup-tasks` finds `.vscode/tasks.json` tasks whose `npm run X` does not exist (4 silent `runOn: folderOpen` failures found then; `startup:ace:detached` and `ace:hit-demand` were later wired — see the current-status note at the top).

---

## Route Test Pairing (G16 — May 4, 2026)

Closes the test-coverage visibility gap: every `+server.ts` without a paired test gets a placeholder stub written to `tests/routes/auto/` (already in vitest include glob).

- Generator: `scripts/generate-route-test-stubs.mjs` (NOT `scripts/tests/...` — duplicate removed)
- npm: `audit:test-stubs` / `audit:test-stubs:dry`
- Filter: `--mutating-only` targets ~355 high-risk POST/PUT/PATCH/DELETE routes
- Stub format: G26 pattern (`@vitest-environment node` + `vi.hoisted` + lazy `beforeEach` import + `it.todo()` for the 3 unimplemented baseline cases + 1 real `401-unauth` assertion)

**Important**: this G16 is *route test pairing*, distinct from the existing G16 audit gate (worker thread coupling) defined earlier in this file. Same name, different scope — don't confuse them in commit messages.

---

## SOM Topology on Neo4j (May 4, 2026)

`directory-summarizer.ts` now persists SOM coords as `HAS_DIRECTORY_SUMMARY` edge properties AND mirrors them on the `DirectorySummary` node:

```cypher
MATCH (c:GPUCluster)-[r:HAS_DIRECTORY_SUMMARY]->(d:DirectorySummary)
WHERE r.somBmuRow = $row AND r.somBmuCol = $col
RETURN d.dir, r.somCluster
```

Closes the audit gap "SOM coords stored in Qdrant but no `HAS_SOM_POSITION` edges in Neo4j; ACE topological boosting underutilized 4D structure". ACE Cypher queries can now filter directory summaries by SOM grid neighborhood.

Coords flow: `DirAuditEntry.somBmuRow/Col/Cluster` → `ingestDirectorySummaries()` → `writeNeo4jEdges()` → SET on both edge `r.*` and node `d.*`.

---

## Bounded Output for VS Code Chat (May 4, 2026)

Prevents `RangeError: Invalid string length` when running long-running audit/agent tasks that emit multi-MB markdown.

Helper: `sveltekit-frontend/scripts/lib/bounded-output.mjs` — `writeBoundedOutput({label, text, root, maxChars, silent})` and `writeSummary({label, summaryLines, fullText})`. Default `MAX_STDOUT_CHARS=12_000`, env-overridable.

Scripts with `--quiet` / `--summary-only` flags:
- `agentic-batch-fix.mjs` (parallel hotspot fix planner)
- `generate-codebase-directory-map.mjs`
- `tests/deep-directory-audit.mjs`

VS Code task pattern: `mkdir -p logs/task-output && node X.mjs --quiet > logs/task-output/X-latest.log 2>&1 && tail -40 logs/task-output/X-latest.log`. `.gitignore` excludes `logs/task-output/` and `logs/*.log`.

NPM scripts: `agent:fix:batch:{quiet,summary}`, `audit:dirs:{quiet,summary}`, `audit:dirs:map:{quiet,summary}`.

---

## Key Lessons (Proven Patterns) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-key-lessons-2026-10-03.md`. Load-bearing rules:
- **Cross-store ID mirroring (Neo4j→Qdrant etc.):** run a cardinality check first (`max(count(*))` per candidate key). A shared field name is not a join key if one side is finer-grained — `path` joined to symbol-level Leiden communities mis-stamped 79,768 Qdrant points (join on `(path, symbol)`; unmatched points stay unset). Do this before the first live apply.
- **Windows CLI entry guard:** never use `import.meta.url === \`file://${process.argv[1]}\`` (never matches on Windows, `main()` silently skipped, exit 0). Use `import { fileURLToPath } from 'node:url'; if (process.argv[1] === fileURLToPath(import.meta.url)) main()`. Verify a new CLI by real output, not exit code.
- **`binding.cc` (`simd-bridge/cpp`):** the `PcaProjectWrapper` body and `Init` have been corrupted by incremental edits — restore the region from git (last clean `0abba595f3`, split line 1091), never patch it piecemeal.
- **Searching gitignored packets/evidence:** `.rgignore` re-includes selected paths (`!path` rules); use `rg --no-ignore` (not `--uu`, removed in rg 14). Env files: `rg --files -g ".env*"`; presence-only audit `npm run env:audit`.
- **OpenCode:** `.opencode/skills/<name>/SKILL.md` = on-demand; `.opencode/command/*.md` = slash commands; `instructions` array = permanent context (never put commands or `.opencode/cards/**` there — `Self-Correction` contamination). Launch llama-server only via `scripts/launch-turboquant.ps1`; daily default `TURBO_PROFILE=turboquant-safe`, `TURBO_CTX=65536`, `-ngl 99 -fa on --cache-prompt --cache-reuse 256`; verify `/slots[0].n_ctx`.
- **ioredis (standalone scripts):** `lazyConnect:true, maxRetriesPerRequest:1, enableOfflineQueue:false, retryStrategy:()=>null`, an `error` listener, `await redis.connect()` before `ping()`; options object (`host/port/password`), never a `REDIS_URL` with a password; never reuse a closed client; long-running server code uses `getRedis()` from `src/lib/server/redis.ts`. ioredis v5: `setex` lowercase, `.quit()`; no `declare module 'ioredis'` augmentation.
- **Valkey** (`valkey/valkey-bundle:8`) replaces Redis Stack with no ioredis change; `ROTORQUANT_KV_ENABLED` is a dead variable — use `TURBO_PROFILE`.
- **Archive, don't delete:** git-diff cold archive (`git tag archive/YYYY-MM-DD/<slug>` then prune) or `docs/archive-manifest.json` with SHA-256; `deeds_labs/` is gitignored = permanent loss. Wiring audit before moving any file (check `from.*module`, root `+layout.svelte`, dynamic imports, barrels, API routes); a file re-exported but never imported downstream is dead, a file with real LokiJS/IndexedDB/Fuse.js code is not.
- **Svelte 5 / SvelteKit:** `$derived.by(() => …)` for blocks (`$derived(() => …)` returns a function); `.js` import extensions (except `import { db } from '$lib/server/db/client'`, no extension); `{@const}` must be a direct child of `{#if}/{#each}`; bits-ui Dialog needs `ssr = false` on routes that render it at SSR; bits-ui v2 uses `child` snippets, `ref`, `type="multiple"`; `throw error(404)` inside try/catch becomes 500 — check not-found outside the try; runes only work in `.svelte`/`.svelte.ts`; global `$state` leaks across SSR requests (use `event.locals`); start the dev server with `npm run dev` (sets `DEV_BYPASS_AUTH`), not `npx vite dev`; `@lucide/svelte` is removed — use `<Icon name="…" />`.
- **Data/infra:** Drizzle cannot express GIN trgm / HNSW indexes — add them in a numbered `drizzle/0NNN_*.sql`; use `drizzle/manual/*.sql` with `IF NOT EXISTS` when `migrate` fails; keyset pagination `(score DESC, id DESC)`, never OFFSET; pg_trgm DYM `similarity() > 0.25` with a GIN trgm index; Qdrant filters need `match: { value: v }`; CouchDB `put(db,id,doc)`/`post(db,doc)`, no `find`; amqplib via dynamic `import()` with local interfaces; XState v5 `fromPromise` casts `ctx.input` inside; `pgvector` imports come from `drizzle-orm/pg-core`; Docker VHDX never shrinks on Windows 10 (`wsl --shutdown` then diskpart `compact vdisk`, Admin).
- **Models:** `gemma4-rotorquant:latest` serves VLM text+vision (no VRAM swap on 8 GB); stock `gemma4:e4b-it-q4_K_M` has no legal fine-tune. ES2025 (`Promise.withResolvers`, iterator helpers, Set methods, `Object.groupBy`) is usable now; UnoCSS `presetUno()` is soft-deprecated (no urgency); gRPC port 50055 collides (CHR97 vs go-search-service).


---

## TypeScript 7 Native-Preview Lane (May 5, 2026) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-small-refs-2026-10-03.md`. `tsgo` (`@typescript/native-preview`, Go compiler) is a parallel audit lane — it does NOT replace `tsc`/`svelte-check`/the `typescript` package (stable programmatic API not expected before 7.1; `package-lock.json` is gitignored so re-run `npm install` after pulling). Scripts: `typecheck:native[:pretty|:nightly]`, `audit:tsgo`, `audit:tsgo:json` (writes `scratch/audits/tsgo-diagnostics.json` via `scripts/tsgo-diagnostics-to-jsonb.mjs`, stable_key = sha1 of file:line:col:code:msg, feeding `metadata_envelopes`/`code_relations`/`ace_context_sources`). CI keeps `svelte-check`.

---

## AGENTS.md Relationship Spine (May 5, 2026) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-small-refs-2026-10-03.md`. Three Postgres tables (`drizzle/manual/agents_md_relations.sql`) back the path-first AGENTS.md memory bank: `agent_context_files` (parsed envelope: rules/tools/constraints JSONB, tags, `content_hash`, `schema_version`), `directory_context_bindings` (walk-up resolution: exact / nearest-parent / inherited / override with depth, priority, confidence), `ace_context_sources` (audit trail; powers `yorha.agentsMdFiles`). Code in `src/lib/server/agents-md/`: `schema.ts` (Zod envelope), `parse-agents-md.ts` (pure, lenient extraction), `resolve-directory-context.ts` (pure walk-up resolver; matches direct path, `agents:<file>`, or the live Redis `agents:dir:<dir>` form). Tests: `tests/agents-md-relations.spec.ts` (7).

---

## OpenAI-Compatible v1 Facade (May 5, 2026)

OpenWebUI / Continue / Cursor / Aider can now talk to the YorHA agent brain via standard OpenAI-shape requests. Routes the request through ACE/KAG/RAG context-assembler + code-llm-index PRIOR ANSWER cache + bifrostChat cascade before returning.

**Endpoints**:
- `POST /api/v1/chat/completions` — chat (stream:false v1; streaming follow-up)
- `GET  /api/v1/models` — model list for client dropdowns

**OpenWebUI wiring**:
```
Connections → Add Provider →
  Base URL: http://localhost:5173/api/v1
  API Key:  any-non-empty-string  (real auth via session cookie)
```

Available models: `yorha-legal`, `yorha-fast`, `gemma4-rotorquant:latest`, `gemma3-legal`, `gemma3:270m`. Friendly IDs map to internal Ollama tags via `resolveInternalModel()`.

**YorHA-only request extensions** (ignored by stock OpenAI clients):
- `file_path` — triggers nes-arch AGENTS.md preflight + same-dir rerank boost
- `case_id` — case-scoped RAG retrieval
- `raw: true` — skip ACE entirely and call the standard Bifrost model path directly (model-layer benchmarking)

**Response includes a `yorha` block alongside `choices`** — transparency about which caches and sources fed the answer:
```json
"yorha": {
  "aceUsed": true,
  "contextChunks": 7,
  "agentsMd": true,
  "codeLlmHit": true,
  "cacheHit": "prior-answer",   // or "agents-md" or "none"
  "durationMs": 1247
}
```

**Tests**: `tests/openai-facade.spec.ts` — 7 tests (message split, raw passthrough, cacheHit reporting, 401/400 contracts).

**Skipped for v1**:
- `stream: true` — explicit 400 with `code: "streaming_not_supported"`. Follow-up wires bifrostChat's existing SSE path.
- `tools` / `tool_choice` — accepted but ignored. Use `/api/ai/agent` for tool loops.

---

## Reconstruction 3-Track Architecture (May 8, 2026) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-legacy-reference-2026-10-03.md`; design detail `memory/reconstruction-3-tracks.md`. Tracks: (1) model layer per llama-server binary, (2) ComfyUI HTTP keyframes (never shell out to Python; RabbitMQ `comfyui.render`), (3) 3D lanes built in order A 2D timeline viewer → B ComfyUI stills → C Blender+Mixamo MP4 → D WebGPU low-poly viewer → E Gaussian-splat environments only. Hard gates:
- LLM is planner, compiler is renderer: models emit Zod-validated `SceneIntent` JSON only; a deterministic TypeScript compiler renders. Same input → same render.
- Every output carries "Demonstrative reconstruction — not original footage", per-event confidence, evidence IDs, disputed-fact highlights. No generative video for evidence. Stylized (PS1/N64) environments are the admissibility hedge; evidence meshes are not jittered.
- Chain of custody on every 3D asset (SHA-256, `evidence_3d_assets`); no GPU/3D work on the Node main thread (Python sidecars on RabbitMQ `scene.render`, `evidence.render`, `scene.export`); export bundles SHA-256-verifiable.
- ~70% of the renderer exists (`src/lib/courtroom/`, `/demos/crime-reconstruction`, `courtroom_models`/`courtroom_animations`, `src/lib/components/detective/*`) — don't rebuild. Missing: SceneIntent schema, deterministic compiler, TRELLIS pipeline, Mixamo registry, queues, export ZIP.

---

## Reference Docs

- `docs/architecture/phase-101-completion-plan.md` — **Phase 101 completion plan** (2026-06-02): 7-block, 8-10h plan — git-diff cold archive, promotion boundary, schema migrations, Gemma4 task summaries, Valkey swap, Omni-Worker scaffold, OpenCode Kanban. Run order and verification gates included.
- `docs/ai-os/opencode-context-window.md` — OpenCode context window config (2026-06-02): two-cap problem (server `-c` + client `contextLength`), `/slots` endpoint explained, `ROTORQUANT_KV_ENABLED` is a dead var, model path fix in `.env`.
- `docs/architecture/retrieval-layer-separation.md` — **Three-layer retrieval separation** (2026-06-02): Orchestrator → Search Contract → Backend Implementation. Hard rule: callers never call QdrantManager directly; all ANN retrieval enters through `retrieval/orchestrator.ts` or `search/qdrant-search.ts:searchCodebaseAnn()`. TurboVec is additive (rerank + prefilter), not a Qdrant replacement. cuVS/IVF seam is ready in Layer 3.
- `sveltekit-frontend/docs/architecture/trace-runtime-split.md` — TRACE/Karpathy runtime boundary rule (llama-server/Gemma4 → MCP only, never raw infra)
- `sveltekit-frontend/docs/architecture/trace-kag-web-development-guide.md` — 23-section practical guide (route contract, retrieval lane decision tree, Admin Copilot safety, browser context lane, RabbitMQ/sidecar rules, production safety gates)
- `sveltekit-frontend/docs/architecture/hermes-agent-windows-gemma4-guide.md` — Hermes Agent + WSL2 + local Gemma4 integration (allowlist/blocklist of TRACE tools, port reconciliation, TurboQuant Gemma4 binary caveat)
- `sveltekit-frontend/memory/architecture/mcp-mount-smoke-2026-05-09.md` — post-restart MCP mount + smoke verification log (live `tools/list`: 42 tools after the per-request transport fix; 5 registries silent-failing — adminTools/skillTools/codebaseTools/bifrostTools/topologyMgmtTools; G33/G34/G37 green; G38 referenced in trace-runtime-split rule #8; Phase D hooks deferred)
- `memory/reconstruction-3-tracks.md` — model/image/3D pipeline architecture, build order, Qwen TurboQuant fit, ComfyUI HTTP wiring, Gaussian-splat scope
- `memory/drizzle-schema-reference.md` — 70+ tables, 14 enums, type patterns, route map
- `memory/architecture-reference.md` — DB tiers, JSONB, caching strategy, vector search
- `memory/docker-cuda-setup.md` — Docker, CUDA, GPU acceleration, FlashAttention
- `memory/corruption-patterns.md` — All 8 corruption patterns + detection commands
- `memory/superforms-reference.md` — Superforms v2 full API patterns
- `memory/ide-linter-workarounds.md` — VS Code linter revert strategies
- `memory/session-history.md` — Full session-by-session changelog (sessions 1-35)
- `memory/svelte5-migration-guide.md` — Store → runes patterns, do's/don'ts, XState v5
- `memory/docker-sveltekit.md` — Docker SSR deployment, Dockerfile, docker-compose
- `tests/e2e/*.spec.ts` — Playwright visual regression / 500-error tester (uses `page.screenshot()`)

## OpenCode + llama-server Config — Validated Shape (June 2026) — condensed (full text archived 2026-10-03)

Verbatim original (launch flags, sanity curl, `opencode.jsonc` model block, TRACE transport JSON): `docs/archive/claude-md-ops-incidents-2026-10-03.md`. Model identity (Gemma4 alias) is historical; the process rules stand.
- **Chat template:** keep `--chat-template-file configs/templates/custom_pub_chat_template_gemma4.jinja` (the launcher's `$defaultTemplate`; `gemma4-opencode.jinja` is the wrong one, `supports_tools:false`), `--jinja --reasoning-format none`, `-c 65536 -ngl 99 -fa on -ctk q8_0 -ctv q8_0 --cache-prompt --cache-reuse 256`. Do NOT pass `--chat-template gemma|gemma3`, `--reasoning auto` or `--reasoning-budget 0`. `TURBO_CHAT_TEMPLATE_FILE` overrides (`none` skips). After any restart `/props` must show `supports_system_role:true, supports_tool_calls:true`; sanity-check with a system-role "Reply exactly: SYSTEM_OK" request (a "gemma3.5-27-g…" reply means a named template was passed).
- **`opencode.jsonc` model block:** `tools:true`, `limit.context`/`limit.output` (not `contextLength`), model key must match `/v1/models` id exactly.
- **TRACE MCP transport:** stateless `StreamableHTTPServerTransport`; `GET /mcp` → `405 Allow: POST`; config `{ type:"remote", url:"http://127.0.0.1:8788/mcp", headers:{ Accept:"application/json, text/event-stream" } }`.
- **Instruction pollution guard:** `instructions` may list only `.opencode/system.md` and `AGENTS.md`; never `.opencode/cards/**`, `TOC.md`, audit reports or transcripts (`Self-Correction` contamination: `rg "Self-Correction" .opencode/`).

---

## OpenCode / Memory Authority

- `MASTER-FEATURE-TODO-2026-05-20.md` is the master phase plan for lane completion and backlog tracking.
- `docs/agents-md-howto.md` is the directory-scoped agent guide; use it as the source of truth for per-folder instructions.
- OpenCode startup should flow through `scripts/opencode/bootstrap-workspace.mjs` and the startup artifacts it writes:
  - `.opencode/startup-context.json`
  - `.tmp/claude-mem-ensure.json`
  - `reports/claude-mem-startup.md`
- Tie OpenCode memory to Engram through:
  - `sveltekit-frontend/src/lib/server/memory/engram-memory.ts`
  - `sveltekit-frontend/src/lib/server/ai/engram-registry.ts`
  - `sveltekit-frontend/src/lib/gpu/nes-memory-architecture.ts`
  - `scripts/atlas/sync-engram-memory.mjs`
  - `scripts/atlas/engram-plugin-adapter.mjs`
- Use the repo-local memory bridge scripts rather than hand-stuffing prompt context:
  - `scripts/opencode/post-memory.mjs`
  - `scripts/opencode/monitor-claude-mem-poll.mjs`
  - `scripts/memory/import-claude-mem-observations.mjs`
- Important caveat: the local `claude-mem` plugin cache patch is cache-only. If the plugin is reinstalled or upgraded, recheck the local bundle for the `zod/v3` compatibility fix before trusting the hooks.

## Canonical Lineage Contract (June 13, 2026)

**One contract. Every store agrees. No partial joins.** Postgres rows, Qdrant payloads, Redis keys, Neo4j nodes, cold-storage manifests, and the Rust N-API parser use the SAME field names with the SAME meaning. Stops the historical drift of `packet_id` vs `qdrant_point_id` vs `redis_centroid`.

### The chain (every packet, every store)

```
directory_path → source_ref → file_path → function_symbol → feature_id → feature_label
   → packet_key → summary → qdrant_point_id → redis_key → cold_storage_manifest
```

### Canonical packet shape

```json
{
  "directory_path": "src/lib/server",
  "source_ref": "src/lib/server/auth.ts",
  "file_path": "src/lib/server/auth.ts",
  "function_symbol": "validateSession",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "packet_key": "ace:packet:auth:001",
  "summary": "Handles Lucia session validation.",
  "embedding":    { "model": "embeddinggemma", "dim": 768, "qdrant_point_id": "qdrant:auth:001" },
  "cache":        { "redis_key": "bifrost:packet:auth:001", "centroid_key": "centroid:feature:auth.sessions" },
  "cold_storage": { "manifest_id": "manifest:auth:001", "uri": null, "restore_verified": false }
}
```

### Hard gate
`node scripts/atlas/verify-feature-lineage.mjs` — must return `pass: true` with all `missing_*`/`orphan_*`/`mismatched_*` counters at 0.

### Mirror tables (Postgres 18 = canonical truth)
- `atlas_directories` — directory_path metadata
- `atlas_source_refs` — source_ref → file_path, function_symbol, feature_id
- `atlas_feature_labels` — feature_id → feature_label, community_id, domain_class
- `atlas_packets` — packet_key + every field above
- `atlas_cold_storage_manifest` — manifest_id → seaweedfs_uri, restore_verified

### Qdrant payload (must include)
`directory_path`, `source_ref`, `file_path`, `feature_id`, `feature_label`, `packet_key`, `packet_type`, `cold_storage_uri`.

### Redis / Bifrost key pattern
```
bifrost:packet:{packet_key}
centroid:directory:{hash}
centroid:feature:{feature_id}
centroid:packet:{packet_key}
```

### Cold-storage rule
No delete, no archive, no move until `restore_verified == true`.

### Canonical operator order
```
Storage & Lineage → BM25 → Concept extraction → Qdrant payload filter →
Qdrant HNSW ANN → TurboVec.Search (Stage 1.5) → Neo4j USED_CONCEPT →
XGBoost Stage 4 → Redis/Bifrost → HyperRAG Packet RPC → QLoRA export
```

**Deferred** (do NOT block the contract): AE 768→64, SOM 20×20 (routing only — NOT search), Native GEMM, RL policy/GAN, Gemma4 planner training, GpJSON, RAPIDS, ClickHouse.

### `.pt` model boundary
A `.pt` is a learned transform, NOT a language model and NOT the database. SvelteKit calls a Python worker over HTTP; the `.pt` stays in Python/WSL/CUDA. The `.pt` produces values; Postgres indexes those values (`latent_64 vector(64)`, `som_cell_x int`, `cluster_id int`, `rerank_score real`, `policy_hint jsonb`).

Four useful kinds — keep them straight:
- `packet_autoencoder.pt` — 768 → 64 latent compression (build this first)
- `reranker.pt` — query↔packet relevance
- `policy.pt` — next tool/action selector (Stage 5)
- `graph_model.pt` — traversal edge prediction

**XGBoost is NOT a `.pt`** — it serializes to `.ubj` / `.json` / `.pkl`. Don't conflate.

## Parent Atlas Lineage & Synthesis Rules
- **Task Joins**: `task_semantic_packets` currently joins safely by `feature_id`.
- **Mixed Source Refs**: `source_ref` values are mixed and can represent:
  - Real file references (e.g., `src/lib/...`)
  - Task references (e.g., `task:123`)
  - Feature aggregation references (e.g., `feature:auth`, `feature:ui`)
- **Synthesis Separation**: `atlas_feature_synthesis` is a feature-level aggregation table.
- **Lineage Integrity**: `atlas_source_ref_synthesis` must not trust `feature:*` as file paths.

---

## 🔒 AGENT EXECUTION INTEGRITY — EVIDENCE RULES (July 28, 2026) — condensed (full text archived 2026-10-03)

Verbatim original (TypeScript contracts `AgentClaimV1`, `ToolUsageEventV1`, `EditProofV1`, `OwnershipLaneResultV1`, violation codes, corrected Session 148 example): `docs/archive/claude-md-status-and-governance-2026-10-03.md`. Prevents evidence laundering (a tool fails, the agent claims success, status gets promoted from comments, a 0/0 audit is reframed as "complete").
- **No claim without tool evidence:** a claim of FILE_CREATED/UPDATED, TEST_PASSED, LANE_PROVEN or TASK_COMPLETE must cite tool-call IDs; no supporting events → `CLAIM_WITHOUT_TOOL_EVIDENCE`; a `FAILED_TERMINAL` supporting tool → `CLAIM_DEPENDS_ON_FAILED_TOOL`.
- **Edit proof:** an edit is proven only if the tool succeeded, `afterHash` exists and differs from `beforeHash`, and a diff ref exists. The model saying "updated" is never evidence.
- **Lane status vocabulary (observable only):** `ABSENT, PRESENT, STATICALLY_REFERENCED, FIXTURE_PROVEN, RUNTIME_SMOKE_PROVEN, PARTIAL_PROVEN, CROSS_STORE_PROVEN, CONFLICTING, BLOCKED`. Forbidden: bare `WIRED`, percentage scores ("35/40", "87.5%"), theoretical maximums, comments as evidence, promotion without proof. Report counts per status, e.g. "2 PRESENT, 3 STATICALLY_REFERENCED, 1 PARTIAL_PROVEN, 2 NOT_PROVEN".
- **Violation codes to emit (priority CRITICAL):** `EDIT_CLAIM_WITHOUT_EDIT_PROOF`, `AUDIT_STATUS_FORCED_WITHOUT_EVIDENCE`, `COMPLETION_CLAIM_CONTRADICTS_AUDIT`, `PROPOSED_ASSUME_SUCCESS_PATCH`, `CLAIM_DEPENDS_ON_FAILED_TOOL`.
- **Governance:** tools produce observable facts → deterministic audit code validates → the model summarizes and suggests → OpenSpec governs contracts → GSD executes accepted work → ACE carries only bounded active context. No model promotes its own unverified claims; a NOT_PROVEN lane stays NOT_PROVEN until a proof level is reached; record tool events before summarizing.
- **Next milestone `ONE_ENTITY_ENRICHMENT_TRACE_PROVEN`:** pick one real `packet_key` and prove it across Postgres (key + content hash + workspace revision) → Qdrant (same key, dims, revision) → Neo4j (SOM cell ≠ KMeans cluster ≠ PageRank) → Redis (policy executed after Postgres commit) → HyperRAG (same key) → ACE (key + evidence lineage preserved), recording an immutable result per step.

---

## Parent Atlas current identity and retrieval alignment (2026-08-31) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-status-and-governance-2026-10-03.md`. Policy projection, not a new identity authority.
- **Flow:** source bytes + workspace revision → Tree-sitter CST / ast-grep observations → `stableSymbolId`/`symbolVersionId`/`treeNodeId` evidence → PostgreSQL chunk/feature identity → `semantic_768` vector → Qdrant / Go Retrieval / GPU projections → CandidateOrdinal normalization → SearchRuntime fusion → ACE cards → ContextManifest → synthesis.
- **Mirrors carry** `sourceRef`, `sourceRevision`, `workspaceRevision`, representation/revision metadata and an evidence/projection checksum; AST/CST, ast-grep, SearXNG enrichment, NLP, RPC packets and Go Retrieval never mint identity or own final fusion. Go Retrieval is a read-only executor normalized to the same CandidateOrdinal universe. SearXNG results are external evidence (keep provider URL/title/snippet/published metadata and fetch provenance; search rank is not relevance or identity).
- **Qdrant:** named vectors are representation slots, not separate votes (`content` = semantic_768; MRL/latent stay challengers). Point IDs are deterministic and mapped to PostgreSQL identity; index UUID-valued payloads as UUID only when they are UUIDs, `candidateOrdinal` as integer, `packetKey`/`sourceRef` as keyword; filters run before ANN; keep the point-ID mapping manifest across projection generations. **Warning (2026-08-31):** 15 duplicate same-collection targets in the canary and 5,634 duplicate PostgreSQL mappings in full `codebase_chunks_768`; `_v2` lacked the canary rows — no cutover/delete until an exact CandidateOrdinal/lineage map and blue/green alias readback are proven.
- **Synthesis boundary:** retrieval → filtering/reranking → canonical ACE context → ContextManifest → bounded Ornith synthesis. Raw hits never go to the model; Ornith never receives or persists hidden thoughts, KV cache or tensor state. Fetch helpers validate bounded params and preserve request/revision checksums, source spans and ordinals.
- **JSON/bits/mmap/GPU:** JSON/JSONL only for control envelopes, receipts, metadata; bulk arrays are raw F32LE mmap or Arrow IPC. Bitmaps select CandidateOrdinals (record bit-width, endianness, layout revision, checksum). RTX PyTorch/ATen is the numerical executor; TypeScript owns descriptors, lineage, admission, receipts. Never persist hidden reasoning, KV cache or arbitrary tensor snapshots in Redis/Valkey/IndexedDB/Qdrant. A GPU result is promotion-eligible only after CPU-reference parity on ordering, availability masks, dimensions, checksums and bounded tolerance.

---

## Neural Decoder Container + PyTorch/CUDA Pin Reference (2026-08-31) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-ops-incidents-2026-10-03.md`; trail `openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md` (`DECODER-CONTAINER-01`, `PREFILL-CALLER-01`).
- **Service:** `atlas-neural-decoder` in `docker/docker-compose.gpu.yml` (profile `atlas-gpu`), Dockerfile `docker/atlas-neural-decoder/Dockerfile`, port `8121` (`NEURAL_DECODER_URL`), checkpoint mount `../models/nested-semantic-autoencoder:/models/nested-semantic-autoencoder:ro`, ~200 MB VRAM. Base image `pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime` pinned by tag and digest. Live-proven: 768-d encode on `cuda`, checksums match. `status:"degraded"` before the first encode just means the lazy model is not loaded.
- **Versions:** `torch 2.8.0+cu128` in old proof logs is deprecated (PyTorch 2.12 dropped CUDA 12.8); CUDA 13.0 is the pip-wheel stable tier, 13.2 ships via maintainer Docker images (cuTile is stable on sm_8.x from 13.2; this host is sm_86). Verify live (`docker buildx imagetools inspect` + web search) before pinning any new PyTorch/CUDA base image.
- **Packaging gotcha:** the service imports `atlas_compute.latent_autoencoder`, but the real `python/atlas_compute/__init__.py` eagerly imports RAPIDS modules that a plain PyTorch image lacks. Copy only `latent_autoencoder.py` (self-contained) plus a build-time empty `__init__.py`; never copy the real package init or edit it to work around this. The image is PEP-668 "externally managed" — `pip install --break-system-packages` is acceptable in this single-purpose container.

## UUID version policy for Parent Atlas identity and indexes (2026-09-16) — condensed (full text archived 2026-10-03)

Verbatim original: `docs/archive/claude-md-status-and-governance-2026-10-03.md`. Use UUID versions by lifecycle role; never let a UUID replace canonical `packet_key`, `source_ref`, source digest or revision identity.
- **v4** (`crypto.randomUUID()`): random operational IDs (requests, traces, temp jobs). **v5**: deterministic name-based lookup key from a frozen namespace (`PACKET_AGGREGATE_NAMESPACE_V1` for derived packet-index matching) — never authorizes an upsert. **v7**: time-ordered IDs for new durable events/batches; does not identify source bytes or reconcile legacy namespaces. **v8**: only after bit layout, namespace, checksum and replay semantics are frozen (deterministic SHA-256-derived helper in `src/lib/utils/uuid.ts`). RFC 9562 is the reference. ULID/UUIDv5 are compatibility formats unless a persisted contract proves otherwise.
- **Indexes (YAML/JQ/JSONL, DuckDB, Redis, Qdrant):** keep field types (UUID as UUID, `packet_key` as text, `sha256:<64 hex>` as text). A UUIDv5 match is admissible only after exact equality of `packet_key`, `source_ref`, `workspace_revision`, `source_revision` and the whole-source digest; same key with different canonical fields = identity collision, fail closed. Manifests record the algorithm, namespace, name input and `canonicalIdentity:false`.
- **Binary/hash facts:** SHA-256 hashes exact source bytes (no re-decoded/normalized/reserialized text); canonical text form `sha256:<64 lowercase hex>`. `file_content_hash` (whole source) and `codebase_chunk_index.content_hash` (chunk) are different grains. Keep `workspace_revision`, `source_revision`, `representation_revision`, `feature_revision` as separate namespaces; never coerce a SHA-256 revision to a legacy integer such as `0`.
- **Lineage:** immutable snapshot → Graphify `execution_id` → `source_ref` + `source_revision` + source-byte digest → `packet_key` + `binding_checksum` → packet→chunk lineage → `representation_revision` → ACE/Qdrant/graph/GPU projections. Upserts are idempotent only on exact match of every identity/digest field; historical nullable rows are observable but not promotion-eligible; every promotion needs transaction readback, checksum evidence and `writesPerformed` status. PostgreSQL stays canonical; everything else is derived.

### Classification gates everything downstream; matching is approximate, identity is exact (2026-09-20)

**Operator direction:** classification must be finished under its OpenSpecs before file analysis, top-k, KMeans/KNN clustering, query fanout, document analysis, recommendations, the kanban task board, the feature matrix and the cache — all depend on it. Matching does not have to be exact; no ranker is 100%.

**How to apply that without weakening the contracts:** classification, symbol matching and ranking are probabilistic lanes, judged by recall@k / precision / ECE on a reviewed set, with a caller-supplied confidence floor and fail-closed routing. Identity stays exact: `source_revision`, whole-source vs chunk digests, `UTF8_PARSER_BUFFER_V1` spans, `packet_key`, `CandidateOrdinalMap` and cache keys never become fuzzy or inferred.

**Owners (do not add a second):** offline sklearn NB+LR trainer `python/train_domain_classifier.py`; read-only FastAPI seam `python/atlas_nlp_classification_helper_v1.py`; `:8095` sidecar `miniforge_nlp_sidecar_v2.py` (evidence executor only); TRACE `domain.classify` (provisional); ast-grep/Tree-sitter helpers under `scripts/atlas/lib/` (TS/JS only). No PyTorch logistic-regression trainer exists; one would be a challenger behind the sklearn baseline, only after a reviewed set exists. OpenSpec state (checked/open): search-classifier-sidecar 70/16, workstation-domain-classifier 115/26, query-routing-classifier 41/57, unified-symbol-ranking 17/0. Full detail and dependency order: `openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md` (`CLASSIFICATION-GATE-01`).

### Read-only OpenSpec audit parallelism and acceleration policy

- The portfolio runner may use a bounded multi-process CPU stage pool only for independent readers of one frozen census. Its default concurrency is two and its hard cap is three; set `OPENSPEC_EVIDENCE_MAX_CONCURRENT_STAGES=1` for serial replay. Do not increase concurrency without checking peak RSS and repeat-run stability.
- Keep parser → independent census readers → dependent receipt binding/reconciliation/cards/workboard/final authority ordering explicit. Pooled stages require unique run-scoped outputs and identical run/census identity; any failure blocks downstream stages and final authority.
- Do not add Redis/Valkey caching or GPU acceleration to Markdown/JSON parsing by default. Cache only measured, rebuildable intermediates, keyed by workspace revision, exact input checksums, parser/schema revision, and output checksum. A cache hit is never evidence or proof.
- Reserve GPU executors for measured numerical kernels (e.g. qualified sparse graph ranking or dense feature matrices), with CPU-oracle parity and executor receipts. GPU is not a filesystem scanner or report-authority mechanism.

**Domain review sheet + rules (2026-09-20):** `node scripts/atlas/build-domain-review-sheet-v1.mjs` builds an offline searchable review page `docs/reports/domain-review-sheet-v1.html` (blind mode, localStorage autosave, JSONL export the eval harness reads via `python python/atlas_domain_classifier_eval_v1.py --input <file>`). Labeling rules: judge primary responsibility from the path/file (the LLM evidence text is not truth); one of the 13 top-level `atlas_domain_ontology` groups; `AMBIGUOUS` / `NOT_A_DOMAIN` / `SKIP` are counted, never gold; second reviewer on >=10%. Trust floor 200 reviewed rows AND 30 per class; the 49 revision-qualified rows are far short (largest class 11; machine-learning, compiler, error-handling have 0), and closing that depends on CURRENT_SOURCE_AUTHORITY_PROVEN, not on labelling alone. Report Tier A (revision-qualified) and Tier B (unresolved-revision, evaluation only) separately.

**Searching gitignored evidence (2026-09-20):** files over 10 MB cannot enter git (hook), so the AST/classification evidence lives under gitignored `.tmp/atlas/` and `*.jsonl`. `.rgignore` re-includes a selected set so a plain `rg` from the repo root finds them (draft/reviewed domain JSONL, AST candidates, canary-eligible rows, source-authority cohort, symbol nominations/resolution, knowledge snapshot). Test from the repo ROOT: searching inside an ignored directory bypasses ignore rules and gives a false pass. Searchable is not authoritative; regenerate before citing.
