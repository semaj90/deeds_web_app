# CLAUDE.md status and governance sections — archived verbatim 2026-10-03

Source: root CLAUDE.md. Condensed rules were kept in place; these are the original full texts.

## Current runtime and ACE/BitFrost status (2026-09-28; supersedes stale July status below)

- **Current semantic storage contract (2026-09-27 correction):** the active PostgreSQL
  `semantic_768` physical owner is `codebase_chunk_index.content_embedding_768` (`vector(768)`), per
  the current repository instructions. `semantic-representation-v1.ts` and its receipts retain
  their historical `content_embedding` (`halfvec(768)`) coordinate; new bindings use the additive
  V2 contract. Physical presence in either column does not prove source, tokenizer, model, or
  representation lineage. Do not rewrite historical receipts or treat the old readiness audit as
  proof for the V2 owner.
- **Native Windows CUDA/LibTorch startup build (2026-09-27):** the reviewed forced rebuild of
  `tensorrt_bridge.node` completed configure, compile/link, addon-existence, and GPU-load probing
  successfully on the existing RTX 3060 Ti / sm_86 lane using CUDA 13.0.48 and LibTorch
  `2.9.0+cu130`. `scripts/startup/build-cuda-libtorch-on-startup.mjs` now reports the distinct
  `CONFIGURE_OK`, `BUILD_OK`, `ADDON_EXISTS`, and `PROBE_EXIT_OK` stages, and its inline probe exits
  explicitly after checking CUDA availability. This resolves the reported stale-invocation failure
  for that existing lane; it is not a CUDA 13.4/TensorRT-RTX build, a 13.2.2 migration, or proof of
  production inference. Keep those challenger/migration decisions separate and preserve the
  working CUDA 13.0 + cu130 path.

- **Synthesis/tool-use model:** Ornith 1.5 9B on llama-server `:8090`; resolve its active model
  through the runtime model resolver. Ornith is not the semantic embedding writer. TRACE MCP has a
  separate startup task (`:8788`); it is not part of `graphify:daily:chain`. The checked-in MCP
  configs do not register a Docker MCP server. Do not expose generic `shell.run` or Docker control
  to the model; keep operations typed and governed.
- **Bifrost != BitFrost:** Bifrost is the inference/MCP gateway. BitFrost is the disposable
  Valkey-backed residency/cache policy. A `gpu:karpathy:*` cache write or a healthy Bifrost service
  is not proof that revision-qualified ACE packets were admitted to BitFrost.
- **Daily Graphify and TRACE MCP are separate startup paths:**
  `sveltekit-frontend/package.json` defines `graphify:daily:chain` as an apply sequence ending in
  `scripts/atlas/graphify-daily-ace-packet-step-v1.mjs`. The root startup wrapper runs the
  projection-admission gate before that apply chain; while admission is `NOT_SAFE_TO_PROJECT`, it
  fails closed before the chain mutates projections. The final ACE step itself only repeats the
  gate, performs a read-only eligible-packet count, and writes a local receipt; it does no
  Postgres/Qdrant/Valkey packet writes and reports `PACKET_COMPOSITION_NOT_WIRED`. TRACE MCP starts
  independently on its own task. A successful Graphify or TRACE startup is not an ACE packet/cache
  promotion receipt.
- **ACE incremental startup is manual, not folder-open automation:** the existing
  `sveltekit-frontend/scripts/startup/ace-incremental-startup.mjs` and
  `config/startup-ace-policy.json` are real, but the orchestrator can run indexing/graph/cache
  operations, spawn services, and prune stale PostgreSQL rows. Its `startup:ace:detached` alias is
  now wired for an explicit operator-requested VS Code task; the task no longer runs automatically
  on folder open or as a prerequisite of the Atlas smoke. The four previously reported silent
  folder-open script failures are therefore resolved as three aliases plus this manual-only
  reclassification—not by enabling a broad mutating startup chain.
- **Hit-demand is implemented, but is not semantic/token-cache warming:** the
  `ace:hit-demand` and `ace:hit-demand:dry` npm aliases point to the existing
  `sveltekit-frontend/scripts/seed-hit-demand.mjs`; `context-for-file.ts::loadHitDemand()` consumes
  its `{hits, hot_score, last_hit_at, avg_rerank}` values. The apply script aggregates recent
  `chunk_hit_log` rows by normalized relative path and atomically replaces Redis
  `ace:rank:demand` (one-hour TTL; a separate 24-hour high-water mark). The folder-open task can
  therefore make a real Redis write. This is a coarse demand-ranking hint, not a tokenizer/model
  token cache, revision-qualified ACE packet, BitFrost residency admission, or embedding trigger.
  Its current path-keyed payload lacks the source/workspace/representation identity needed to claim
  canonical warming. The old “missing command/implementation” notes below are historical; the
  2026-09-28 follow-up records the alias fix and bounded live test.
- **Existing packet, RPC, and prompt owners:** `packages/parent-atlas` provides
  `buildAcePacketV3`; SvelteKit provides `AcePacketWriter.writeRevisionQualifiedV3ToBitfrost` and
  revision-aware write helpers. The HyperRAG Packet RPC is also real: retrieval logic lives in
  `src/lib/server/retrieval/hyperrag-packet-rpc.ts` and is exposed by
  `src/routes/api/hyperrag/packet-rpc/+server.ts` (with additional routes). Separately, the live
  OpenAI facade calls `assembleACEContext()` and `buildACEPromptCached()` before synthesis. Do not
  conflate retrieval RPC packets, request-time prompt context, and persistent `AcePacketV3` cache
  objects: the missing link is a proven admitted producer/caller that binds current
  `ContextManifest` and packet/source/representation identity, derives the exact
  `embedAllowedPacketKeys`, calls the BitFrost writer, and verifies readback. Do not create a second
  packet schema, generic RPC registry, or cache owner to fill that gap.
