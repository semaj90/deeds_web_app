# RG-Atlas Search Pipeline — rg + Karpathy + Qdrant + MARCO + LangExtract

**Status**: DESIGN + TODO list. No implementation in this doc.
**Created**: 2026-05-11
**Companions**:
- `docs/audit/2026-05-11_feature-spec-implementation-audit.md` — feature inventory
- `docs/design/2026-05-11_evidence-board-merge-plan.md` — M1-M9 board ports
- `docs/design/2026-05-11_autoencoder-qdrant-wire-in.md` — autoencoder centroids
- `.vscode/tasks.json` 🔍🗺️🧠 — the 3 Karpathy search tasks that were the starting point

---

## 0. The vision

`rg` finds lexical matches → indexed by a `rg_search_<timestamp>_<uuid>` run id → fed through GPU Karpathy blend → multi-query Qdrant rerank → MS-MARCO mini cross-encoder pointwise → LangExtract structured validation → cosine-blend final order → persisted as a row in Postgres for replay/audit. Eventually the manifold4 columns + autoencoder centroids ride on top for 4D topological transforms via CUDA Graphs.

Every layer already exists in the repo. The work is **glue + a typed contract + Postgres state tables**, not new infrastructure.

---

## 1. Verified existing infrastructure (read-once)

| Asset | Path / key | State |
|---|---|---|
| `rg` binary | system | available via Grep tool |
| Embedding | Ollama `embeddinggemma:latest` via `/api/embed` | live |
| Karpathy blend scores | Redis `gpu:karpathy:scores` hash | sparse top-N (~11 entries) |
| Karpathy refresh | `scripts/karpathy-gpu-enrich.mjs` daily cron | live |
| GPU primitives | `tensorrt_bridge.node` — `attentionScoreGPU`, `kmeansWithCentroids`, `trainSOM`, `pageRankGPU`, `rewardScoreGPU` | live, RTX 3060 Ti |
| Qdrant collection | `codebase_chunks_768`, named vectors `content` (768d) + `signature` (768d) | live |
| Cross-encoder reranker | `src/lib/server/retrieval/cross-encoder-reranker.ts` — Gemma4 pointwise ranking, L0+L1 Redis cache | live |
| LangExtract reranker | `src/lib/server/retrieval/langextract-reranker.ts` — 3-pass GRPO entity/section/fusion | live |
| `manifold4 real[]` columns | `research_summaries`, `embedded_summaries`, `codebase_chunk_index` | live (per CLAUDE.md verification) |
| Autoencoder weights | Redis `ace:autoencoder:weights` (W1/b1/W2/b2 csv f32, dim 768→256→64) | live, trained 2026-05-10 |
| `chunk_hit_log` table | per-chunk retrieval analytics | live |
| CUDA Graph capture | spec'd in `memory/gpu-weight-architecture.md` | deferred behind Nsight baseline |
| TRACE MCP `:8788` | `kb.trace_search`, `kag.multi_lane_search`, `topology.search_near` | live (88 tools registered, 42 mount per May 9 smoke) |

**Constraint**: 4D topological transforms via CUDA Graphs are explicitly DEFERRED — that's a "do later, after Nsight + autoencoder centroids land" item, NOT in the first cut.

---

## 2. Pipeline (ASCII)

```
            Operator query: "drag-drop upload zone"
                              │
                              ▼
                ┌─────────────────────────────┐
                │ Stage 1 — rg lexical sweep  │
                │   rg -l "<regex>" src/      │
                │   → RgHit[] {file, line,    │
                │     snippet, lineNumber}    │
                └────────────┬────────────────┘
                             │
                             ▼  INSERT INTO rg_search_runs
                ┌─────────────────────────────┐
                │ Stage 2 — Persist runId     │
                │   rg_search_<ts>_<uuid>     │
                │   → run_id UUID returned     │
                └────────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Stage 3 GPU  │  │ Stage 4      │  │ Stage 5      │
   │ Karpathy     │  │ Multi-query  │  │ Qdrant centroid│
   │ semantic     │  │ rewriter     │  │ clustering   │
   │ per hit      │  │ (Gemma4)     │  │ via k-means  │
   │              │  │ → 3-5 vars   │  │ on top-K     │
   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                ┌─────────────────────────────┐
                │ Stage 6 — Qdrant multi-query│
                │   union ANN over content    │
                │   vector for each variant   │
                │   → QdrantHit[]             │
                └────────────┬────────────────┘
                             │
                             ▼
                ┌─────────────────────────────┐
                │ Stage 7 — Cross-encoder     │
                │   MS-MARCO MiniLM (L0+L1    │
                │   Redis cache) per (q, doc) │
                │   → marco_score [0-1]       │
                └────────────┬────────────────┘
                             │
                             ▼
                ┌─────────────────────────────┐
                │ Stage 8 — LangExtract       │
                │   3-pass GRPO entity/       │
                │   section/fusion validation │
                │   → grounded entities,      │
                │     section_score           │
                └────────────┬────────────────┘
                             │
                             ▼
                ┌─────────────────────────────┐
                │ Stage 9 — Cosine final blend│
                │  final = 0.4·marco +        │
                │          0.3·karpathy +     │
                │          0.2·cos_query +    │
                │          0.1·langextract    │
                └────────────┬────────────────┘
                             │
                             ▼  INSERT INTO rg_search_hits
                ┌─────────────────────────────┐
                │ Stage 10 — Persist results  │
                │   per-hit rows linked to    │
                │   run_id for replay         │
                └────────────┬────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
       Return to caller            Stage 11 (DEFERRED) —
       RgSearchAtlasResult         4D manifold transform
                                   + CUDA Graph rerank
                                   + SOM centroid match
```

