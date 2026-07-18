# Atlas Codebase Intelligence — Senior Engineering Prompt
<!-- Contract owner: Parent Atlas Control Plane -->
<!-- Status: FROZEN (update only when pipeline ordering or identity chain changes) -->
<!-- Last updated: 2026-07-17 (Session 138+ rev 2) -->

---

## What this file is

A precise briefing for any agent — human or AI — working on the Parent Atlas codebase intelligence pipeline. It covers identity contracts, task-state semantics, architecture ordering, HMM/ACP/A2A/AHP integration, active gaps, and verification gates.

**Read this before touching**: feature_records, atlas_packets, Qdrant collections, AE training, HyperRAG pipeline, graphify scripts, or any agentic routing layer.

---

## I. Identity Chain (IMMUTABLE)

Every packet, every store, every operation must trace this chain or it is invalid:

```
directory_path → source_ref → file_path → function_symbol
  → feature_id → feature_label → packet_key
  → summary → qdrant_point_id → redis_key → cold_storage_manifest
```

**Hard rules:**
- `source_ref` is the primary join key across all stores
- Never join on `feature_id` alone
- Synthetic keys like `feature:auth_sessions` are discovery aliases — NEVER persisted as source_ref
- `packet_key` format: `ace:packet:{domain}:{zero-padded-id}` OR `feature:{feature_key}`
- Cold storage: no delete, no archive, no move until `restore_verified == true`
- **unknown label ≠ feature_id** — an unresolved candidate must stay typed as `UnresolvedFeature`, not be lowercased into a fake ID

**Canonical packet shape:**
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
  "embedding": { "model": "embeddinggemma", "dim": 384, "qdrant_point_id": "qdrant:auth:001" },
  "cache": { "redis_key": "bifrost:packet:auth:001", "centroid_key": "centroid:feature:auth.sessions" },
  "cold_storage": { "manifest_id": "manifest:auth:001", "uri": null, "restore_verified": false }
}
```

---

## II. Canonical Truth Flow (STRICT ORDER — never reverse)

```
1. Read from Postgres (atlas_packets = canonical truth)
2. Validate structure (hard fail: missing packet_key / source_ref / feature_id)
3. Write to Postgres (set updated_at = NOW())
4. Invalidate Redis AFTER Postgres succeeds (never before)
5. Emit async events (RabbitMQ / EventEmitter, non-blocking)
```

**Storage decision matrix:**

| Need | Store |
|------|-------|
| Canonical packet identity | Postgres `atlas_packets` |
| Vector similarity search | Qdrant (mirror) |
| Hot path (1000×/sec) | Redis/Valkey BitFrost (cache) |
| Graph traversal | Neo4j (topology mirror) |
| Raw binary/document | SeaweedFS S3 |
| Cold archive | CouchDB |
| Offline ML/graph export | `.okf` files (read-only export, not canonical storage) |

**Postgres vs GitHub/Plane boundary:**

| Owns | System |
|------|--------|
| Packets, features, evidence, runs, outcomes, ML state | Postgres |
| Initiatives, specifications, work items, assignments | GitHub / Plane |

Do NOT duplicate GitHub/Plane fields in Postgres. Store only synchronization identity:
```typescript
interface ExternalWorkItemLink {
  workItemLinkId: string;
  provider: 'github' | 'plane';
  externalId: string;
  externalUrl: string;
  specId: string | null;
  agentRunId: string | null;
  lastSyncedAt: Date;
  externalUpdatedAt: Date | null;
  syncHash: string;
}
```

---

## III. Dimension Policy (HARD STOPS)

```
PROJECT_CANONICAL_EMBED_DIM = 384
EMBED_MODEL                  = embeddinggemma:latest  (Ollama :11434)
FULL_MODEL_DIM               = 768  (native, DO NOT write to 384 collections)
AE_INPUT_DIM                 = 768  (AE trains on full-dim vectors from codebase_chunks_768)
AE_LATENT_DIM                = 64   (routing-only — NOT for ANN search)
SEARCH_DIM                   = 384  (codebase_chunks_768 named-vector "content")
```

- ❌ Do NOT write 384-dim vectors into 768-dim collections
- ❌ Do NOT write 768-dim vectors into 384-dim collections
- ❌ Do NOT use 64-dim AE latents for ANN search
- ❌ Do NOT call Gemma4 (:8090) for embeddings — chat/synthesis only
- ❌ Do NOT call llama-server with `stream: false` — thinking block exhausts max_tokens
- ❌ Do NOT place raw 384-float arrays in `.okf` JSON records — store Arrow or feature-registry reference

---

## IV. Canonical Operator Order

```
Storage & Lineage (P0)
  → BM25 summaries (P1)
  → Concept extraction / used_concepts backfill (P2 — CURRENT BLOCKER)
  → Qdrant payload filter / normalization (P3)
  → Qdrant HNSW ANN (P4)
  → TurboVec.Search stage 1.5 (prefilter + rerank)
  → Neo4j USED_CONCEPT hop (P5)
  → XGBoost reranker stage 4 (P6)
  → Redis/BitFrost cache (P7)
  → HyperRAG Packet RPC (P8)
  → QLoRA export (P9)
  → Neo4j GDS PageRank (LAST — needs stable community_id from KMeans/SOM)