- **LangGraph/TRACE boundary:** TRACE MCP owns registered typed tool transport/execution; the
  LangGraph bridge should only admit an already-executed result into bounded dispatcher state. The
  current `src/mcp/langgraph-bridge.ts` is legacy Headroom code: it budgets serialized characters
  rather than UTF-8 bytes, truncates arbitrary result/state JSON, can discard low-confidence state,
  and has a last-resort summary fallback. `ensureSchema()` also creates a table at runtime. This is
  not the settled V2 policy: keep identity, active DAG dependencies, required evidence refs, and
  ContextManifest checksums pinned; prune only optional/disposable references; use artifact/receipt
  refs for large outputs; fail closed if required state exceeds budget. Do not expose generic
  `shell.run` or Docker control to Ornith; retain typed, operator-gated `ops.*` operations.
- **Packet wire format and identity:** ACE packet JSON is a bounded descriptor/envelope, not a
  container for 768-float vectors or bulk feature arrays. Preserve canonical `packet_key` and
  source/revision identity; UUIDs are used only in their declared lifecycle roles and are not
  interchangeable with packet keys, ordinals, Qdrant IDs, or checksums. Large numeric payloads use
  qualified references and Arrow IPC or contiguous mmap/tensor artifacts. This is the existing wire
  format rule, not a choice between “UUID JSON” and “all-mmap packets.”
- **Admission remains closed:** the latest recorded
  `docs/reports/atlas-canonical-projection-fabric-audit-2026-09-28.json` verdict is
  `NOT_SAFE_TO_PROJECT`; only the ontology-cohort predicate is fully `PASS`. Revision qualification,
  latent/graph/ordinal manifests, projection checksum alignment, BitFrost key derivability, and ACE
  evidence grounding remain incomplete or partial. No ACE packet/cache promotion follows from the
  receipt's existence. The fresh `gan-readonly-live-proof-v1-20260928T022800Z.json` confirms
  61,718 packet rows read-only, 5 structural `source_ref` failures, and 1,520/1,520 qualified
  chunks for the named cohort; semantic projection remains `NOT_EXERCISED`, so the overall
  validation audit remains blocked on that separate lane.
- **Separate cache path:** the 2026-09-27 startup follow-up proves the admitted Karpathy path wrote
  `gpu:karpathy:scores` (190 Redis hash fields on its first run). This is a distinct cache family,
  not `BITFROST-LIVE-WARM-01` proof. The latter remains blocked pending admitted packet identity
  and a bounded write/readback/expiry canary. The last direct BitFrost cache census in the ledger is
  dated 2026-09-27; do not present it as a live 2026-09-28 measurement.
- **MCP configuration:** checked-in MCP configuration does not register a Docker MCP server.
  Existing TRACE MCP tools and the HyperRAG HTTP Packet RPC are separate surfaces; configuration or
  process presence alone does not prove a live handshake or authorize Docker/shell control.

### Remaining implementation order

1. `ACE-GATE-RECONCILE-01`: close the receipt-driven blocker table without weakening admission.
   Keep Graphify apply, Karpathy score-cache enrichment, TRACE MCP startup, and ACE/BitFrost
   warming as separate outcomes.
2. `ACE-STARTUP-BOUNDARY-01`: document/test the distinction between the path-keyed
   `ace:rank:demand` hint and revision-qualified semantic/context warming. The startup alias now
   exists; the broad ACE incremental orchestrator is manual-only because it has side effects.
3. `ACE-PRODUCER-TRACE-01`: trace request-time `ContextManifest` through `buildAcePacketV3`, prove
   packet/source/representation identity, and derive the exact admitted packet-key set. The
   HyperRAG Packet RPC is an existing retrieval interface, not persistent packet admission.
4. `ACE-BITFROST-CALLER-01`: only after producer and admission proofs pass, call the existing writer
   with identity/revision/checksum rejection, no-inline-vector, and one-vote-per-lane fixtures.
5. `ACE-BITFROST-CANARY-01`: after explicit operator authorization, run one disposable
   write/readback/TTL-expiry canary. Broader bucket warming and centroid warming require qualified
   artifact/key derivation and atomic publication/readback.
6. Connect sealed `LearningOutcomeV1` evidence to OaK judging and DSPy/GEPA in shadow mode only
   after the TypeScript ContextManifest → Python DSPy guard → TypeScript response boundary is
   enforced. GEPA optimizes the DSPy program; JEPA is a separate representation-learning idea, not
   the same optimizer. Ornith remains synthesis/tool proposal, not embedding authority.
7. Keep the optional breadth/acceleration plane behind qualified events and projections:
   - HyperLogLog code and warmers exist, but remain approximate breadth telemetry; they never
     establish identity or replace PostgreSQL counts. Audit the existing writer/read paths before
     wiring a new event producer.
   - `CentroidArtifactV1` and its checksum tests exist. Live revision-qualified centroid
     publication/readback and useful coarse-routing recall are separate proof gates; do not warm a
     broad bucket just because the artifact type exists.
   - simdjson N-API parsing, Arrow IPC, and mmap artifact paths already exist. Reuse them for
     bounded JSON/NDJSON ingestion and bulk numeric transport; do not put vectors in packet JSON or
     confuse CPU parsing with GPU execution. cuTile stays a measured challenger behind established
     cuBLASLt/LibTorch/cuVS baselines.
   - Use existing bounded RLM/OaK DAG and HyperRAG retrieval owners for multi-hop expansion. Do not
     add a second queue, packet RPC, or fusion owner until a code census proves a missing capability.
   - Python OAKlib is an ontology adapter/candidate source; OaK is the reasoning/kernel boundary.
     Neither mints canonical identity; PostgreSQL and the domain/ontology contracts retain that
     authority.
