# AGENTS regen — RegenContext loader contracts (Phase A1)

**Status**: DESIGN ONLY — no implementation. Phase A1 of `2026-05-11_agents-directory-card-regen.md`.
**Created**: 2026-05-11
**Scope**: typed interfaces for the 7 data loaders that compose `RegenContext` — the shared input bundle every section builder reads.

---

## 0. Verified shapes (read FIRST — these anchor every type below)

### codebase-graph.json (4.2 MB, fresh 2026-05-10 20:21)

```typescript
// Top-level keys (verified via Node REPL):
{
  mode:            string;           // 'fast-ast'
  createdAt:       string;           // ISO
  repoRoot:        string;
  fileCount:       number;
  routeCount:      number;
  componentCount:  number;
  apiCount:        number;
  dbTableMentions: number;
  todoCount:       number;
  dirCount:        number;
  qdrantUpserted:  number;
  graphJsonPath:   string;
  codebaseMapPath: string;
  gateStats:       Record<string, unknown>;
  files:           Record<string, CodebaseGraphFile>;       // keyed by index '0','1',...
  directories:    Record<string, CodebaseGraphDir>;         // keyed by dirPath
  tags:           Record<string, unknown>;
  audit:          Record<string, unknown>;
}

// Per-file shape (verified):
interface CodebaseGraphFile {
  rel:           string;              // 'src/lib/server/ace/context-assembler.ts'
  ext:           string;              // '.ts'
  tags:          string[];
  summary:       string;
  imports:       string[];            // resolved static imports
  exports:       string[];
  dynImports:    string[];            // resolved dynamic imports
  reExports:     string[];
  routeHandlers: string[];            // ['GET', 'POST', ...]
  drizzleRefs:   string[];            // pgTable names referenced
  todos:         string[];
  components:    string[];
  isRoute:       boolean;
  isSvelteComp:  boolean;
  isTest:        boolean;
  lineCount:     number;
  // ... more fields trail off
}
```

### Redis `gpu:karpathy:scores` (live, 11 entries)

```typescript
// HGET 'gpu:karpathy:scores' '<file_path>' returns JSON string:
{
  pr:        number;   // PageRank (Neo4j)
  attn:      number;   // attention score (GPU)
  authority: number;   // ace:authority:top blend
  blend:     number;   // 0.4·pr + 0.3·attn + 0.3·authority
}
```

### Redis `ace:cluster:summary:*` (currently empty — populated by cluster-synthesis worker)

```typescript
// Key pattern: ace:cluster:summary:<clusterId>
// Value: prose string (~200–800 chars), LLM-synthesized per SOM cluster
```

### Postgres `feature_implementations` (live, in canonical schema)

```typescript
// schema-postgres.ts line 4352
interface FeatureImplementationRow {
  id:          string;     // uuid
  featureKey:  string;     // unique, e.g. 'ace.stage_a0'
  featureName: string;
  description: string | null;
  laneIds:     string[];   // ['L0', 'L7']
  status:      string;     // 'active' | 'experimental' | ...
  confidence:  number;
  createdAt:   string;
  updatedAt:   string;
}

// Adjacent: feature_file_edges maps featureKey → filePath
interface FeatureFileEdgeRow {
  featureKey: string;
  filePath:   string;
  // ... edge metadata
}
```

### Postgres `context_timeline` (live, integer user_id)

```typescript
// schema-postgres.ts ::contextTimeline
interface ContextTimelineRow {
  id:        string;
  userId:    number | null;
  sessionId: string;
  eventType: string;        // 'file.access' | 'file.dwell_long' | 'citation_saved' | ...
  pipeline:  string;
  payload:   Record<string, unknown>;   // contains filePath/dirPath
  createdAt: string;
  // ... see schema for full set
}
```

### tsconfig.json paths

```typescript
// Standard SvelteKit tsconfig: paths is { '<alias>': ['<targetGlob>'] }
//   '$lib':         ['./src/lib'],
//   '$lib/*':       ['./src/lib/*'],
//   '$app/*':       ['./.svelte-kit/runtime/app/*'],
```

---

## 1. Loader contracts (7 functions + composer)

All loaders live under `src/lib/server/agents/regen/loaders/`. Each loader is **independently testable** — no cross-dependencies between loaders.