```

**Critical ordering constraint:** Neo4j GDS PageRank MUST run after KMeans/SOM emit `community_id`. Sequence:
```
graphify:daily → SocratiCode → OKF → domain_classifier → KMeans → SOM 20×20 → Neo4j GDS → ACE/KAG
```

---

## V. Task-State Taxonomy (8 Levels)

An agent saying "implemented" does NOT mean DONE. Every task has a precise state:

| Level | State | Meaning |
|-------|-------|---------|
| 0 | `PROPOSED` | Planned in prompt / commit message / doc — zero code exists |
| 1 | `IMPLEMENTED_IN_WORKTREE` | Code written in agent worktree branch, not merged |
| 2 | `MERGED_TO_BRANCH` | Committed to main or feature branch, accessible |
| 3 | `SCHEMA_APPLIED` | DB migrations executed, tables/columns exist in live Postgres |
| 4 | `DRY_RUN_PROVEN` | `--dry-run` passes, reads correct data, writes nothing |
| 5 | `LIVE_VERIFIED` | Real apply succeeded, gate checks pass, no regressions |
| 6 | `RECONCILED` | All mirrors (Qdrant/Redis/Neo4j) agree with Postgres truth |
| 7 | `DONE` | Monitoring confirms stable, no rollback triggers in 24h |

**Rule:** Status claims in reports MUST use one of these 8 words, not synonyms.

**Three-panel display for UI and reports:**
```
Planning:     In progress
Readiness:    IMPLEMENTED_IN_WORKTREE
Runtime:      DIRECT_PROBE_PASS
```

---

## VI. Planning Vocabulary (Precise Terms)

Use these terms exactly. Do not substitute synonyms.

| Term | Meaning |
|------|---------|
| **Initiative** | Large outcome spanning multiple features |
| **Feature** | User-visible or system-visible capability |
| **Specification** | Frozen behavioral contract (has `CONTRACT_VERSION`) |
| **Work item** | Implementable tracked unit (Plane API vocabulary) |
| **Task** | Local execution step inside a work item |
| **Gate** | Executable completion criterion |
| **Evidence** | Artifact proving a gate passed |

**Feature Spec Lifecycle:**
```
DRAFT → REVIEWED → FROZEN → IMPLEMENTING → RUNTIME_VERIFIED → PROMOTED → SUPERSEDED
```
- `FROZEN` = no further schema/contract changes; implementations must match exactly
- `RUNTIME_VERIFIED` = tested against live Postgres + Qdrant, not just unit tests
- `PROMOTED` = canonically wired into at least one production retrieval lane
- `SUPERSEDED` = replaced by newer version; old version archived to cold storage

**Contract files use `CONTRACT_VERSION` sentinel** — any change bumps version and invalidates cached validators.

---

## VII. Intent and Repair Vocabulary

**Never call all of these "suggestions."** Use the precise stage term:

```typescript
// Inferred intent — always a hypothesis, never a certainty
interface IntentHypothesis {
  intentType:
    | 'find_code'
    | 'explain_code'
    | 'diagnose_error'
    | 'implement_feature'
    | 'repair_failure'
    | 'inspect_architecture'
    | 'run_validation';
  confidence: number;
  evidence: string[];
  alternatives: Array<{ intentType: string; confidence: number }>;
}