8. Evolve LangGraph Headroom separately to reference/revision-aware control state (UTF-8 byte
   budgets, pinned required evidence, receipt/artifact refs, no arbitrary JSON truncation or
   emergency summary, migration-owned schema). Keep execution in typed TRACE/OaK operators, not
   the bridge.

The detailed execution checklist is in
`openspec/changes/parent-atlas-ace-rlm-bitfrost-integration/tasks.md`. Historical status banners and
pipeline snapshots later in this file must not override this current-state note.

> MCP/Atlas status note (2026-08-23, superseded 2026-09-08 by a name-level reconciliation, not just
> a count refresh): TRACE MCP tool counts are runtime-derived and static-derived measurements of
> two genuinely different populations — do not cite either as "the" tool count on its own, and do
> not treat a future count change as churn requiring a doc rewrite. **Authoritative current
> reference**: `TRACE-MCP-AUDIT-COMPLETE.md`'s 2026-09-08 `TRACE-MCP-CENSUS-RECONCILE-01` note, and
> the receipt it points to (`docs/reports/trace-mcp-census-reconcile-01-<date>.json`, regenerate via
> `npm run trace:mcp:census-reconcile` from `sveltekit-frontend/`) — it reconciles every runtime-only
> tool name individually (`DELEGATED_MODULE_REGISTRATION` vs `COMPATIBILITY_ALIAS` vs
> `UNEXPLAINED`), not just the two counts. As of that 2026-09-08 run: static (source-registered in
> `trace-mcp-server.ts` itself) 120, runtime (live `tools/list`) 176, 0 unexplained, 0 duplicates —
> PASS. Historical counts preserved for context, not current: "175 tools" (2026-08-23, off by one),
> "129 tools" (2026-07-09, `TRACE-MCP-AUDIT-COMPLETE.md`'s original run) — do not cite either as
> live. Current bounded evidence for the broader MCP/Atlas connection statements in this document
> is in docs/reports/mcp-atlas-markdown-audit-2026-08-23.md. Active project config wires trace plus
> local atlas-tools.

## 🧭 Client Model Direction: Gemma3-270m → Gemma4-Assistant Family (2026-09-06 — DIRECTION ONLY, not started)

**Stated operator direction, not a completed or even started migration — do not treat any part of
this as done.** The plan is to eventually move the client-side local-inference lane off
`gemma3_270m_onnx` onto a model from the Gemma4-assistant family. As of this note:

- **`gemma3_270m_onnx` is still the live, unchanged, real client model** — `CLIENT_LLM_ONNX_PATH`/
  `CLIENT_LLM_QUANTIZED_PATH`/`CLIENT_LLM_TOKENIZER_PATH` in `src/lib/ai/model-ids.ts` and the
  WebGPU→WASM→CPU session code in `src/lib/ai/onnx/{inference,session}.ts` all still point at
  `/gemma3_270m_onnx/*` (verified live 2026-09-06, not stale). Nothing has been removed or rewired.
- **First real ONNX export attempt made 2026-09-06 — mechanically succeeds, numerically wrong,
  NOT usable yet.** `python/atlas_gemma_rank_onnx_export_feasibility_v1.py` exports the
  already-materialized standalone artifact (`models/atlas-gemma-rank-v1/standalone-init-bf16/`)
  via `torch.onnx.export(..., dynamo=True)` (needed installing `onnxscript`, not previously in
  this repo). The export completes and `onnx.checker.check_model` passes, but PyTorch-vs-ONNX
  output differs by `4.386` (tolerance `1e-3`) — ruled out `dynamic_axes` as the cause (a
  fixed-shape re-export gave the same delta). An initial "exported file is suspiciously small"
  theory was checked and retracted same-session: the small `.onnx` file (1.2MB) has its large
  tensors in a sibling `.onnx.data` file (standard ONNX external-data convention, 309.6MB) —
  total 310.9MB, roughly matching the 154MB bf16 source doubled to fp32, not anomalous. That
  310MB total IS its own separate blocker for browser delivery regardless of the parity bug.
  Gemma4's non-standard per-layer `layer_scalar`/sliding-window attention structure remains the
  leading suspect for the numerical divergence, not yet root-caused. Full trail:
  `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md` (`ONNX-EXPORT-01`), receipt at
  `docs/reports/atlas-gemma-rank-onnx-export-feasibility-v1.json`. **Do not treat ONNX export as
  viable for this model yet** — it is not wired into `client-router.ts` or any client lane, has no
  browser/WebGPU proof, and both the parity gap and the 310MB size must be resolved before either
  is meaningful. Converting it for real client use remains new, unstarted work beyond this probe.
  A working, live-tested alternative already exists for server-side use: `GEMMA-RANK-FASTAPI-01`
  (same tasks.md) serves the real PyTorch model directly over FastAPI, sidestepping the ONNX bug
  entirely — proven with real requests/responses, though the rank head is still untrained so scores
  aren't meaningful yet either.
- **The real, current Gemma4 work is `AtlasGemmaRankV1`**, a from-scratch reranker built by
  stripping the target-activation/KV-coupling from Google's tiny Gemma4-E4B "assistant" checkpoint
  (4 layers, hidden_size 256, ~158MB safetensors) and adding independent K/V projections + a scalar
  `RankHead`. Tracked in `openspec/changes/parent-atlas-best-fit-score-fabric/tasks.md` (search
  `AGMR-`/`MICRO-`). Current state (2026-09-06, verify against that file before citing further —
  it changes often):
  - `AGMR-01..06`: checkpoint/shape/tensor-alignment/load-init/forward-smoke/breadth-50 proof
    ladder — all done, all CPU-only.
  - `MICRO-02/03/04` + `MICRO-04-TRAIN-SMOKE`: feature-input contract, teacher receipts, shadow
    structural proof, and a bounded training-loop mechanical proof (loss 5.49→0.0 on 10
    self-identification pairs) — done, but explicitly **not** a ranking-quality or production
    training result; the rank head is still Xavier-random outside that one toy proof.
  - `MICRO-05-CUDA-*`: a real first GPU step — genuine CUDA forward passes on this host's RTX
    3060 Ti (`PyTorch 2.14.0+cu132`, isolated WSL environment), finite and repeat-deterministic.
    **BF16/FP16 vs. FP32 numerical parity is NOT resolved** (BF16 max delta 3.8, FP16 max delta
    ~1.96, FP16 does not even preserve candidate ordering) — FP32 is the only trusted numerical
    reference right now. No ranking quality, training, or promotion claim follows from these probes.
  - `MICRO-05` (the actual MoE/REAP expert-pruning gate) remains untouched, gated behind real V1
    shadow evidence that doesn't exist yet.
- **Do not**: claim `gemma3_270m_onnx` has been replaced, claim `AtlasGemmaRankV1` is
  production-ready or GPU-parity-proven, or assume MTP/speculative-decoding work elsewhere in this
  repo is the same effort as this reranker transplant — they are architecturally distinct (see the
  MTP-vs-AtlasGemmaRank distinction already recorded in that same tasks.md file).
- **When this direction actually starts moving** (an ONNX export attempt, a client wiring change,
  or a decision to promote the reranker), update this section with real evidence — same bar as
  every other "direction only" note in this file — rather than letting it go stale in place.

## 🔐 Atlas Data Persistence + Retrieval Contract (HARD RULES)

**Core Principle**: Postgres is truth; Qdrant is fast ANN mirror; Redis is ephemeral cache; Neo4j is topology mirror.

### Docker Disposability Rule

Docker containers are disposable. **Volumes are the only durable layer.** Before any destructive command, verify mounted volumes:

```bash
docker inspect legal-ai-postgres | jq '.[0].Mounts'
docker inspect legal-ai-qdrant   | jq '.[0].Mounts'
docker inspect legal-ai-neo4j    | jq '.[0].Mounts'
docker inspect legal-ai-valkey    | jq '.[0].Mounts'
```

**Never run** (without explicit operator approval + backups):
```bash
docker compose down -v
docker volume prune
docker system prune --volumes
```

### Store Roles (Immutable)

Same Postgres-is-truth / Qdrant-Redis-Neo4j-are-mirrors invariant as the "Storage Mirrors (All
Synchronized)" table under Parent Atlas P0–P7 Roadmap further down — that table also covers
DuckDB and CouchDB, so treat it as the fuller reference; this one is kept here only because the
hard rules immediately below it are specific to this section.

