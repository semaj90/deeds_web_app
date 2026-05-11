# AGENTS directory-card semantic index — Regen contract

**Status**: DESIGN ONLY — no implementation in this doc. Lands in 4 phases.
**Created**: 2026-05-11
**Companion**: `2026-05-11_autoencoder-qdrant-wire-in.md` (sister contract for the inference lane).
**Sequence position**: step 4 in the operator's "immediate sequence" (post P1 mechanical fixes).

---

## 0. Verified prerequisites (read before reviewing)

| Asset | Path / key | State |
|---|---|---|
| Card Zod schema | `src/lib/server/agents/agents-card-store.ts::agentsDirectoryCardSchema` | LIVE, 17 fields |
| Card store I/O | `agents-card-store.ts::{cardIdForDir, writeCardToRedis, readCardFromRedis, readCardsByIds}` | LIVE |
| ACE consumer | `src/lib/server/ace/agents-context-source.ts::queryAgentsCards` | LIVE, lookup Redis → Qdrant → CouchDB |
| Redis hot tier | hash `agents:dir:{dirHash}` | LIVE (24h TTL) |
| CouchDB durable | DB `karpathy_wiki`, doc id `dir:{dirHash}` | LIVE |
| Qdrant payload tags | `som_cluster` + `topo_class` + (new) `agents_card_id` | partial (agents_card_id pending) |
| Karpathy authority | Redis hash `gpu:karpathy:scores` | LIVE, 11 entries, 24h TTL |
| Cluster summaries | Redis hash `ace:cluster:summary:*` | LIVE |
| Activity timeline | Postgres `context_timeline` (integer user_id, indexed on user/created) | LIVE |
| Graph imports | `docs/graph/codebase-graph.json` (4.2 MB, fresh 2026-05-10 20:21) | LIVE |
| Neo4j edges | `SHARES_TAGS`, `SIMILAR_TOPOLOGY`, `BELONGS_TO_CLUSTER`, `IMPORTS` | LIVE |
| AGENTS.md files | 383 dir-level | mostly auto-gen boilerplate (per audit doc) |

**Constraint per operator**: cards are **LEXICON HINTS, NOT canonical spec**. The ACE assembler is allowed to use `card.summary` as soft context, never as a hard fact about feature shape — canonical truth lives in code + tests + `master_agents.md`.

---

## 1. Architecture (ASCII)

```
                ┌───────────────────────────────────────────────────────┐
                │                Existing signal sources                │
                │                                                       │
                │  docs/graph/codebase-graph.json   (imports + dirs)    │
                │  gpu:karpathy:scores              (authority blend)   │
                │  ace:cluster:summary:*            (SOM cluster prose) │
                │  Neo4j SHARES_TAGS / SIMILAR_TOPOLOGY edges            │
                │  Qdrant som_cluster + topo_class payloads             │
                │  context_timeline (file.access / dwell / cite events) │
                │  master_agents.md feature_implementations rows         │
                │  tsconfig.json paths                                   │
                │  Existing AGENTS.md (preserves @auto:summary content)  │
                └───────────────────────────────────────────────────────┘
                                       │
                                       ▼
                         ┌─────────────────────────────┐
                         │ scripts/agents-md-regen.mjs │
                         │   --dir <path> | --all      │
                         │   --dry-run     | --force   │
                         └──────────────┬──────────────┘
                                        │
                ┌───────────────────────┼───────────────────────┐
                ▼                       ▼                       ▼
       ┌────────────────┐     ┌────────────────┐     ┌──────────────────┐
       │ 8 section      │     │ composeCard()  │     │ diffAndWrite()   │
       │ builders       │     │ (validates +   │     │ (skip if hash    │
       │ (pure fns)     │     │  hashes)       │     │  unchanged)      │
       └────────────────┘     └────────────────┘     └────────┬─────────┘
                                                              │
                                       ┌──────────────────────┼──────────────────────┐
                                       ▼                      ▼                      ▼
                              writeCardToRedis()     CouchDB upsert         Qdrant payload
                              (hot, 24h TTL)         (durable)              backfill
                                                                            (agents_card_id,
                                                                             feature_keys[])
```