// Repair lifecycle — each stage is distinct
type RepairCandidate      = { /* possible code or config repair */ };
type RepairRecommendation = { /* ranked advice supported by evidence */ };
type RepairProposal       = { /* concrete patch plan awaiting authorization */ };
type RepairAction         = { /* authorized operation */ };
type RepairOutcome        = { /* observed result after validation */ };
```

**Why "hypothesis"?** Atlas cannot know intent with certainty. It makes a probabilistic interpretation that can be revised.

---

## VIII. Feature Extraction Vocabulary

```typescript
type FeatureCandidate   = string; // extracted word/concept not yet resolved
type CanonicalFeatureId = string; // existing registry identity
type UnresolvedFeature  = { candidate: string }; // retained, not adjudicated

// resolveFeatureCandidates() — NOT normalizeFeatureIds()
// Returns typed records, not string[]
type FeatureResolution =
  | { status: 'resolved';   candidate: string; featureId: string; featureLabel: string }
  | { status: 'unresolved'; candidate: string }
  | { status: 'ambiguous';  candidate: string; candidateFeatureIds: string[] };
```

**Critical rule:** `resolveFeatureCandidates()` must return typed `FeatureResolution[]`. A caller must never assume every returned item is a canonical ID.

**Concept separation:**
```typescript
// WRONG — using label as concept ID
conceptIds: ['retrieval', 'Retrieval Pipeline']

// CORRECT — separate identity from label
featureId: 'retrieval'
featureLabel: 'Retrieval Pipeline'
conceptIds: ['retrieval']
unresolvedConceptLabels: []
```

---

## IX. Agentic Recommendation Contract

```typescript
interface AgenticRecommendation {
  recommendationId: string;
  traceId: string;
  intent: IntentHypothesis;
  recommendationType:
    | 'inspect'
    | 'run_command'
    | 'edit_code'
    | 'apply_migration'
    | 'rebuild_projection'
    | 'defer'
    | 'quarantine';
  title: string;
  rationale: string;
  evidence: Array<{
    packetKey: string;
    sourceRef: string;
    retrievalLane: 'exact' | 'lexical' | 'dense' | 'sparse' | 'ast' | 'graph' | 'history';
    score: number;
  }>;
  affectedFiles: string[];
  proposedCommands: string[];
  confidence: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  requiredApprovals: string[];
  validationGates: string[];
  specId: string | null;
  workItemId: string | null;
}
```

**Deterministic ranking score (use this until exposure ledger has ≥1K outcomes):**
```
recommendation_score =
    0.25 × retrieval_relevance
  + 0.20 × exact_error_match
  + 0.15 × structural_proximity
  + 0.15 × historical_success
  + 0.10 × validation_coverage
  + 0.10 × intent_confidence
  + 0.05 × recency
  - risk_penalty
```

Do NOT use collaborative filtering until the exposure ledger has sufficient outcomes — otherwise it encodes selection bias. Record exposures AND outcomes, not only accepted recommendations.

**Recommendation retrieval pipeline:**
```
intent hypothesis
  → retrieval fan-out (exact + lexical + dense + sparse + AST + graph + history)
  → candidate hydration
  → RRF / learned ranking
  → repair candidate generation
  → risk and policy checks
  → recommendation
  → human/agent authorization
  → execution
  → validation
  → outcome event
```

---

## X. OKF Record Contract

`.okf` is a portable knowledge-feature export — NOT canonical storage, NOT agent-memory database.

```
Postgres canonical records
  → versioned .okf export
  → offline graph/ML/agent analysis
  → recommendation candidates
  → validated recommendation events
  → Postgres outcome ledger
```

```typescript
interface OkfRecord {
  contractVersion: 'atlas-okf-v1';
  packetKey: string;
  canonicalSourceRef: string;
  featureId: string | null;
  lexical: {
    identifiers: string[];
    symbols: string[];
    keywords: string[];
  };
  structural: {
    treeNodeId: string | null;
    nodeKind: string | null;
    imports: string[];
    exports: string[];
  };
  semantic: {
    summary: string | null;
    embeddingRef: string | null; // Arrow/registry reference — NOT raw floats
  };
  topology: {
    pageRank: number | null;
    communityId: string | null;
    somCell: number | null;
    kmeansCluster: number | null;
  };
  provenance: {
    sourceSnapshotHash: string;
    producerVersion: string;
    generatedAt: string;
  };
}
```

---

## XI. HMM Agentic Task Router

The Viterbi-based state machine that routes tool calls across agent workflows.

**States:**
```
IDLE → ANALYZING → RETRIEVING → GENERATING → VALIDATING → DONE
                                                         ↘ ESCALATE