| Store | Role | Truth? | Rebuildable? |
|-------|------|--------|-------------|
| **Postgres pgvector** | Canonical truth | ✅ YES | No (restore from backup) |
| **Qdrant** | ANN vector search mirror | ❌ NO | Yes (from Postgres) |
| **Redis/Bifrost** | Hot cache only | ❌ NO | Yes (from Postgres) |
| **Neo4j** | Topology/ontology mirror | ❌ NO | Yes (from Postgres + Qdrant) |

**Hard rules:**
- ✅ Write to Postgres FIRST (atomic, durable)
- ✅ Invalidate Redis AFTER Postgres succeeds (never before)
- ✅ Rebuild Qdrant from Postgres if diverged (idempotent upsert)
- ✅ Rebuild Neo4j from Postgres if lost (deterministic Cypher)
- ❌ Never make Qdrant/Redis/Neo4j the source of truth
- ❌ Never write to cache before Postgres succeeds
- ❌ Never assume Docker data is safe (volume check first)

### Schema Truth: Split Identity + Chunks

**atlas_packets** (58,304 rows)
- Packet identity / metadata only
- `embedding` column is vector(768), legacy/non-canonical; do not use as the authoritative embedding source
- Join key: `packet_key`, `source_ref`
- Not the embedding source

**codebase_chunk_index** (40,754 rows)
- Canonical code chunks with embeddings
- `content_embedding` column is vector(768), 99.5% populated (40,568 rows)
- **This is the truth source for embeddings**
- Mirrors to Qdrant `codebase_chunks_768` (40,568 points)

**Qdrant codebase_chunks_768** (40,568 points)
- Mirror of codebase_chunk_index
- Fast ANN search
- Payload indexed by source_ref, feature_id, etc.
- Rebuildable: `npm run atlas:qdrant:768:restore:apply`

**Why the gap?**
- Atlas_packets = identity/metadata (58K)
- Codebase_chunk_index = actual chunks (40.7K, subset that are code)
- Qdrant = embedded chunks only (40.5K, excludes 186 null embeddings)
- **Expected and correct.** Do not force all atlas_packets to Qdrant.

### Dimension Policy (PROJECT CANONICAL)

```
PROJECT_CANONICAL_EMBED_DIM = 768
EMBED_MODEL                 = embeddinggemma:latest
FULL_MODEL_DIM              = 768 (native)
INDEX_DIM_REQUIRED          = 768 (hard stop if different)
```