---

## 2. Section-builder contracts (8 builders + 1 composer)

Each builder is a **pure function**: takes inputs, returns a Partial<AgentsDirectoryCard> subset. No I/O. The wrapping script does the I/O.

```typescript
// src/lib/server/agents/regen/section-builders.ts (NEW, ~250 LoC total)

// Shared input bundle — built once per regen run, passed to every builder.
export interface RegenContext {
  /** Parsed graph from docs/graph/codebase-graph.json */
  graph:            CodebaseGraph;
  /** Karpathy scores hash from Redis (file → { pr, attn, authority, blend }) */
  karpathyScores:   Record<string, { pr: number; attn: number; authority: number; blend: number }>;
  /** Cluster summaries from Redis (clusterId → prose) */
  clusterSummaries: Record<string, string>;
  /** master_agents.md feature_implementations rows */
  featureRows:      Array<{ featureKey: string; dirGlob: string; status: string }>;
  /** tsconfig path aliases (e.g. '$lib': 'src/lib/*') */
  pathAliases:      Record<string, string>;
  /** Optional: existing card for incremental update (preserves hand-edits) */
  existingCard?:    AgentsDirectoryCard | null;
  /** Activity rollups from context_timeline (dirPath → score, lastAccessed) */
  activity:         Map<string, { score: number; lastAccessedAt: string | null }>;
  /** When the regen run started — used for lastIndexedAt */
  runStartedAt:     string;  // ISO
}

// ── 1. Identity ───────────────────────────────────────────────────────────────
export function buildIdentitySection(
  dirPath: string
): Pick<AgentsDirectoryCard, 'id' | 'dirPath' | 'title'>;
// id        = cardIdForDir(dirPath) — already exported from agents-card-store
// title     = humanize(basename(dirPath))  — "src/lib/server/ace" → "ACE"

// ── 2. Summary ────────────────────────────────────────────────────────────────
export function buildSummarySection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'summary'>;
// Priority:
//   1. existingCard?.summary if hand-edited (detected by absence of @auto sentinel)
//   2. clusterSummaries[ctx.graph.dirs[dirPath].somCluster] sliced to 2000 chars
//   3. featureRows whose dirGlob matches → join description (legal fallback)
//   4. "" (empty) — surfaced in diagnostics

// ── 3. Imports ────────────────────────────────────────────────────────────────
export function buildImportsSection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'staticImports' | 'dynamicImports' | 'pathAliases'>;
// staticImports  = top 20 most-imported FROM this dir (outbound static edges)
// dynamicImports = top 10 most-imported FROM this dir (outbound dynamic edges)
// pathAliases    = entries from tsconfig matching dirPath (e.g. '$lib/server/ace')

// ── 4. Features + routes + schema ─────────────────────────────────────────────
export function buildFeatureSection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'featureKeys' | 'routeSurfaces' | 'schemaTables'>;
// featureKeys   = featureRows filtered by dirGlob match
// routeSurfaces = +server.ts / +page.svelte / +page.server.ts paths inside dir
// schemaTables  = grep("pgTable\\(\\s*'(\\w+)'") inside dir's *.ts files

// ── 5. Topology (Qdrant/Neo4j/CouchDB anchors) ───────────────────────────────
export function buildTopologySection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'qdrantTags' | 'neo4jNodeId' | 'couchDocId'>;
// qdrantTags  = dedup(payload.som_cluster, payload.topo_class) for chunks in dir
// neo4jNodeId = derived from dirHash (Neo4j MERGE happens at write time, not here)
// couchDocId  = `dir:${dirHash}` (deterministic)

// ── 6. Status + recommendations ───────────────────────────────────────────────
export function buildStatusSection(
  dirPath: string,
  ctx:     RegenContext,
  partial: Pick<AgentsDirectoryCard, 'routeSurfaces' | 'schemaTables' | 'featureKeys'>
): Pick<AgentsDirectoryCard, 'auditStatus' | 'recommendations'>;
// auditStatus rules (ordered, first-match wins):
//   - featureRows[i].status === 'SHIPPED' for ANY matching feature   → SHIPPED
//   - routeSurfaces.length >= 1 && schemaTables.length >= 1          → SHIPPED
//   - schemaTables.length >= 1 && routeSurfaces.length === 0         → SPEC_ONLY
//   - featureKeys.length >= 1 && no schema + no routes               → PARTIAL
//   - tag in dirPath includes 'experimental' or 'phase'              → EXPERIMENTAL
//   - else                                                            → SPEC_ONLY
//
// recommendations = top 3 sibling dirs by combined score:
//   0.5 * Neo4j SHARES_TAGS edge weight + 0.3 * SIMILAR_TOPOLOGY + 0.2 * recent_activity_overlap

// ── 7. Activity rollup ────────────────────────────────────────────────────────
export function buildActivitySection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'activityScore' | 'lastAccessedAt'>;
// activityScore  = ctx.activity.get(dirPath)?.score ?? 0
// lastAccessedAt = ctx.activity.get(dirPath)?.lastAccessedAt ?? undefined

// ── 8. Logic gates ────────────────────────────────────────────────────────────
export function buildGatesSection(
  dirPath: string,
  ctx:     RegenContext
): Pick<AgentsDirectoryCard, 'gates'>;
// gates = boolean map of evaluated audit gates relevant to this dir
//   - G-AI-01 (RAG present)  → schemaTables includes 'evidence_vectors' or qdrantTags non-empty
//   - G-AI-02 (LLM-cached)   → schemaTables includes 'code_llm_index'
//   - G-FM-XX                → from file-move-audit-gates.md if applicable
// Source: declarative config in src/lib/server/agents/regen/gates.config.ts
//         (NOT hard-coded — adding a gate = adding a row in that config)

// ── Composer ──────────────────────────────────────────────────────────────────
export interface ComposeResult {
  card:        AgentsDirectoryCard;        // Validated against agentsDirectoryCardSchema
  contentHash: string;                     // sha256 over normalized fields
  changed:     boolean;                    // true if hash differs from existingCard
}

export function composeCard(
  dirPath: string,
  ctx:     RegenContext
): ComposeResult;
// Pipeline:
//   1. Call all 8 builders in order
//   2. Merge into a single object
//   3. Set lastIndexedAt = ctx.runStartedAt
//   4. Compute contentHash over normalized fields (excluding lastIndexedAt + activityScore)
//   5. Validate via agentsDirectoryCardSchema.parse() — throws on shape violation
//   6. Compare contentHash to ctx.existingCard?.contentHash → changed bool
//   7. Return ComposeResult
```