```typescript
// src/lib/server/agents/regen/loaders/index.ts (re-exports the 7 + composer)

// ── Loader 1: codebase graph ──────────────────────────────────────────────────
// src/lib/server/agents/regen/loaders/graph.ts

export interface CodebaseGraph {
  createdAt:    string;                                  // for staleness check
  repoRoot:     string;
  files:        Map<string, CodebaseGraphFile>;          // keyed by rel path (re-indexed)
  directories:  Map<string, CodebaseGraphDir>;           // keyed by dirPath
  fileCount:    number;
  dirCount:     number;
}

export interface CodebaseGraphFile {
  rel:           string;
  ext:           string;
  tags:          readonly string[];
  summary:       string;
  imports:       readonly string[];
  exports:       readonly string[];
  dynImports:    readonly string[];
  reExports:     readonly string[];
  routeHandlers: readonly string[];
  drizzleRefs:   readonly string[];
  isRoute:       boolean;
  isSvelteComp:  boolean;
  isTest:        boolean;
  lineCount:     number;
}

export interface CodebaseGraphDir {
  rel:        string;
  fileCount:  number;
  // Plus whatever else the graphify pipeline emits — typed as Record<string, unknown>
  // for now; firm up after first regen run.
  [k: string]: unknown;
}

export interface LoadGraphResult {
  graph:       CodebaseGraph;
  loadedAt:    string;        // ISO
  staleMs:     number;        // age since graph.createdAt
  staleWarning: boolean;       // true if staleMs > 24h
  source:      string;        // 'docs/graph/codebase-graph.json'
}

export async function loadGraph(opts?: { path?: string }): Promise<LoadGraphResult>;
//   - Reads + parses docs/graph/codebase-graph.json (4.2 MB)
//   - Converts files/directories from object-of-records → Map for O(1) lookup
//   - Re-indexes files by 'rel' path (drops numeric-index keys)
//   - Returns staleWarning=true when graph.createdAt > 24h ago

// ── Loader 2: Karpathy blend scores ──────────────────────────────────────────
// src/lib/server/agents/regen/loaders/karpathy.ts

export interface KarpathyBlend {
  pr:        number;
  attn:      number;
  authority: number;
  blend:     number;
}

export interface LoadKarpathyResult {
  scores:    Map<string, KarpathyBlend>;   // filePath → blend
  loadedAt:  string;
  entryCount: number;
  source:    string;                        // 'redis:gpu:karpathy:scores'
}

export async function loadKarpathyScores(opts?: {
  redisKey?: string;                        // default 'gpu:karpathy:scores'
}): Promise<LoadKarpathyResult>;
//   - HGETALL gpu:karpathy:scores
//   - JSON.parse each value into KarpathyBlend
//   - On parse error per entry: skip + log; don't fail the whole load
//   - Returns empty Map when key missing (signals "cron hasn't run yet")

// ── Loader 3: SOM cluster summaries ──────────────────────────────────────────
// src/lib/server/agents/regen/loaders/cluster-summaries.ts

export interface LoadClusterSummariesResult {
  summaries:  Map<string, string>;          // clusterId → prose summary
  loadedAt:   string;
  entryCount: number;
  source:     string;                        // 'redis:ace:cluster:summary:*'
}

export async function loadClusterSummaries(opts?: {
  keyPattern?: string;                       // default 'ace:cluster:summary:*'
}): Promise<LoadClusterSummariesResult>;
//   - SCAN with pattern; GET each key
//   - clusterId derived from key suffix
//   - Empty result is acceptable — section builder falls back to feature rows

// ── Loader 4: Feature implementations + file edges ───────────────────────────
// src/lib/server/agents/regen/loaders/features.ts

export interface FeatureRow {
  featureKey:  string;
  featureName: string;
  description: string;                       // '' when null in DB
  laneIds:     readonly string[];
  status:      string;
  confidence:  number;
  /** All files associated with this feature, from feature_file_edges */
  files:       readonly string[];
}

export interface LoadFeaturesResult {
  features:   FeatureRow[];
  byDir:      Map<string, FeatureRow[]>;     // dirPath → features whose files live there
  loadedAt:   string;
  source:     string;                         // 'postgres:feature_implementations'
}

export async function loadFeatures(): Promise<LoadFeaturesResult>;
//   - SELECT * FROM feature_implementations
//   - SELECT * FROM feature_file_edges
//   - JOIN in TS; build byDir index keyed by dirname(filePath)
//   - On Postgres unavailable: returns empty arrays + logs (signal builder falls
//     back to schema/route signals)

// ── Loader 5: Activity rollup ────────────────────────────────────────────────
// src/lib/server/agents/regen/loaders/activity.ts

export interface ActivityEntry {
  dirPath:        string;
  score:          number;        // weighted sum, 24h half-life
  lastAccessedAt: string;        // ISO
  eventCount:     number;
}

export interface LoadActivityResult {
  byDir:        Map<string, ActivityEntry>;
  loadedAt:     string;
  rowsScanned:  number;
  source:       string;                       // 'postgres:context_timeline'
}

export async function loadActivity(opts?: {
  /** How far back to scan. Default 7 days. */
  lookbackHours?: number;
  /** Weight per event type. Defaults from CLAUDE.md RL signal taxonomy. */
  weights?:       Record<string, number>;     // { 'file.access': 0.1, 'file.dwell_long': 1.0, ... }
  /** Half-life for time decay in hours. Default 24. */
  halfLifeHours?: number;
}): Promise<LoadActivityResult>;
//   - SELECT event_type, payload, created_at FROM context_timeline
//     WHERE created_at > now() - interval '7 days'
//     AND event_type IN ('file.access', 'file.dwell_short', 'file.dwell_long',
//                        'citation_saved', 'recommendation_click')
//   - Extract filePath from payload.filePath OR payload.path
//   - dirPath = dirname(filePath)
//   - Apply weight × exp(-(ageHours / halfLifeHours) × ln(2))
//   - Sum per dirPath
//   - Postgres-down → returns empty Map (graceful)
//   - 3s timeout per Promise.race to bound regen run time

// ── Loader 6: tsconfig path aliases ──────────────────────────────────────────
// src/lib/server/agents/regen/loaders/path-aliases.ts

export interface LoadPathAliasesResult {
  aliases:     Map<string, string>;          // '$lib' → 'src/lib', '$lib/*' → 'src/lib/*'
  loadedAt:    string;
  source:      string;                        // 'tsconfig.json' or 'sveltekit/.svelte-kit/tsconfig.json'
}

export async function loadPathAliases(opts?: {
  tsconfigPath?: string;
}): Promise<LoadPathAliasesResult>;
//   - Read tsconfig.json; parse compilerOptions.paths
//   - Strip './' prefix from values for consistency
//   - Cache for the duration of one regen run (file rarely changes)

// ── Loader 7: Existing card (for incremental update) ─────────────────────────
// src/lib/server/agents/regen/loaders/existing-card.ts

export interface LoadExistingCardResult {
  card:     AgentsDirectoryCard | null;       // null when no prior card exists
  source:   'redis' | 'couchdb' | 'none';
  loadedAt: string;
}

export async function loadExistingCard(
  dirPath: string
): Promise<LoadExistingCardResult>;
//   - readCardFromRedis(dirPath) first (cheap)
//   - On miss: CouchDB GET dir:${dirHash} (durable fallback)
//   - On both miss: { card: null, source: 'none' }
//   - Per-dir call (not batched) — used by composeCard per directory

// ── Composer ──────────────────────────────────────────────────────────────────
// src/lib/server/agents/regen/loaders/build-context.ts

export interface BuildRegenContextOptions {
  /** Skip individual loaders for fast-path / smoke tests. */
  skipActivity?:        boolean;
  skipClusterSummaries?: boolean;
  /** When provided, used in lieu of fresh Postgres query. */
  fixtures?: {
    features?: LoadFeaturesResult;
    activity?: LoadActivityResult;
  };
}

export async function buildRegenContext(
  opts?: BuildRegenContextOptions
): Promise<RegenContext>;
//   - Runs loaders 1-6 in parallel via Promise.allSettled
//   - Per-loader failure → uses empty defaults + logs to diagnostics
//   - Aggregates into a RegenContext (see parent design doc §2)
//   - Sets runStartedAt = new Date().toISOString()
//   - Returns final context (loader 7 happens per-dir inside composeCard, not here)
```