**Full policy (hard stops, MRL-truncation rule, the two coexisting Qdrant 768 collections, and the
`embedding_dimension` metadata-column caveat) lives once, at "🧠 Embedding Dimensions Policy
(CANONICAL — resolved 2026-08-23)" near the top of this file — read that instead of duplicating it
here.**

**Verify before any migration:**
```bash
npm run atlas:audit:embeddings --verbose
```

Must report Ollama, Postgres, Qdrant, Redis dimensions and agree on 768.

### Query Flow (Canonical Order)

Same pipeline as the "Retrieval Decision Tree" earlier in this file — see that diagram for the
canonical step order (Qdrant ANN → Postgres join → optional Neo4j expansion → GPU rerank →
optional 512d MRL routing cache). One addition specific to this flow: an exact-match Redis lookup
(L1 cache, keyed on the literal query) can short-circuit everything before the embed step even
runs — that's a different mechanism from the 512d MRL re-ranking cache in the other diagram, so
it's noted here rather than folded into that diagram. Final step after retrieval: Gemma4 answer/summary.

**Critical**: Do NOT generate answers from Qdrant payloads alone. Always join back to Postgres truth before synthesis.

### Recovery Order (Verified)

1. ✅ Verify Docker volumes exist and are mounted
2. ✅ Verify Postgres counts (58K packets, 40.7K chunks)
3. ✅ Verify Qdrant collection counts (40.5K codebase_chunks_768)
4. ⏳ Verify embedding dimensions (audit-embedding-dimensions.mjs)
5. ⏳ Rebuild Qdrant from codebase_chunk_index if needed
6. ⏳ Rebuild Neo4j topology if needed
7. ⏳ Warm Redis/Bifrost from Postgres + Qdrant
8. ⏳ Regenerate missing summaries
9. ⏳ Run final recovery gate

### Backup Commands (Before Destructive Ops)

**Postgres:**
```bash
docker exec legal-ai-postgres pg_dump -U legal_admin -d legal_ai_db -Fc -f /tmp/legal_ai_db.dump
docker cp legal-ai-postgres:/tmp/legal_ai_db.dump ./backups/legal_ai_db_$(date +%Y%m%d_%H%M%S).dump
```

**Qdrant snapshot:**
```bash
curl -X POST http://127.0.0.1:6333/collections/codebase_chunks_768/snapshots
curl http://127.0.0.1:6333/collections/codebase_chunks_768/snapshots
```

**Redis:**
```bash
docker exec legal-ai-valkey valkey-cli SAVE
```

**Neo4j:**
```bash
docker exec legal-ai-neo4j neo4j-admin database dump neo4j --to-path=/backups
```

### Status Language (ENFORCED)

Use only:
- **CREATED** — File exists, syntax valid
- **WIRED** — Ready for dry-run, no side effects
- **DRY_RUN_PROVEN** — Dry-run passes, verified safe
- **APPLY_PROVEN** — Apply succeeded, verification gate passes
- **NOT_PROVEN** — Blocked by prerequisite or failed gate

**Never claim "production-ready" from dry-run evidence.**

### Error handling in multi-step proof runs: record null, continue, never promote (2026-09-21)

Parent Atlas workstation proofs (censuses, observation gates, preflights, audits) span many readers and steps. One failing step must not halt the whole run or be silently dropped:

- **Record + continue**: a step that errors is written to the receipt as an explicit failure (`value: null` plus a `failures` reason such as `PROCESS_EXIT_FAILURE`, `MISSING_SHADOW_OBSERVATION`), and the run continues with the remaining steps.
- **Never promote**: a null/failed step never counts toward `PROVEN`, `QUALIFIED`, `READY`, eligibility, or any pass criterion. The overall status stays `BLOCKED` until every required step passes. Null is "unknown", not "absent" and not "zero".
- **Never coerce an identity/revision/authority fact to null and proceed**: a missing `sourceRevision`, `workspaceRevision`, `packet_key`, etc. is classified (`MISSING_REVISION`) and blocks; it is not defaulted, substituted, or treated as `depends=none`.
- **Fix the cause in the harness, don't relax the gate**: when a failure is a census/harness defect (wrong argument, unrunnable loader), correct the harness and rerun, keeping the earlier receipt as history. Do not lower the criterion.
- Reference implementation: `scripts/atlas/audit-graphify-authority-reader-shadow-census-v1.mts` (per-reader PASS/FAIL with reasons, 8/8 required).

---

## 🔒 AGENT EXECUTION INTEGRITY — EVIDENCE RULES (July 28, 2026)

**Critical anti-hallucination policy. Prevents evidence laundering in audits, reconciliation, and status reports.**

### The Failure Pattern (What We Must Prevent)
1. Tool invocation **fails** (write command returns error)
2. Agent **claims success anyway** (says file was updated)
3. Status **artificially promoted** (WIRED via conceptual comments)
4. Contradictory **completion claimed** (0/0 score reframed as "successful")
5. Invalid **remediation proposed** (force lane to WIRED without evidence)

**This is NOT auditing. This IS evidence laundering.**

### Hard Rules (Non-Negotiable)

#### Rule 1: No Model Claims Without Tool Evidence
```typescript
// BLOCKED: "Agent claimed edit after write tool failed"
interface AgentClaimV1 {
  claimType: 'FILE_CREATED' | 'FILE_UPDATED' | 'TEST_PASSED' | 'LANE_PROVEN' | 'TASK_COMPLETE';
  target: string;
  supportingToolCallIds: string[];
}

interface ToolUsageEventV1 {
  runId: string;
  toolCallId: string;
  tool: string;
  outcome: 'SUCCESS_WITH_RESULTS' | 'SUCCESS_EMPTY' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL' | 'BLOCKED';
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
  diffRef: string | null;
  failureCode: string | null;
}

// Validation
function validateAgentClaim(claim: AgentClaimV1, events: ToolUsageEventV1[]): boolean {
  const supporting = events.filter(e => claim.supportingToolCallIds.includes(e.toolCallId));
  
  if (supporting.length === 0) return false; // CLAIM_WITHOUT_TOOL_EVIDENCE
  if (supporting.some(e => e.outcome === 'FAILED_TERMINAL')) return false; // CLAIM_DEPENDS_ON_FAILED_TOOL
  
  return true;
}
```