```

**Router files:**
- `packages/atlas-core/src/langgraph/worker.ts` — 8-node orchestrator
- Transition matrix: `scripts/atlas/hmm-transition-matrix.mjs` (SQL aggregation, 90-day window)
- Pattern store: `error_logs + error_feedback → tool_execution_stats`

**9-score ToolCandidate** (Mastra framework):
```
semantic × 0.30 + intent × 0.18 + schemaFitness × 0.15 + authority × 0.12
+ recency × 0.10 + cost × 0.08 + latency × 0.04 + diversity × 0.03
```

**ToolResultClass** (8 variants): `SUCCESS | PARTIAL | EMPTY | SCHEMA_MISMATCH | TIMEOUT | AUTH_FAIL | RATE_LIMIT | INFRA_ERROR`

**Rule:** Recovery is bounded to ONE retry per state, then ESCALATE. No infinite loops.

---

## XII. ACP — Agent Control Plane (6-Stage Pipeline)

```
User prompt
  → ACP Planner (cache vs search decision)
  → BitFrost L1 (Redis exact, ~5ms)
  → BitFrost L2 (Qdrant semantic, ~2-5s)
  → Cache miss → Search pipeline (rg → Postgres → Qdrant → Neo4j)
  → Packet compaction (4,800 tokens target, not 18,800)
  → Gemma4 synthesis (LAST — never bypasses memory hierarchy)