---

## 3. TypeScript contract

```typescript
// src/lib/server/rg-atlas/types.ts (NEW)

export interface RgSearchAtlasOptions {
  /** Search query — regex for stage 1, NL for stages 4-8 */
  query:             string;
  /** Directories to scan in stage 1. Default: ['sveltekit-frontend/src']. */
  paths?:            string[];
  /** File-type filter for rg. Default: ['ts', 'svelte']. */
  fileTypes?:        string[];
  /** Multi-query variant count for stage 4. Default 3. */
  variantCount?:     number;
  /** Top-K per Qdrant variant in stage 6. Default 20. */
  topKPerLane?:      number;
  /** Toggle MS-MARCO cross-encoder rerank (stage 7). Default true. */
  enableMarcoRerank?: boolean;
  /** Toggle LangExtract validation (stage 8). Default true. */
  enableLangExtract?: boolean;
  /** Persist run + hits to Postgres. Default true. */
  persist?:          boolean;
  /** Final blend weights. Default { marco:0.4, karpathy:0.3, cos:0.2, lang:0.1 }. */
  weights?:          { marco: number; karpathy: number; cos: number; lang: number };
}

export interface RankedHit {
  filePath:       string;
  lineNumber?:    number;     // when rg-derived
  snippet?:       string;
  source:         'rg' | 'qdrant' | 'union';
  scores: {
    rgMatch:      number;     // 1 if rg hit, 0 if qdrant-only
    karpathy:     number;     // blend from gpu:karpathy:scores (0 if not in hash)
    qdrantCosine: number;     // raw Qdrant cosine score
    marco:        number;     // cross-encoder MS-MARCO pointwise (0-1)
    langExtract:  number;     // grounding score from langextract-reranker (0-1)
    final:        number;     // weighted blend, the order key
  };
  clusterId:      number;     // k-means cluster from stage 5 (or -1 if none)
  langExtractEntities?: Array<{
    type: string;
    text: string;
    sourceOffset: [number, number];
  }>;
}

export interface RgSearchAtlasResult {
  /** Stable run ID written to Postgres. Format: rg_<unix_ms>_<uuid8> */
  runId:        string;
  query:        string;
  hits:         RankedHit[];
  clusters: Array<{
    id:        number;
    centroid:  number[];      // 768-dim
    memberFiles: string[];
  }>;
  diagnostics: {
    rgMs:           number;
    embedMs:        number;
    gpuMs:          number;
    qdrantMs:       number;
    marcoMs:        number;
    langExtractMs:  number;
    totalMs:        number;
    rgHitCount:     number;
    qdrantHitCount: number;
    finalHitCount:  number;
    persistedToDb:  boolean;
  };
}

/** Top-level orchestrator. */
export async function runRgSearchAtlas(
  opts: RgSearchAtlasOptions
): Promise<RgSearchAtlasResult>;
```

---

## 4. Postgres schema (Drizzle)