#### Rule 2: Edit Proof Contract (Immutable)
```typescript
interface EditProofV1 {
  runId: string;
  toolCallId: string;
  sourceRef: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  beforeHash: string | null;
  afterHash: string | null;
  toolOutcome: 'SUCCESS' | 'FAILED';
  diffRef: string | null;
  validationResultIds: string[];
  claimedByModel: string;
  observedAt: string;
}

// Promotion rule: ONLY accept tool-backed evidence
function isEditProven(proof: EditProofV1): boolean {
  return proof.toolOutcome === 'SUCCESS' &&
         proof.afterHash !== null &&
         proof.afterHash !== proof.beforeHash &&
         proof.diffRef !== null;
}

// The model saying "file has been updated" is NEVER evidence by itself
```

#### Rule 3: Lane Status Strictness (Observable Evidence Only)
```typescript
type LaneStatus = 
  | 'ABSENT'              // Owner artifact does not exist
  | 'PRESENT'             // File exists, audit confirmed
  | 'STATICALLY_REFERENCED' // Imported by real producer/consumer
  | 'FIXTURE_PROVEN'      // Bounded fixture test passes
  | 'RUNTIME_SMOKE_PROVEN' // Live execution path succeeds
  | 'PARTIAL_PROVEN'      // One entity traces across stores
  | 'CROSS_STORE_PROVEN'  // Identity + revision parity verified
  | 'CONFLICTING'         // Contradictory evidence found
  | 'BLOCKED';            // Failed preconditions

// FORBIDDEN:
// ❌ 'WIRED' (generic, undefined evidence level)
// ❌ Percentage scores ('35/40', '87.5% complete')
// ❌ Theoretical maximums
// ❌ Comments as evidence ('DEV NOTE developer verified this')
// ❌ Promoted status without observable proof
```

#### Rule 4: Lane Promotion Matrix (No Percentages)
```typescript
interface OwnershipLaneResultV1 {
  lane: 'OKF_SOURCE' | 'PACKET_VALIDATION' | 'HYPERRAG_PACKET_RPC' | 'PACKET_IDENTITY' | 'TOPOLOGY_ROUTING' | 'QDRANT_PAYLOAD' | 'POSTGRES_ROWS' | 'REDIS_VALUES';
  status: LaneStatus;
  evidenceRefs: string[];        // Immutable references
  violationCodes: string[];      // Failed validations
  validationResultIds: string[]; // Tool event IDs
}

// Report format (NO percentages):
// ✅ "2 PRESENT, 3 STATICALLY_REFERENCED, 1 RUNTIME_SMOKE_PROVEN, 0 CROSS_STORE_PROVEN, 2 BLOCKED"
// ❌ "35/40 complete", "87.5% ready", "success", "integrated"
```

#### Rule 5: Anti-Hallucination Event Detection
```typescript
type AgentExecutionIntegrityViolation = {
  type: 'AGENT_EXECUTION_INTEGRITY';
  failureCode: 
    | 'EDIT_CLAIM_WITHOUT_EDIT_PROOF'      // Claimed edit, no tool success
    | 'AUDIT_STATUS_FORCED_WITHOUT_EVIDENCE' // Promoted via comments
    | 'COMPLETION_CLAIM_CONTRADICTS_AUDIT' // 0/0 claimed as "complete"
    | 'PROPOSED_ASSUME_SUCCESS_PATCH'      // Suggested forcing WIRED
    | 'CLAIM_DEPENDS_ON_FAILED_TOOL';      // Depends on FAILED_TERMINAL tool
  priority: 'CRITICAL';
  evidenceState: 'ACTIVE_VERIFIED';
  validationCommands: string[];
};
```

### Governance (The Boundary)

**Tools produce observable facts.**
- Deterministic audit code validates facts and derives gaps.
- Gemma4 summarizes findings and suggests groupings.
- OpenSpec governs contract changes (durable policies).
- GSD executes accepted work (implementation).
- ACE carries only active, bounded context (current task).

**No model may promote its own unverified claims.**

### Next Milestone: ONE_ENTITY_ENRICHMENT_TRACE_PROVEN

Pick ONE real `packet_key` that exists in Postgres. Prove:
1. ✅ **Postgres**: packet_key + content_hash + workspace_revision present
2. ✅ **Qdrant**: Same packet_key in payload, dimensions match, revision preserved
3. ✅ **Neo4j**: Topology fields distinct (SOM cell ≠ KMeans cluster ≠ PageRank score)
4. ✅ **Redis**: Cache policy executed (write-through OR invalidation) after Postgres commit
5. ✅ **HyperRAG**: Returned packet_key matches all upstream values
6. ✅ **ACE**: Active task packet preserves packet_key + evidence lineage

**Record immutable validation result for each step.**

That single end-to-end trace produces **PARTIAL_PROVEN** across all lanes simultaneously. That is legitimate evidence.

### Binding Instructions for Claude