---

## 3. Regen script CLI contract

```typescript
// scripts/agents-md-regen.mjs (NEW, ~150 LoC — thin orchestrator over section-builders)

interface RegenCliOptions {
  /** Single directory mode. Mutually exclusive with --all. */
  dir?:       string;
  /** Full sweep over all dirs in codebase-graph.json. */
  all?:       boolean;
  /** Print proposed cards + diff; don't write. */
  dryRun?:    boolean;
  /** Force re-encode even if contentHash unchanged. */
  force?:     boolean;
  /** Cap number of dirs processed (smoke-test convenience). */
  limit?:     number;
  /** Write only Redis (skip CouchDB + Qdrant). Default: write all 3. */
  redisOnly?: boolean;
}

interface RegenCliResult {
  dirCount:       number;
  changedCount:   number;
  unchangedCount: number;
  failedCount:    number;
  failures:       Array<{ dir: string; error: string }>;
  durationMs:     number;
  signalSourcesLoaded: {
    graphNodes:      number;
    karpathyScores:  number;
    clusterSummaries: number;
    featureRows:     number;
    activityRows:    number;
  };
}

export async function runRegen(opts: RegenCliOptions): Promise<RegenCliResult>;
```

### npm scripts to add

```json
"agents:regen":       "node scripts/agents-md-regen.mjs --all",
"agents:regen:dry":   "node scripts/agents-md-regen.mjs --all --dry-run",
"agents:regen:dir":   "node scripts/agents-md-regen.mjs --dir",
"agents:regen:smoke": "node scripts/agents-md-regen.mjs --all --limit 10 --dry-run"
```