```

**Memory hierarchy (like CPU caches):**
```
Gemma4 ← L1 BitFrost Redis ← L2 Postgres JSONB ← L3 Qdrant ← L4 Neo4j ← L5 Filesystem ← L6 Internet
```

**Topo-byte prefilter:** `ace:topo:{topoClass}:{queryHash}` (TTL 300s) checked BEFORE Qdrant ANN.

---

## XIII. A2A — Agent-to-Agent Protocol

- **AgentCard:** `GET /.well-known/agent.json` — live at `src/routes/.well-known/agent.json/+server.ts`
- **TRACE MCP:** `:8788` (42 tools, StreamableHTTP, stateless)
- **MCP tools:** 29 tools at `src/mcp/server.ts` (FastMCP, auth-guarded)
- **Agent API:** `POST /api/ai/agent` — native + A2A Task + SSE streaming

**Allowed TRACE tools for Gemma4 agents:**
- Graph: `graph_expand_neighborhood`, `topology_search_4d`, `graph_pagerank_top`
- KAG: `kag_search`, `context_build_kv_packet`
- DB: `db_schema_overview`, `db_table_inspect`, `db_relation_map`

**Forbidden from agents:** `db_drop_*`, `graph_delete_*`, any mutation that bypasses canonical truth flow.

---

## XIV. AHP — Analytic Hierarchy Process (Microsoft 2026)

Multi-criteria ranking for agent tool selection. Used when HMM Viterbi score ties exist.

**Pairwise comparison matrix dimensions:**
1. Semantic relevance to query
2. Schema fitness (tool input ↔ available data)
3. Execution cost (latency + resource)
4. Authority (PageRank of source packets)
5. Recency (updated_at freshness)

**Consistency ratio threshold:** CR < 0.10 (discard matrix and fall back to HMM Viterbi if CR ≥ 0.10)

**Implementation:** `packages/atlas-core/src/routing/ahp-tool-selector.ts` (stub — not yet wired)

---

## XV. GSD Boundary and Command Allowlist

GSD (Get Stuff Done / Open GSD `@opengsd/gsd-core`) is a planning engine, not an issue tracker.

**Use GSD for:**
- `/gsd-plan-phase` — before implementing a new phase
- `/gsd-verify` — after implementation, goal-backward check
- `/gsd-debug` — structured debugging with scientific method

**Do NOT use GSD for:**
- Tracking task states across sessions (use traceability fields + commit messages)
- Storing feature spec lifecycle (use contract files with `CONTRACT_VERSION`)
- Replacing `npm run` verification commands

**GSD command allowlist (bounded — explicit approval required for everything else):**
```
ALLOWED without approval:
  npm run *:dry
  npm run *:audit
  npm run smoke:*
  npm run check
  node scripts/atlas/*.mjs --dry-run
  git status / git log / git diff

REQUIRES EXPLICIT APPROVAL:
  database migrations (drizzle-kit migrate / manual SQL)
  --apply backfills (any script without --dry-run)
  Neo4j or Qdrant bulk writes
  Docker volume operations (docker compose down, docker volume prune)
  git push
  production environment changes
```

**Current GSD package:** `npx @opengsd/gsd-core@latest` (Open GSD — active continuation).

---

## XVI. HyperRAG Pipeline — Current Status and Required Fixes

File: `sveltekit-frontend/src/lib/server/hyperrag/hyperrag-packet-pipeline.ts`

**Worktree patch status (agent-a374dce2):**

| Item | Status |
|------|--------|
| Unknown labels preserved (not fabricated as IDs) | `IMPLEMENTED_IN_WORKTREE` |
| Summary keys use SHA-256 | `IMPLEMENTED_IN_WORKTREE` |
| `title_id` and `feature_label` separated | `IMPLEMENTED_IN_WORKTREE` |
| `directoryPath` derived from `canonicalSourceRef` | `IMPLEMENTED_IN_WORKTREE` |
| `indexPackets()` fails instead of silent stub | `IMPLEMENTED_IN_WORKTREE` |
| Direct runtime probe passed | `DIRECT_PROBE_VERIFIED` |
| **Merged to canonical branch** | ❌ `NOT_YET_MERGED` |
| Full test suite passing | ❌ `NOT_FULL_TEST_VERIFIED` |
| Runtime index verified (Qdrant + TurboVec + BitFrost) | ❌ `NOT_RUNTIME_INDEX_VERIFIED` |

**Remaining semantic issue:** `normalizeFeatureIds()` returning "MyFeature" violates its return contract. Rename to `resolveFeatureCandidates()` and return `FeatureResolution[]` (see Section VIII).

**Required next fixes (in order):**

1. Merge worktree patch into canonical branch
2. Rename `normalizeFeatureIds()` → `resolveFeatureCandidates()` with typed return
3. Add focused tests not depending on broken global Svelte test setup (or fix setup separately)
4. Implement projection outbox — `indexPackets()` must NOT directly own Qdrant/TurboVec/Redis writes:

```typescript
async indexPackets(packets: HyperRAGPacketState[]): Promise<void> {
  await enqueuePacketProjectionRequests(
    packets.map((packet) => ({
      packetKey: packet.packetKey,
      requestedProjections: ['qdrant-hybrid', 'turbovec', 'bitfrost']
    }))
  );
}
// atlas_projection_outbox → atlasProjectionWorker → Qdrant + TurboVec + BitFrost
```

5. Expose missing `@msgpack/msgpack` as typed health status `binaryRegistryStatus: DEGRADED_DEPENDENCY_MISSING` — not repeated `console.warn`

**Original gaps (still valid):**

| Gap | Line | Issue | Fix |
|-----|------|-------|-----|
| GAP-2 | ~258 | `summarizeChunk()` uses `stream: false` | Must use `stream: true` with SSE delta assembly |
| GAP-3 | ~307 | `hashChunk()` uses djb2 | Replace with `crypto.createHash('sha256')` |

---

## XVII. AE Training Control Plane (Current Status)

| ID | File | Status |
|----|------|--------|
| AE-01 | `scripts/atlas/lib/ae-train-contract.mjs` | **MERGED_TO_BRANCH** (commit 28137b8f) |
| AE-02 | `proto/atlas/ae_train.proto` | **MERGED_TO_BRANCH** |
| AE-03 | `scripts/atlas/ae-train-manifest.mjs` | **MERGED_TO_BRANCH** |
| AE-04 | `scripts/atlas/train-autoencoder-768-64.mjs` | **MERGED_TO_BRANCH** |
| AE-05 | `tests/ae-train-contract.spec.ts` | **MERGED_TO_BRANCH** |
| AE-06 | `tests/ae-train-manifest.spec.ts` | **MERGED_TO_BRANCH** |
| AE-07 | npm scripts wired | **MERGED_TO_BRANCH** |
| AE-08 | Train frozen baseline weights | **PROPOSED** |
| AE-09 | Save weights to Redis `ae:weights:768→64:v1.0.0` | **PROPOSED** |
| AE-10 | Write `sae_latent` feature_records in live run | **PROPOSED** — blocked by Qdrant embedding gap |
| AE-11 | Validate latent routing in ACE context packing | **PROPOSED** |

---

## XVIII. Atlas Admin Page Structure

Build the native Atlas workstation UI first. Atlas is the parent application — not Plane.

```
/admin/atlas                    Atlas Workstation dashboard
/admin/atlas/work-items         Work item sync (GitHub Issues → Plane optional)
/admin/atlas/specs              Feature specs with lifecycle status
/admin/atlas/recommendations    Ranked repair recommendations with evidence
/admin/atlas/agent-runs         HMM router run history
/admin/atlas/retrieval          Retrieval lane debugger
/admin/atlas/projections        Projection outbox + mirror health
/admin/atlas/features           Feature registry (resolveFeatureCandidates)
```

**Drizzle schema (minimum planning alignment):**

```typescript
export const atlasSpecs = pgTable('atlas_specs', {
  specId:          text('spec_id').primaryKey(),
  title:           text('title').notNull(),
  revision:        integer('revision').notNull(),
  status:          text('status').notNull(),
  contractVersion: text('contract_version'),
  bodyMarkdown:    text('body_markdown').notNull(),
  contentHash:     text('content_hash').notNull(),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const atlasWorkItemLinks = pgTable('atlas_work_item_links', {
  linkId:       uuid('link_id').defaultRandom().primaryKey(),
  provider:     text('provider').notNull(),       // 'github' | 'plane'
  externalId:   text('external_id').notNull(),
  externalUrl:  text('external_url').notNull(),
  specId:       text('spec_id').references(() => atlasSpecs.specId),
  syncHash:     text('sync_hash').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
});

export const atlasRecommendations = pgTable('atlas_recommendations', {
  recommendationId: uuid('recommendation_id').defaultRandom().primaryKey(),
  traceId:          uuid('trace_id').notNull(),
  workItemLinkId:   uuid('work_item_link_id').references(() => atlasWorkItemLinks.linkId),
  intent:           jsonb('intent').notNull(),
  evidence:         jsonb('evidence').notNull(),
  proposedAction:   jsonb('proposed_action').notNull(),
  confidence:       real('confidence').notNull(),
  risk:             text('risk').notNull(),
  status:           text('status').notNull(),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull(),
});
```

**Start with GitHub Free as first work-item provider.** Add Plane through a provider interface when needed — use `/work-items/` (not deprecated `/issues/`).

---

## XIX. used_concepts Backfill (Current Blocker)

Fan-out lane is BLOCKED: `with_concepts / summarized` must reach ≥ 0.90 before:
- Neo4j `USED_CONCEPT` edges can be populated
- ACE hop-2 context expansion works
- Karpathy authority blend has full signal

**Check:** `npm run atlas:lineage:verify` → must show `missing_concepts < 10%`

---

## XX. Verification Gates

### Gate: AE Contract
```bash
node -e "
const c = await import('./scripts/atlas/lib/ae-train-contract.mjs');
console.assert(c.CONTRACT_VERSION === 'atlas-ae-train-v1');
console.log('AE contract OK');
"
```

### Gate: AE Manifest (dry-run)
```bash
npm run atlas:ae:train:manifest:dry
# Expected: [manifest] DRY RUN — no files written
```

### Gate: AE Train (dry-run)
```bash
npm run atlas:ae:train:dry
# Expected: loads manifest, fetches 0 vectors (empty manifest), exits cleanly
```

### Gate: Canonical Tests
```bash
cd sveltekit-frontend && npx vitest run tests/ae-train-contract.spec.ts tests/ae-train-manifest.spec.ts
# Expected: all tests pass
```

### Gate: Lineage
```bash
node scripts/atlas/verify-feature-lineage.mjs
# Expected: pass: true, all orphan_* counters at 0
```

### Gate: Graphify 5-pillar smoke
```bash
npm run smoke:graphify
# Expected: 8 present, ≤ 4 absent (Neo4j/Redis absence acceptable without full GDS lane)
```

---

## XXI. Traceability Fields (every work item)

```yaml
id: ATLAS-AE-08
title: "Train frozen baseline AE weights"
status: PROPOSED          # one of the 8 task-state levels
spec_version: atlas-ae-train-v1
depends_on:
  - ATLAS-AE-07           # manifest + runner merged
  - QDRANT-EMBED-01       # codebase_chunks_768 populated with code embeddings
blocks:
  - ATLAS-AE-09           # weight persistence
  - ATLAS-AE-10           # feature_records write
evidence:
  - commit: 28137b8fe0    # AE control-plane merge
  - dry_run: "npm run atlas:ae:train:dry passes"
gate: LIVE_VERIFIED       # required status before marking DONE
assigned_to: ""
created: 2026-07-17
```

---

## XXII. Llama-Server Hard Rules

**`:8090` (TurboQuant/Gemma4) — ALWAYS `stream: true`:**
```javascript
const res = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
  method: 'POST',
  body: JSON.stringify({ model: MODEL, messages, max_tokens: 1024, stream: true }),
  signal: AbortSignal.timeout(90_000),
});
// Assemble SSE deltas — see CLAUDE.md section "Gemma4 LLM Call Rules"
```

**Why:** Thinking block fills `reasoning_content` first. `stream: false` exhausts `max_tokens` before `content` tokens appear.

**`:11434` (Ollama) — `think: false`, `stream: false`:**
```javascript
body: JSON.stringify({ model, messages, stream: false, think: false,
  options: { temperature: 0.3, num_predict: 200 } })
// Read: data.message?.content?.trim()
```

---

## XXIII. Issue Decomposition Template

```markdown
## [ATLAS-{DOMAIN}-{ID}] {Title}

**Status:** {one of 8 task-state levels}
**Spec:** {contract version or N/A}
**Blocked by:** {list of work item IDs or "none"}
**Blocks:** {list of work item IDs or "none"}

### Problem
{What is broken or missing. One paragraph, concrete.}

### Root cause
{Why it's broken. Distinguish PROPOSED (never existed) from REGRESSION (worked before).}

### Fix plan
{Numbered steps. Each step has a verification command.}

### Verification gate
```bash
{command that proves this is LIVE_VERIFIED}
```

### Evidence
- File: `{path}:{line}`
- Commit: `{hash}`
- Dry-run output: `{snippet}`
```

---

## XXIV. What NOT to Do

- ❌ Say "implemented" when status is `PROPOSED` or `IMPLEMENTED_IN_WORKTREE`
- ❌ Join on `feature_id` alone — always include `source_ref`
- ❌ Write to Redis/Qdrant before Postgres write succeeds
- ❌ Use `stream: false` with llama-server :8090
- ❌ Use AE 64-dim latents for ANN search
- ❌ Write 768-dim vectors to 384-dim Qdrant collections
- ❌ Run Neo4j GDS PageRank before KMeans/SOM emit `community_id`
- ❌ Delete cold storage without `restore_verified == true`
- ❌ Create synthetic `feature:*` keys in Postgres as source_ref
- ❌ Mark a task DONE without a live Postgres verification gate
- ❌ Call Gemma4 :8090 for embeddings (chat only)
- ❌ Let HMM router retry more than once per state (escalate instead)
- ❌ Bypass canonical truth flow via direct Redis or Qdrant writes
- ❌ Call `normalizeFeatureIds()` — it doesn't exist; use `resolveFeatureCandidates()`
- ❌ Use feature labels as concept IDs (`'Retrieval Pipeline'` is a label, `'retrieval'` is the ID)
- ❌ Let HyperRAG own Qdrant/TurboVec/Redis writes directly — use projection outbox
- ❌ Emit repeated `console.warn` for missing dependencies — detect once, expose via health status
- ❌ Enable unrestricted skip-permissions for Atlas production infrastructure
- ❌ Make Plane the parent application — Atlas Workstation (SvelteKit) is the parent
- ❌ Duplicate GitHub/Plane fields in Postgres — store only `ExternalWorkItemLink`
- ❌ Place raw float arrays in `.okf` JSON — use Arrow or feature-registry references

---

## XXV. Svelte 5 / TypeScript Rules (Quick Reference)

- **Runes only:** `$state()`, `$derived()`, `$effect()`, `$props()` — no `export let`, `$:`, `on:click`
- **`.svelte.ts` files:** runes work here; plain `.ts` files: runes are inert, use plain TS
- **Imports:** use `.js` extension (bundler resolves `.ts`) — EXCEPT `$lib/server/db/client` (no extension)
- **Bits UI:** `import { Dialog } from 'bits-ui'` — NOT melt-ui builders
- **Icons:** `import Icon from '$lib/components/ui/Icon.svelte'` — NOT `@lucide/svelte`
- **Button:** `import Button from '$lib/components/ui/Button.svelte'` (default import)
- **ESM scripts:** use `await import(...)` for `.mjs` contract files in vitest specs

---

*Contract owner: Parent Atlas Control Plane*
*Supersedes: any prior "engineering prompt" in chat history or worktrees*
*Update trigger: identity chain change, pipeline ordering change, new hard rule in CLAUDE.md, or vocabulary addition*