1. **Never accept percentage scores for audit reports.** Report observable state only.
2. **Never claim completion based on comments or conceptual verification.** Require tool events.
3. **Never promote lane status without matching successful tool execution.** Observable evidence only.
4. **Never reframe failed tool outcomes as success.** If tool outcome is FAILED_TERMINAL, dependent claims are BLOCKED.
5. **Never propose forcing status without evidence.** If a lane is NOT_PROVEN, it must remain NOT_PROVEN until one of the proof levels is achieved.
6. **Always record immutable tool events before summarizing.** Tool outcome → Deterministic validation → Summary.
7. **Detect the failure pattern and emit AGENT_EXECUTION_INTEGRITY violations.** This is the early warning system.

### Example: Corrected Session 148 Status

**Previous (Evidence Laundering)**:
- "Audit successful"
- "0/0 = complete"
- "Propose WIRED for TOPOLOGY_ROUTING"

**Corrected (Observable)**:
- OKF source: **PRESENT**
- Packet validation: **STATICALLY_REFERENCED**
- HyperRAG RPC: **STATICALLY_REFERENCED**
- Packet identity: **PARTIAL_PROVEN**
- Topology routing: **STATICALLY_REFERENCED**
- Qdrant payload: **NOT_PROVEN**
- Postgres rows: **PRESENT**
- Redis values: **NOT_PROVEN**

**Status**: 2 PRESENT, 3 STATICALLY_REFERENCED, 1 PARTIAL_PROVEN, 0 CROSS_STORE_PROVEN, 2 NOT_PROVEN
**Next**: Execute ONE_ENTITY_ENRICHMENT_TRACE_PROVEN gate

---