```typescript
// src/lib/server/db/schema-postgres.ts — append to canonical

export const rgSearchRuns = pgTable('rg_search_runs', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  /** rg_<unix_ms>_<uuid8> — human-readable timestamp + UUID prefix */
  runKey:      varchar('run_key', { length: 64 }).notNull().unique(),
  query:       text('query').notNull(),
  args:        jsonb('args').notNull().default(sql`'{}'::jsonb`),
  diagnostics: jsonb('diagnostics').notNull().default(sql`'{}'::jsonb`),
  /** Set when stage 5 clustering completes; null otherwise */
  clusterCount: integer('cluster_count'),
  userId:      integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('rg_runs_user_created').on(t.userId, t.createdAt),
  index('rg_runs_runkey').on(t.runKey),
]);

export const rgSearchHits = pgTable('rg_search_hits', {
  id:          uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId:       uuid('run_id').notNull().references(() => rgSearchRuns.id, { onDelete: 'cascade' }),
  filePath:    text('file_path').notNull(),
  lineNumber:  integer('line_number'),
  snippet:     text('snippet'),
  source:      varchar('source', { length: 16 }).notNull(),  // 'rg' | 'qdrant' | 'union'
  /** Per-stage scores — JSONB so weights can evolve without schema changes */
  scores:      jsonb('scores').notNull().default(sql`'{}'::jsonb`),
  /** Final weighted score — the sort key, indexed */
  finalScore:  real('final_score').notNull().default(0),
  clusterId:   integer('cluster_id'),
  /** LangExtract grounded entities (offset, type, text) */
  entities:    jsonb('entities').notNull().default(sql`'[]'::jsonb`),
  rank:        integer('rank').notNull(),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('rg_hits_run_rank').on(t.runId, t.rank),
  index('rg_hits_final_score').on(t.finalScore),
  index('rg_hits_cluster').on(t.clusterId),
  // Manual SQL: GIN on scores JSONB + entities JSONB
]);

export type RgSearchRun = typeof rgSearchRuns.$inferSelect;
export type RgSearchHit = typeof rgSearchHits.$inferSelect;
```

Migration file: `drizzle/manual/2026-05-11_rg_atlas_tables.sql` — manual SQL (not journaled, per project convention) with GIN indexes Drizzle can't express.

---

## 5. Cosine retrieval contract (Stage 9)

```typescript
// src/lib/server/rg-atlas/cosine-blend.ts (NEW, ~80 LoC)

/**
 * Compute the final weighted blend for each hit. Pure function;
 * no I/O. Caller supplies pre-computed component scores.
 */
export function cosineBlend(
  hits: ReadonlyArray<Omit<RankedHit, 'scores' | 'clusterId'> & {
    scores: Omit<RankedHit['scores'], 'final'>;
  }>,
  weights: { marco: number; karpathy: number; cos: number; lang: number }
): RankedHit[];
//   - final = w.marco × s.marco + w.karpathy × s.karpathy
//             + w.cos × s.qdrantCosine + w.lang × s.langExtract
//   - Clamps each component to [0, 1] before weighting
//   - Returns hits sorted by final score desc, with clusterId placeholder
//     (filled later by clustering stage)
```

---

## 6. TODO list (build order, ranked by leverage × dependency)

| # | Task | Effort | Risk | Depends |
|---|---|---|---|---|
| **T1** | Add `rgSearchRuns` + `rgSearchHits` to Drizzle schema | 30 min | Low | — |
| **T2** | Manual SQL migration `2026-05-11_rg_atlas_tables.sql` (idempotent, IF NOT EXISTS, GIN indexes) | 30 min | Low | T1 |
| **T3** | `src/lib/server/rg-atlas/types.ts` — type contracts (§3 + §5) | 30 min | Low | — (parallel with T1) |
| **T4** | `scripts/rg-atlas/run-rg.mjs` — wraps `rg` exec + parses output → `RgHit[]` | 1 hr | Low | T3 |
| **T5** | `src/lib/server/rg-atlas/persist.ts` — INSERT INTO rgSearchRuns + rgSearchHits | 45 min | Low | T1, T2 |
| **T6** | `src/lib/server/rg-atlas/embed.ts` — batched Ollama `/api/embed` with Redis cache | 45 min | Low | — |
| **T7** | `src/lib/server/rg-atlas/karpathy-blend.ts` — per-hit HGET + `attentionScoreGPU` fallback when not in hash | 45 min | Medium | T6 |
| **T8** | `src/lib/server/rg-atlas/multi-query.ts` — Gemma4 query rewriter (3 variants, JSON output) | 45 min | Low | — |
| **T9** | `src/lib/server/rg-atlas/qdrant-union.ts` — multi-variant Qdrant ANN, dedup + union | 45 min | Low | T6, T8 |
| **T10** | `src/lib/server/rg-atlas/kmeans-cluster.ts` — wraps existing `kmeansWithCentroids` for hit embeddings | 30 min | Low | T6 |
| **T11** | Wire MS-MARCO cross-encoder rerank — `cross-encoder-reranker.ts` already exists, just call it | 30 min | Low | T9 |
| **T12** | Wire LangExtract — `langextract-reranker.ts` already exists, just call it | 30 min | Low | T11 |
| **T13** | `src/lib/server/rg-atlas/cosine-blend.ts` — pure-function final blend | 30 min | Low | — |
| **T14** | `src/lib/server/rg-atlas/run.ts` — top-level `runRgSearchAtlas()` orchestrator | 1 hr | Medium | T3-T13 |
| **T15** | `scripts/rg-atlas/cli.mjs` — CLI wrapper for local invocation | 30 min | Low | T14 |
| **T16** | VS Code task — "🔍🧠 RG-Atlas: Full pipeline (rg+karpathy+qdrant+marco+langextract)" with prompt input | 15 min | Low | T15 |
| **T17** | `/api/rg-atlas/search/+server.ts` route — accept `RgSearchAtlasOptions`, return result | 45 min | Low | T14 |
| **T18** | Vitest unit suite for cosineBlend + persist + multi-query (mock external deps) | 1 hr | Low | T13, T5, T8 |
| **T19** | `npm run rg-atlas:smoke` script — runs a fixed query, asserts persisted row exists | 30 min | Low | T15 |
| **T20** | MCP tool `kb.rg_atlas_search` exposing the pipeline to the agentic loop | 1 hr | Medium | T17 |