---

## 2. Diagnostics shape returned by `buildRegenContext`

```typescript
export interface RegenContextDiagnostics {
  loaderResults: {
    graph:           { ok: boolean; durationMs: number; reason?: string };
    karpathyScores:  { ok: boolean; durationMs: number; entryCount: number; reason?: string };
    clusterSummaries: { ok: boolean; durationMs: number; entryCount: number; reason?: string };
    features:        { ok: boolean; durationMs: number; featureCount: number; reason?: string };
    activity:        { ok: boolean; durationMs: number; rowsScanned: number; reason?: string };
    pathAliases:     { ok: boolean; durationMs: number; aliasCount: number; reason?: string };
  };
  totalDurationMs: number;
  /** Loader-level warnings (non-fatal): stale graph, empty cache, etc. */
  warnings: Array<{ loader: string; message: string }>;
}

// Attached to RegenContext as ctx.diagnostics; surfaced in CLI output.
```

---

## 3. Failure modes (loader-level, complementary to design doc §5)

| Failure | Loader | Behavior |
|---|---|---|
| `codebase-graph.json` missing | graph | Returns empty graph + warning. Section builders short-circuit with defaults. |
| `codebase-graph.json` malformed JSON | graph | Throws; regen run aborts (this is a real signal — graphify failed). |
| Graph file > 24h old | graph | `staleWarning: true` set; regen continues. CLI prints warning at start. |
| Redis unreachable | karpathyScores, clusterSummaries | Returns empty Map + warning. Section builders use defaults. |
| Redis returns garbage JSON | karpathyScores | Per-entry skip + log; remaining entries load. |
| Postgres unreachable | features, activity | Returns empty + warning. Section builders fall back to graph/Redis signals. |
| `context_timeline` query > 3s | activity | Promise.race aborts; returns empty Map + warning. |
| tsconfig.json missing or malformed | pathAliases | Returns minimal default `{ '$lib': 'src/lib' }`; warning. |
| CouchDB unreachable | existingCard | Returns `{ card: null, source: 'none' }`. New cards still write fine. |