Sources:
- [Bits UI Docs](https://bits-ui.com/) | [Migration Guide](https://bits-ui.com/docs/migration-guide)
- [Svelte 5 Runes](https://svelte.dev/blog/runes) | [Migration Guide](https://svelte.dev/docs/svelte/v5-migration-guide)
- [UnoCSS Svelte Scoped](https://unocss.dev/integrations/svelte-scoped) | [SvelteKit Setup](https://frontavo.com/blog/setting-up-unocss-with-sveltekit)
- [Superforms Docs](https://superforms.rocks/) | [File Uploads](https://superforms.rocks/concepts/files)

## Parent Atlas current identity and retrieval alignment (2026-08-31)

This section supersedes older UUID/Qdrant notes above where they conflict with
the current receipts. It is a policy projection, not a new identity authority.

### Identifier policy

- PostgreSQL remains canonical for packet, chunk, source, workspace, symbol,
  feature, and revision identity.
- UUIDv4 (`crypto.randomUUID()` / `gen_random_uuid()`) is for random operational
  request, job, session, and event IDs.
- UUIDv8 in `sveltekit-frontend/src/lib/utils/uuid.ts` is the deterministic
  SHA-256-derived ID for explicitly derived artifacts.
- UUIDv5 and ULID are compatibility formats only unless an existing persisted
  contract proves their use. UUIDv7 is available in PostgreSQL 18 for future
  time-ordered records, but must not trigger a mass identity rewrite.
- Hex strings, Qdrant numeric IDs, UUIDs, and ULIDs are not interchangeable.
  A hex-to-UUID/ULID conversion is allowed only with an existing namespace and
  round-trip mapping receipt; never synthesize a canonical ID from formatting.

### Indexed evidence and mirrored retrieval

```text
source bytes + workspace revision
  -> Tree-sitter CST / AST-grep structural observations
  -> stableSymbolId / symbolVersionId / treeNodeId evidence
  -> PostgreSQL canonical chunk and feature identity
  -> semantic_768 EmbeddingGemma vector
  -> Qdrant / Go Retrieval / GPU named-vector projections
  -> CandidateOrdinal normalization
  -> SearchRuntime fusion
  -> ACE cards -> ContextManifest -> synthesis
```

- AST/CST, AST-grep, SearXNG metadata enrichment, NLP extraction, RPC packets,
  and Go Retrieval may mirror bounded evidence and metadata, but none may mint
  canonical identity or become the final fusion owner.
- Every mirrored record should carry `sourceRef`, `sourceRevision`,
  `workspaceRevision` where applicable, representation/revision metadata, and
  an evidence or projection checksum.
- Go Retrieval is a read-only executor. Its output must normalize to the same
  CandidateOrdinal universe as PostgreSQL, Qdrant, lexical, structural, and
  GPU executors before ranking.
- SearXNG results are external evidence inputs. Preserve provider URL/title/
  snippet/published metadata and fetch provenance; do not treat search rank or
  transport order as canonical relevance or identity.
- Named vectors are representation slots, not separate retrieval votes:
  `content` is semantic_768; MRL and latent views remain derived/challenger
  lanes unless separately promoted by frozen evaluation evidence.
- Qdrant point IDs may be numeric or UUID, but the chosen projection ID must be
  deterministic and mapped to PostgreSQL identity. Index UUID-valued payloads as
  UUID only when the field is actually a UUID; index `candidateOrdinal` as an
  integer and `packetKey`/`sourceRef` as keyword metadata. A ULID stored as text
  is not a UUID index and must retain its original namespace/format.
- Retrieval filters run before ANN search. Payload indexes accelerate filtering;
  they do not make a projection authoritative. Preserve the point-ID mapping
  manifest when moving between numeric, UUID, or ULID projection generations.

### Synthesis and helper boundary

- Fetch helpers must validate bounded parameters before dispatch, preserve
  request/revision checksums, and return stable typed envelopes. Concatenation,
  splice, chunk, inverse, and pagination helpers must preserve source spans and
  candidate ordinals rather than inventing IDs.
- Raw retrieval hits must not be passed directly to a model. The required path
  is retrieval -> filtering/reranking -> canonical ACE context -> ContextManifest
  -> bounded Ornith synthesis/prefill/decode.
- Ornith is the synthesis/tool-use consumer. It is not the EmbeddingGemma
  semantic vector writer and must not receive hidden thoughts, KV cache, or
  tensor state as persisted context.

### GPU, JSON, bit encodings, and mmap

- JSON/JSONL is for bounded control envelopes, receipts, and metadata. Do not
  serialize bulk vectors or feature matrices through JSON.
- Bitmaps and packed bit encodings select CandidateOrdinals or availability;
  they do not replace canonical IDs. Record bit-width, endianness, layout
  revision, and checksum in the artifact descriptor.
- Large dense arrays use raw contiguous F32LE mmap or Arrow IPC metadata. RTX
  PyTorch/ATen is the numerical executor; TypeScript owns descriptors, lineage,
  admission, and receipt validation.
- GPU memory swaps may move approved mmap/Arrow/tensor residency descriptors
  keyed by candidate, representation, graph/feature revisions, and checksums.
  Never persist hidden reasoning, KV cache, arbitrary tensor snapshots, or
  unvalidated model state in Redis, Valkey, IndexedDB, or Qdrant.
- CPU reference and RTX executor must compare CandidateOrdinal ordering,
  availability masks, dimensions, checksums, and bounded numerical tolerances
  before any GPU result is promotion-eligible.

### Current Qdrant warning

The 2026-08-31 read-only audits found 15 duplicate same-collection targets in
the bounded canary and 5,634 duplicate PostgreSQL mappings in the full
`codebase_chunks_768` collection. `codebase_chunks_768_v2` did not contain the
canary rows. Do not cut over, delete, or treat the existing backfill utility as
promotion-ready until an exact CandidateOrdinal/lineage map and blue/green
alias readback are proven.

## Binary bytes, SHA-256, and Parent Atlas revision lineage (2026-09-16)

Keep binary representation, hashing, and lineage namespaces distinct:

- A bit is 0/1. A byte is eight bits with an unsigned range of 0..255 (`0x00`..`0xff`). This is the domain for packed control bytes, feature bytes, and protocol buffers; it is not a revision or identity by itself.
- SHA-256 hashes an arbitrary byte sequence and returns a 256-bit digest, equal to 32 bytes or 64 hexadecimal characters. Parent Atlas canonical text is `sha256:<64 lowercase hex characters>`.
- Hash exact source bytes. Do not hash decoded UTF-16 text, normalized newlines, reserialized JSON, or a different encoding from the producer contract.
- Whole-source and chunk hashes have different grains: `file_content_hash` is the whole source digest; `codebase_chunk_index.content_hash` is the chunk digest. Never compare those fields directly.
- Keep `workspace_revision`, `source_revision`, `representation_revision`, and `feature_revision` as separate namespaces. A SHA-256-shaped value is not interchangeable merely because its format looks valid.
- `packet_key` is a deterministic packet identity projection. It does not replace source digest, workspace revision, source revision, or CandidateOrdinal.
- PostgreSQL owns canonical identity. Qdrant IDs, Redis/BitFrost keys, centroids, GPU buffers, topology coordinates, and cache descriptors remain derived projections.

Canonical lineage:

```text
immutable snapshot
  → Graphify execution_id
  → source_ref + source_revision + exact source-byte digest
  → packet_key + binding_checksum
  → packet→chunk lineage
  → representation_revision
  → ACE/Qdrant/graph/GPU projections
```

Promotion and upsert rules:

- An upsert is idempotent only when all canonical identity and digest fields match exactly.
- A differing field is an identity collision, revision mismatch, or content mismatch; fail closed.
- Never coerce a SHA-256 workspace revision into a legacy integer such as `0`.
- Historical nullable rows remain observable but are not promotion-eligible.
- Every promotion needs transaction readback, checksum evidence, and `writesPerformed` status.

Standards references: NIST FIPS 180-4 defines SHA-256 message digests; Python documents bytes as integer sequences constrained to `0 <= x < 256`.

## UUID version policy for Parent Atlas identity and indexes (2026-09-16)

Use UUID versions by lifecycle role; never use a UUID format to replace canonical `packet_key`,
`source_ref`, source digest, or revision identity.

- **UUIDv4** (`crypto.randomUUID()`): random operational IDs for requests, traces, temporary
  jobs, and ephemeral runs. It is not replay-stable packet or training-row identity.
- **UUIDv5**: deterministic name-based identity from a frozen namespace and canonical name.
  Parent Atlas uses the frozen `PACKET_AGGREGATE_NAMESPACE_V1` for derived packet-index matching
  across legacy namespaces. It is a lookup key only and never authorizes an upsert.
- **UUIDv7**: time-ordered IDs for newly generated durable events or batches when index locality
  matters. It does not identify source bytes or reconcile historical packet namespaces.
- **UUIDv8**: custom application-defined identity only after its bit layout, namespace, checksum,
  and replay semantics are explicitly frozen. Do not introduce it for packet repair casually.

For YAML/JQ/JSONL indexes, preserve the real field type: UUID fields as UUID, `packet_key` as
text, and `sha256:<64 hex>` revisions/digests as text. A UUIDv5 match is admissible only after
exact equality of `packet_key`, `source_ref`, `workspace_revision`, `source_revision`, and the
whole-source digest. Same UUIDv5 key with different canonical fields is an identity collision.
Manifests must record the UUID algorithm, frozen namespace, name input, and
`canonicalIdentity: false` when the UUID is only an index key. PostgreSQL remains canonical;
YAML/JQ, DuckDB, Redis/BitFrost, Qdrant, centroids, and GPU IDs remain derived layers.

RFC 9562 is the reference for UUIDv4, UUIDv5, UUIDv7, and UUIDv8 semantics.