---

## 4. Idempotency + hand-edit policy

### Idempotency
- `contentHash` is computed over a deterministic field subset (excludes `lastIndexedAt`, `activityScore` — those drift every run).
- If `existingCard.contentHash === composed.contentHash`, skip write entirely. `changed: false`.
- Re-running `agents:regen` on an unchanged codebase produces **zero writes** to Redis/CouchDB/Qdrant.

### Hand-edit policy (markdown-level)
- The AGENTS.md file mirrored from the card includes section markers:
  ```markdown
  <!-- @auto:summary start -->
  This directory implements ACE context assembly.
  <!-- @auto:summary end -->
  
  ## Operator notes (preserved across regen)
  The TODO comment in context-assembler.ts:1247 is intentional — wait for Phase D.
  ```
- The regen reads existing `AGENTS.md`, parses `@auto:*` blocks, replaces only those.
- Anything outside `@auto:*` markers is preserved verbatim.
- If no `@auto:*` markers exist (legacy file), regen wraps the whole file in `@auto:summary` for the first run.

### Card-store hand-edit policy
- The card store itself is regen-owned — no human edits expected at the Redis/CouchDB layer.
- If you want to override card content, edit the markdown — next regen picks it up via `existingCard.summary` preservation.

---

## 5. Failure modes

| Failure | Symptom | Mitigation |
|---|---|---|
| `codebase-graph.json` stale (> 24h since last graphify) | Imports section reflects old structure | `runRegen()` logs warning if graph mtime > 24h ago; doesn't block. Operator runs `npm run graphify:semantic` to refresh. |
| Redis weight hash empty | Karpathy authority score = 0 across cards | Section builders return defaults; `auditStatus` falls back to schema/route signals only. Logged as `signalSourcesLoaded.karpathyScores: 0`. |
| Neo4j unreachable (cold-start race) | recommendations section empty | Try-catch per dir; per-dir failure goes in `failures[]`. Other dirs continue. |
| context_timeline query times out (>3s) | activityScore = 0 across cards | Promise.race with 3s timeout → returns empty Map → builder uses defaults. |
| Zod parse failure on composed card | Shape violation; one dir fails | `composeCard()` throws inside per-dir loop; logged to `failures[]`; other dirs continue. |
| Concurrent write — two regens at once | Last-writer-wins to Redis | Acquire Redis lock `agents:regen:lock` (TTL 10min) at run start; second runner exits if lock held. |
| File-system race (dir moves mid-run) | `dirPath` no longer exists | `composeCard()` checks dir existence before running builders; logs `dir-missing` and skips. |

---

## 6. Test strategy

| Layer | Tool | Asserts |
|---|---|---|
| Unit | vitest | Each builder is pure: same inputs → same output (deterministic). 8 builders × ~3 cases each = 24 tests. |
| Unit | vitest | `composeCard` produces a Zod-valid card; `contentHash` is stable across runs with same input |
| Unit | vitest | `auditStatus` derivation respects rule order (SHIPPED beats SPEC_ONLY when both signals present) |
| Integration | vitest + redis-mock | `writeCardToRedis` round-trip; idempotent re-write produces no diff |
| Integration | vitest + redis-mock | Hand-edited summary survives regen when `@auto:summary` markers present |
| E2E (smoke) | `npm run agents:regen:smoke` | 10-dir dry-run produces deterministic output across two consecutive runs (diff is empty) |
| E2E (writes) | `npm run agents:regen` against staging Redis | After full run, `agents:dir:*` key count > 0; ACE Stage A0 retrieval picks up at least one card |