**Rule**: no loader failure aborts the regen run except a malformed graph JSON (signal that graphify is broken — fix upstream first).

---

## 4. Test strategy (Phase A1 specific)

| Test | Tool | Asserts |
|---|---|---|
| `loadGraph()` parses real `codebase-graph.json` in < 500ms | vitest | Map sizes match `fileCount` + `dirCount` from JSON header |
| `loadGraph()` returns staleWarning when fixture > 24h | vitest + fixture | `staleWarning: true`, no exception |
| `loadKarpathyScores()` handles empty hash | vitest + redis-mock | Returns empty Map without throwing |
| `loadKarpathyScores()` skips garbage JSON entries | vitest + redis-mock | One bad entry + two good → result has 2 entries |
| `loadFeatures()` joins features + edges correctly | vitest + pg fixture | byDir Map contains expected feature for known file path |
| `loadActivity()` applies time decay | vitest + pg fixture | Recent event score > older event score with same weight |
| `loadActivity()` respects 3s timeout | vitest + slow-pg-mock | Aborts at 3s with empty result, no throw |
| `loadPathAliases()` parses real tsconfig | vitest | Contains `$lib` alias |
| `buildRegenContext()` parallel-loads + diagnostics shape | vitest | All 6 loaders fire concurrently; diagnostics has 6 entries |
| `buildRegenContext()` survives 1 loader failure | vitest + chaos-mock | Returns context with 5 successful + 1 warning |

---

## 5. Build order (Phase A1 only, ~4h)

| Step | Effort | Deliverable |
|---|---|---|
| A1.1 | 30 min | Type definitions in `loaders/types.ts` (shared interfaces above) |
| A1.2 | 45 min | `loaders/graph.ts` — JSON parse + Map conversion |
| A1.3 | 30 min | `loaders/karpathy.ts` — Redis HGETALL + per-entry parse |
| A1.4 | 20 min | `loaders/cluster-summaries.ts` — SCAN pattern |
| A1.5 | 30 min | `loaders/features.ts` — Drizzle queries + byDir build |
| A1.6 | 45 min | `loaders/activity.ts` — context_timeline rollup + decay math |
| A1.7 | 15 min | `loaders/path-aliases.ts` — tsconfig parse |
| A1.8 | 15 min | `loaders/existing-card.ts` — Redis-then-CouchDB lookup |
| A1.9 | 30 min | `loaders/build-context.ts` — Promise.allSettled orchestrator |
| A1.10 | 20 min | Vitest suite per loader (10 tests above) |

Total: ~4h. No I/O cross-dependencies — loaders are independently testable.

---

## 6. What this does NOT do (Phase A1 boundary)

- **Does NOT write to any store** — loaders are read-only.
- **Does NOT call any section builder** — that's Phase A2.
- **Does NOT compose `AgentsDirectoryCard` objects** — that's `composeCard` in Phase A2.
- **Does NOT validate cards** — no Zod parsing here.
- **Does NOT call MCP / gRPC / sidecars** — only the 4 existing stores (graph file, Redis, Postgres, CouchDB).
- **Does NOT touch `cases.user_id`** — operator-only.
- **Does NOT trigger any cron or queue** — pure on-demand loaders.

---

## 7. Cross-references

- Parent design doc: `docs/design/2026-05-11_agents-directory-card-regen.md`
- Card schema: `src/lib/server/agents/agents-card-store.ts`
- ACE consumer (downstream): `src/lib/server/ace/agents-context-source.ts`
- Karpathy daily cron: `scripts/karpathy-gpu-enrich.mjs`
- Graph generator: `scripts/index-codebase-fast.mjs` (writes `codebase-graph.json`)
- Cluster-summary writer: `scripts/cluster-summaries.mjs` (writes `ace:cluster:summary:*`)
- CLAUDE.md §"Karpathy GPU Authority Blend + Redis ACE Cache" — explains blend math + cache layout

---

**Doc length**: ~290 lines. Reads cold: anyone landing on Phase A1 should be able to write each loader from this spec alone.