**Total budget**: ~13 hours across 20 tasks. Most are ≤45 min each; only T14 + T18 + T20 cross the 1-hour mark.

**Parallelizable**: T1/T2/T3, T4/T6/T8/T10/T13.

---

## 7. Deferred (Stage 11 — 4D + CUDA Graphs)

Captured here so the design isn't lost between sessions:

| # | Task | Why deferred |
|---|---|---|
| **D1** | Wire autoencoder centroids (per `2026-05-11_autoencoder-qdrant-wire-in.md` phase 3) into stage 5 clustering | Needs autoencoder backfill (P1 of that doc) first |
| **D2** | Add `manifold4`-aware distance to stage 6 Qdrant union | Needs `manifold4` columns populated for `codebase_chunks_768`-derived data |
| **D3** | CUDA Graph capture for the rerank kernel (stage 7 + 8 fused) | Needs Nsight baseline proving SM utilization ≥ 70% — explicit per CLAUDE.md |
| **D4** | SOM autoencoder cluster centroid match (stage 11) | Trained SOM exists; needs hookup |
| **D5** | TRACE MCP `kb.rg_atlas_search` tool registration (T20) | Lower priority than the script + route |

---

## 8. What this does NOT do

- **Does NOT replace `kb.trace_search` or `kag.multi_lane_search`.** Those are MCP-side surfaces. This pipeline can OPTIONALLY register as a sister MCP tool (T20), but doesn't replace existing tools.
- **Does NOT replace Pattern A/B/C** in the 3 VS Code tasks committed at `6201be5d50`. Those stay as fast first-look tools. This pipeline is the deep version when full ranking matters.
- **Does NOT touch `cases.user_id` or other identity columns.** Independent of the migration.
- **Does NOT add new MCP/gRPC sidecars.** Pure TypeScript glue over existing services.
- **Does NOT block on the schema-finalization migration.** Both tables are NEW; conflict-free.
- **Does NOT promise CUDA Graphs.** D3 is explicitly deferred behind Nsight.

---

## 9. Hard gates (per task)

Each commit MUST:

1. Pass `svelte-check` with 0 NEW errors
2. Add the new piece behind a feature flag where applicable (env var or opt-in arg)
3. Preserve `rg_search_runs.run_key` format (`rg_<unix_ms>_<uuid8>`) for stable replay
4. Use Redis for ephemeral state, Postgres for durable state, never the other way
5. Reuse existing rerankers — do NOT reimplement MS-MARCO or LangExtract

---

## 10. Cross-references

- `.vscode/tasks.json` (commit `6201be5d50`) — 3 Karpathy search tasks (Patterns A/B/C) — fast first-look tools, complement this pipeline
- `src/lib/server/retrieval/cross-encoder-reranker.ts` — stage 7 dep
- `src/lib/server/retrieval/langextract-reranker.ts` — stage 8 dep
- `scripts/karpathy-gpu-enrich.mjs` — stage 3 score source
- `simd-bridge/cpp/build/Release/tensorrt_bridge.node` — `attentionScoreGPU`, `kmeansWithCentroids`
- `docs/design/2026-05-11_autoencoder-qdrant-wire-in.md` — D1, D2 dependency
- `memory/gpu-weight-architecture.md` — CUDA Graph capture (D3) reference
- `docs/audit/2026-05-11_route-forensic-triage.md` — sister design doc tone reference