---

## 7. Build order

| Phase | Deliverable | Effort | Gate |
|---|---|---|---|
| **A1** | `RegenContext` loader (one fn per source: graph, karpathy, cluster summaries, feature rows, activity, tsconfig). NO writes. | 4h | Unit tests on each loader; `signalSourcesLoaded` counts > 0 against live data. |
| **A2** | 8 section builders (pure fns) + `composeCard` + Zod validation | 4h | Vitest unit suite ≥ 24 tests, all green; `composeCard` deterministic across 100 runs of same input. |
| **A3** | `agents-md-regen.mjs` CLI + Redis writer + lock + diff-and-skip | 3h | Smoke test `--all --limit 10 --dry-run` runs in <5s and produces same hash on second run. |
| **A4** | CouchDB writer + Qdrant payload backfill (`agents_card_id` + `feature_keys[]`) | 3h | After full run, Qdrant chunk in dir has `agents_card_id` payload; CouchDB doc count matches dir count. |
| **A5** | Section-marker hand-edit preservation (markdown layer) | 2h | Test: write AGENTS.md, hand-edit outside `@auto:*`, regen → hand-edit preserved. |
| **A6** | npm scripts + AGENTS.md doc update + `agents:regen:smoke` gate added to CI | 1h | Smoke gate green in CI dry-run. |

Total: ~17h. Parallelizable: A1 ↔ A2 (independent), A4 ↔ A5 (independent).

---

## 8. What this does NOT do

- **Does NOT modify the `AgentsDirectoryCard` schema.** Schema is frozen; regen produces cards that fit it.
- **Does NOT add a new MCP tool.** Regen output flows through existing `agents-context-source.ts` → ACE Stage A0. Model never directly fetches cards.
- **Does NOT create new Postgres tables.** All durable state lives in Redis (hot) + CouchDB (persistence) + Qdrant (payload tags).
- **Does NOT run `drizzle push` or apply migrations.** Reuses existing tables only.
- **Does NOT touch `cases.user_id` identity strategy.** P0 stays operator-only.
- **Does NOT call `buildHypergraph4D()`.** 4D rebuild is gated on P0 per operator instruction.
- **Does NOT replace `master_agents.md`.** Master remains the canonical feature atlas; cards are lexicon hints, not spec.
- **Does NOT replace `enrich-agents-md.mjs`.** That script populates audit-gate boilerplate; this script produces signal-bearing content. They coexist: enrich runs first (template scaffolding), regen runs second (real content for `@auto:*` blocks).
- **Does NOT remove existing AGENTS.md files.** Update-only; preserves hand-edits.
- **Does NOT add new gRPC clients.** No new sidecar dependencies.

---

## 9. Cross-references

- `src/lib/server/agents/agents-card-store.ts` — store I/O + schema (this regen WRITES through this store)
- `src/lib/server/ace/agents-context-source.ts` — ACE Stage A0 consumer (downstream of this regen)
- `scripts/karpathy-gpu-enrich.mjs` — daily cron that produces `gpu:karpathy:scores` (input to this regen)
- `docs/graph/codebase-graph.json` — import graph input
- `docs/audit/2026-05-11_feature-spec-implementation-audit.md` — feature-spec alignment context
- `next_steps/active/2026-05-10_production-mental-model.md` — Lane 3 (Retrieval) production bar
- `docs/design/2026-05-11_autoencoder-qdrant-wire-in.md` — sister contract (inference lane)
- `docs/audit/file-move-audit-gates.md` — gates referenced in `buildGatesSection`
- CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache" — explains blend math
- CLAUDE.md §"AGENTS.md Relationship Spine" — explains the Postgres spine tables

---

**Doc length**: ~310 lines. Reads cold: anyone running `npm run agents:regen` should be able to predict every section's source from this doc.