# CLAUDE.md archive — Unified Audit Gate System (G1-G55) + G4/G5 findings (verbatim)

Archived 2026-10-03 from root CLAUDE.md (size limit). Unchanged. Pointer section in CLAUDE.md keeps the decision tree and the open findings list.
Source range (pre-trim line numbers): 2481-2954.

---

## Unified Audit Gate System (47 Gates)

**Use cases:** (a) pre-archive safety, (b) post-wire verification, (c) infrastructure health audit.
**Automated:** `bash sveltekit-frontend/scripts/audit/orphan-detector.sh [dir]` covers Tier A (~10s).
**MSYS/Git Bash:** Use bash arrays for globs: `RG_GLOB=(--glob '*.ts')` then `"${RG_GLOB[@]}"`.

```bash
MODULE="ComponentName"   # or filename stem, API path, table name

# ══════════════════════════════════════════════════════════════
# TIER A: CODE CONNECTIVITY (run ALL for archive decisions)
# ══════════════════════════════════════════════════════════════

# G1: Static ESM imports
rg "from.*$MODULE" src/ --type ts --type svelte

# G2: Dynamic ESM imports (mcp/server.ts: 12, hooks.server.ts: 3, API routes: ~80+)
rg "import\(.*$MODULE" src/ --type ts --type svelte

# G3: CJS require (rare: proto, OCR, astVectorizer)
rg "require\(.*$MODULE" src/ --type ts

# G4: @vite-ignore variable imports (4 files: drizzle.ts, granite-docling.ts, fastjson.ts, CanvasBoard.svelte)
rg "@vite-ignore" src/ --type ts --type svelte -l

# G5: Barrel re-exports (37 index.ts files) — barrel consumers import MODULE transitively
rg "export.*from.*$MODULE" src/lib/ --type ts
rg "$MODULE" src/lib/components/*/index.ts src/lib/services/*/index.ts

# G6: SvelteKit load→data binding — +page.server.ts props consumed via $props().data (implicit)
# If MODULE is a route file (+page.svelte, +server.ts, +layout.svelte) → NOT an orphan

# G7: fetch('/api/...') wiring (193 files, 4865 refs) — server routes wired via client fetch()
rg "fetch.*$MODULE" src/ --type ts --type svelte

# G8: Event coupling (yorha: namespace, CustomEvent dispatch/listen)
rg "CustomEvent.*$MODULE\|addEventListener.*$MODULE\|dispatchEvent.*$MODULE" src/
rg "yorha:" src/ --type svelte -l   # 9 files use yorha: events

# G9: .svelte.ts store consumers (35 store files, 10+ consumers each)
rg "from.*$MODULE" src/ --glob "*.svelte" --glob "*.svelte.ts"

# ══════════════════════════════════════════════════════════════
# TIER B: DATA LAYER (run for DB/schema/vector changes)
# ══════════════════════════════════════════════════════════════

# G10: Drizzle schema refs — tables/enums from schema-postgres.ts (70+ tables, 14 enums)
rg "from.*schema-postgres" src/ --type ts -l
rg "$MODULE" src/lib/server/db/schema-postgres.ts

# G11: DB client import — MUST be db/client (node-postgres Pool), NOT db/index (postgres.js)
rg "from.*db/index" src/ --type ts     # WRONG — should be 0 hits
rg "from.*db/client" src/ --type ts    # CORRECT

# G12: Vector/Qdrant collection coupling — pgvector tables + Qdrant collection refs
rg "$MODULE" src/lib/server/vector/ --type ts
rg "collection.*$MODULE\|$MODULE.*collection" src/ --type ts

# ══════════════════════════════════════════════════════════════
# TIER C: INFRASTRUCTURE (run for service/infra changes)
# ══════════════════════════════════════════════════════════════

# G13: Docker service ports (5432 PG, 6379 Redis, 6333 Qdrant, 8333 SeaweedFS-S3, 9333 SeaweedFS-master, 5672 RabbitMQ)
rg "5432\|6379\|6333\|8333\|9333\|5672\|50051\|4222\|8095" src/lib/server/ --type ts -l

# G14: Native addon — .node binary via createRequire (libtorch-bridge, astVectorizer, simdjson)
rg "\.node['\")]\|createRequire" src/ --type ts -l   # 3 known consumers

# G15: Proto/gRPC contract — proto file consumers and gRPC client refs
rg "proto\|grpc\|gRPC" src/lib/server/ --type ts -l
# If changing a .proto: rg "ProtoEmbedding\|ProtoHealth" src/ --type ts

# G16: Worker thread coupling — compute-pool parent ↔ worker child refs
rg "worker_threads\|Worker\(\|compute-pool\|compute-worker" src/ --type ts --type js -l

# G17: Env variable / hardcoded URL — should use ENV.* getters, not literals
rg "localhost\|127\.0\.0\.1" src/lib/server/ --type ts   # should be 0 outside env.server.ts

# ══════════════════════════════════════════════════════════════
# TIER D: SECURITY + RUNTIME (run for API routes, new features)
# ══════════════════════════════════════════════════════════════

# G18: Auth guard — API route must check locals.user (358/386 routes covered)
rg "locals\.user\|requireAuth\|getSession" src/routes/api/$MODULE/ --type ts

# G19: Zod validation — API route should validate input (282/386 routes covered)
rg "import.*zod\|from.*zod\|z\.\|zodSchema" src/routes/api/$MODULE/ --type ts

# G20: SSR safety — browser-only APIs need onMount/typeof window guard
rg "window\.\|document\.\|localStorage\|IndexedDB" src/lib/$MODULE --type svelte
# If hits: verify guarded by onMount() or typeof window !== 'undefined'
# Or route has export const ssr = false

# ══════════════════════════════════════════════════════════════
# TIER E: SVELTE 5 RUNE COMPLIANCE (G21-G26 — added 2026-04-14/15)
# All gates MUST return 0 hits. Current baseline: all 0 ✅
# ══════════════════════════════════════════════════════════════

# G21: No Svelte 4 props (export let → $props())
rg "export\s+let\s+\w+" src/ --glob "*.svelte"

# G22: No Svelte 4 reactive declarations ($: → $derived/$effect)
rg "^\s*\$:[^:]" src/ --glob "*.svelte"

# G23: No Svelte 4 event directives (on:click → onclick)
rg "\bon:[a-z][a-z]+=" src/ --glob "*.svelte"

# G24: No createEventDispatcher in live code (callback props replace it)
rg "createEventDispatcher\(\)" src/ --glob "*.svelte"

# G25: No rune calls in plain .ts files (reactivity inert — use .svelte.ts)
rg "\$(?:state|derived|effect|props)\s*[(<]" src/lib/ --type ts --glob "!*.svelte.ts" --glob "!*.d.ts"

# G26: Route handler unit tests use the lazy-import pattern (added 2026-04-15)
# Every +server.ts and +page.server.ts test file MUST:
#   1. Declare // @vitest-environment node (top of file, before any imports)
#   2. Use vi.hoisted() for all mock variables referenced inside vi.mock() factories
#   3. Lazy-import the route handler inside beforeEach (not at module scope)
#   4. Cover 4 baseline cases: 401 unauth, 400 bad input, 200 success, degraded upstream
#
# Verify: all test files in tests/routes/ have the node env directive
rg "^// @vitest-environment node" tests/routes/ --glob "*.test.ts" --glob "*.spec.ts" -l
# Count should equal total test files in that dir (no file missing the directive)
#
# Automated: tests/runes/svelte5-rune-compliance.test.ts covers G21-G25 statically
# Automated: tests/routes/sveltekit-load-patterns.test.ts covers load() redirect + DB fallback
# Automated: tests/routes/sveltekit-form-actions.test.ts covers fail/message/redirect
```

```

```bash
# ══════════════════════════════════════════════════════════════
# TIER F: CONTEXTUAL GRAPH ANALYSIS (G27-G35 — added 2026-04-16)
# pytorch-graph N-API ops wired end-to-end through all pipelines
# ══════════════════════════════════════════════════════════════

# G27: pytorch-graph consumers — kmeansWithCentroids AND trainSOM must be imported
rg "kmeansWithCentroids|trainSOM" src/lib/server/ --type ts -l
# MUST return ≥2 files (som-topology-pipeline.ts + gpu-graph-analysis.ts)

# G28: SOM topology endpoint exists
ls src/routes/api/graph/som-topology/+server.ts
# MUST exist — draws Neo4j SIMILAR_TOPOLOGY edges from SOM BMU adjacency

# G29: Colab export endpoint exists
ls src/routes/api/graph/colab-export/+server.ts
# MUST exist — returns .ipynb JSON for Google Colab GPU processing

# G30: Compound parallel tasks — tasks.json has dependsOrder: "parallel"
rg '"dependsOrder".*"parallel"' ../.vscode/tasks.json
# MUST return ≥2 hits (Full Dataset Index + Graph Analysis Suite tasks)

# G31: Qdrant tag enrichment — som_cluster payload field written after SOM
rg "som_cluster" src/lib/server/ --type ts
# MUST return ≥1 hit — SOM BMU index written to codebase_chunks_768 payload

# G32: Neo4j topology edges — SIMILAR_TOPOLOGY relationship created
rg "SIMILAR_TOPOLOGY" src/lib/server/ --type ts
# MUST return ≥1 hit — SOM grid adjacency relationships in Neo4j

# G33: pageRankGPU wired in graph module — replaces JS loop for n≤2000
rg "pageRankGPU" src/lib/server/graph/ --type ts
# MUST return ≥1 hit (gpu-graph-analysis.ts imports + calls pytorch pageRankGPU)

# G34: attentionScoreGPU wired for ACE context weighting
rg "attentionScoreGPU" src/lib/server/ --type ts -l
# MUST return ≥1 file — used for query-weighted centroid scoring in graph analysis
# OR in context-assembler.ts for ACE chunk ranking

# G35: rewardScoreGPU available for GRPO pipeline
rg "rewardScoreGPU" src/lib/server/ --type ts -l
# Should return ≥1 file when GRPO reward scoring is wired to LangGraph service

# ── Neo4j query: verify SOM topology edges exist ──────────────────────
# Run at http://localhost:7474/browser
```cypher
MATCH ()-[r:SIMILAR_TOPOLOGY]->()
RETURN count(r) AS topologyEdges,
       count(DISTINCT startNode(r)) AS sourceNodes,
       count(DISTINCT endNode(r)) AS targetNodes
```

# ── VS Code: run all graph analysis gates ──────────────────────────────
# Task label: "🔍 Graph: Audit G27-G35 (pytorch-graph wiring gates)"
# Or run in terminal from workspace root:
node -e "
const addon = require('./simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const fns = ['kmeansWithCentroids','trainSOM','pageRankGPU','attentionScoreGPU','rewardScoreGPU'];
fns.forEach(f => console.log(f + ':', typeof addon[f] === 'function' ? 'EXPORTED' : 'MISSING'));
"
# All 5 MUST print 'EXPORTED'
```

**Rune compliance Neo4j queries** (http://localhost:7474):
```cypher
MATCH (n:CodebaseFile) WHERE n.isSvelteComponent = true
RETURN count(n) AS svelteFiles,
  sum(CASE WHEN n.hasSvelte4Props    THEN 1 ELSE 0 END) AS legacyExportLet,
  sum(CASE WHEN n.hasSvelte4Reactive THEN 1 ELSE 0 END) AS legacyReactive,
  sum(CASE WHEN n.hasSvelte4Events   THEN 1 ELSE 0 END) AS legacyOnEvent,
  sum(CASE WHEN n.hasRunesInPlainTs  THEN 1 ELSE 0 END) AS runesInPlainTs
```

Also check: config refs (`unocss.config.ts`, `svelte.config.js`, `vite.config.ts`), SvelteKit route files are NEVER orphans.

```bash
# ══════════════════════════════════════════════════════════════
# TIER G: GLYPH / CARTRIDGE / ACE AUDIT (G36-G47 — added 2026-04-16)
# Verifies shared schema, staged search, cache alignment, and
# Drizzle persistence for the Glyph/CHR97/ACE integration layer.
# ══════════════════════════════════════════════════════════════

# G36: Shared GlyphRecord schema exists
# Canonical type must include semantic, vector, topology, and render layers
rg "export interface GlyphRecord|type GlyphSection|type GlyphKind" src/lib/server/ --type ts
# MUST return ≥1 hit — the core unifying type across cartridge/tile/ACE

# G37: RuneData → GlyphRecord compatibility mapper exists
# Backward-compat bridge so existing CHR97 cartridge code keeps working
rg "runeToGlyphRecord|GlyphRecord.*RuneData|RuneData.*GlyphRecord" src/lib/server/ --type ts
# MUST return ≥1 hit — mapper from CHR97 RuneData into GlyphRecord

# G38: Staged cartridge search path exists
# Search must do: 4D/topology prefilter → attention rerank → 768d rerank/reward
rg "topology prefilter|scoreAttention|rewardScoreGPU|searchCartridge.*Float32Array" src/lib/server/ --type ts
# MUST return ≥1 hit — the staged search bridge

# G39: Section-aware tiling exists
# Glyphs must carry legal section labels for tile grouping
rg "FACTS|LEGAL_AUTHORITY|CLAIMS|PRAYER_HOLDING" src/lib/server/ --type ts
# MUST return ≥1 hit — section enum/const used in glyph tile grouping

# G40: Glyph prompt cache aligns to page boundaries
# Cache keys must tie to glyphId, pageIndex, or cartridge page identity
rg "glyphId|pageIndex|tileIndex|promptCacheKey|setFragment|getFragment" src/lib/server/ --type ts
# MUST return ≥1 hit — page-aligned cache contract

# G41: Tile atlas builder is wired (not dormant)
# buildGlyphTileAtlas must be reachable from a live route or rebuild path
rg "buildGlyphTileAtlas|searchGlyphTiles|invalidateGlyphAtlas|publishGlyphRebuild" src/ --type ts
# MUST return ≥2 hits — builder + at least one consumer/trigger

# G42: Redis slim/full atlas contract is explicit
# Cached atlases omit centroids (fine for UI); search paths must rehydrate
rg "centroid omitted from Redis|source: 'redis'|searchGlyphTiles" src/lib/server/ --type ts
# MUST return ≥1 hit — explicit contract comment or rehydration logic

# G43: CouchDB topology persistence exists
# Glyph atlas writes topology docs to CouchDB with stable doc shape
rg "glyph_topology|COUCHDB_DB|_couchSave" src/lib/server/ --type ts
# MUST return ≥1 hit — topology persistence path

# G44: RabbitMQ glyph rebuild trigger exists
# glyph.tile.rebuild publish path must be live after SOM rebuild or indexing
rg "glyph.tile.rebuild" src/lib/server/ --type ts
# MUST return ≥1 hit — queue-triggered rebuild

# G45: Drizzle schema stores glyph metadata
# Postgres must have columns/JSONB for section, tags, summary, somCluster,
# centroidId, grpoRewardScore, render/cache hints
rg "glyph_records|grpoRewardScore|somCluster|centroidId|recordJson" src/lib/server/db/ --type ts
# MUST return ≥1 hit — durable schema-backed glyph records

# G46: Barrel exports are narrow and stable
# Only approved glyph/cartridge types exported from server barrels
rg "from './glyph|from './cartridge|export type .*Glyph|export .*Glyph" src/lib/server/ --type ts
# Should return controlled set — no accidental internal exposure

# G47: Frontend route coverage exists
# At least one frontend consumer for cartridge and glyph features
rg "/api/cartridge/|/api/glyph/|glyph|cartridge" src/routes/ src/lib/ --type svelte
# MUST return ≥1 hit per feature area (cartridge export/search/stats, glyph atlas/tiles)
```

```bash
# ══════════════════════════════════════════════════════════════
# TIER H: SEARCH INTELLIGENCE + ANALYTICS (G48-G55 — added 2026-04-17)
# Verifies the analytics collection pipeline, Search Patterns API,
# ACE feedback loop (P1-A prompt leaderboard, P3-A cross-source rerank),
# and cache key consolidation (P2-A).
# ══════════════════════════════════════════════════════════════

# G48: Search Patterns API exports all 9 required top-level fields
# Response must include hotQueries, clusterHeat, variancePairs, chunkQuality,
# pipelineMemory, crossPipelineChamps, trending, didYouMean, meta
rg "pipelineMemory|crossPipelineChamps|trending|didYouMean" src/routes/api/analytics/search-patterns/+server.ts
# MUST return ≥4 hits (all four new fields returned in json())

# G49: search-analytics.ts exports all 6 required read-side functions
# (path corrected 2026-08-31 deep-audit: analytics/search-analytics.ts is now
# a barrel re-export; the real implementation lives under features/observability/)
rg "export async function get" src/lib/server/features/observability/search-analytics.ts
# MUST return ≥6 hits:
#   getHotQueries, getClusterHeatMap, getChunkQualitySignals,
#   getVariancePairs, getDidYouMeanSuggestions, getAllQuerySketches
#   (a 7th, getQloraSmartSuggestions, is also present — bonus, not required)

# G50: Chunk hit logging wired in ACE assembly (context-assembler.ts)
# (path corrected 2026-08-31 deep-audit: src/lib/server/ace/context-assembler.ts
# is a legitimate 361-line facade re-exporting only the top-level entry points
# — assembleACEContext, buildACEPromptCached, etc. — from the real 7,680-line
# implementation below. recordChunkHits/fetchTopQueryTags/webSearchToUnified are
# NOT separately re-exported through the facade, so grepping the facade path
# gives a false fail even though the live pipeline genuinely calls all of them
# internally from the re-exported entry points. Grep the real file.)
rg "recordChunkHits" src/lib/server/features/ai/ace/context-assembler.ts
# MUST return ≥1 hit — analytics must fire on every ACE retrieval pass

# G51: P1-A prompt leaderboard → ACE queryTags (feedback loop closed)
rg "fetchTopQueryTags|getTopPrompts|topQueryTags" src/lib/server/features/ai/ace/context-assembler.ts
# MUST return ≥1 hit — top prompts injected into ACEContext.queryTags

# G52: P3-A cross-source reranking active in context assembler
rg "webSearchToUnified|webUnified|P3-A" src/lib/server/features/ai/ace/context-assembler.ts
# MUST return ≥2 hits — import + usage of webSearchToUnified in ragChunks merge

# G53: ACE_PIPELINE_VERSION reflects post-P3-A state
# (version bumped 2026-08-31 deep-audit finding: real value is '3.0.0', not '2.x'
# — functionally fine, 3.0.0 still satisfies "≥ 2.x invalidates stale rows", but
# the old regex below would false-fail against the real file)
rg "ACE_PIPELINE_VERSION = '3\." src/lib/server/features/ai/ace/context-assembler.ts
# MUST return 1 hit — version ≥ 2.x invalidates stale ace_chunks cache rows

# G54: P2-A cache key consolidation — generateCacheKey lives in cache-keys.ts
rg "export function generateCacheKey|export function generateContextHash" src/lib/server/cache-keys.ts
# MUST return 2 hits — single source of truth for LLM cache key generation

# G55: redis-exact-match.ts and llm-cache.ts import from cache-keys (not local)
rg "from.*cache-keys" src/lib/server/cache/redis-exact-match.ts src/lib/server/ai/llm-cache.ts
# MUST return 2 hits — both files import from canonical cache-keys.ts
# If either file still has a local generateCacheKey/hashContext → DRY violation remains
```

### G4/G5 open finding — 8 real unauthenticated + unvalidated API routes (2026-08-31 deep-audit, +3 2026-09-01 /deep-audit rerun)

Not fixed yet (intentional — dev testing currently relies on `DEV_BYPASS_AUTH`, so adding real
auth guards now would be premature). Recorded here per the Duplication Prevention rule ("record
what you found, even when you don't fix it").

Of 28 routes the graph's `hasAuth === false` flag surfaced under `/api/`, 12 are **false positives**
(they call `requireAdmin(event)`, which the flag detector doesn't recognize — only
`locals.user`/`getSession()`-style checks are tracked), and 10 more are correctly public by design
(auth entry points, health/status checks). **5 are genuinely unauthenticated AND have zero Zod
validation** (hand-rolled or none):

| Route | Method | Input handling | Risk |
|---|---|---|---|
| `api/ai/emotion` | POST | Manual `typeof imageBase64 !== 'string'` check, no Zod | Unbounded local-LLM compute-cost abuse vector |
| `api/batch-summary/jobs` | GET | Reads local files off disk (`readFileSync`), no input at all | Low — no params, but ungated file read |
| `api/retrieval/dual-lane` | GET | `limit` bounded (`Math.min(..., 100)`); `q`/`corpus`/`workspace` raw unvalidated strings into DB query | Could leak indexed content to any caller |
| `api/telemetry/implementation-clusters` | GET | Reads Redis-backed MCP telemetry, read-only | Low — no mutation, no secrets observed |
| `api/phase102/retrieval-pipeline` | GET | Queries `codeFeatures` table, returns ranked results; file has explicit `// Mock implementation` / `// Mock scores` comments — looks like an early scaffold | Low-moderate — reachable unauthenticated, not production-hardened |

**+3 more found in the 2026-09-01 `/deep-audit` rerun** (re-verified each of that pass's 21
`hasAuth === false` candidates individually against `requireAdmin`/`locals.user`/`getSession`
before counting — 12 of 21 were `requireAdmin` false positives, same detector blind spot as above):

| Route | Method | Input handling | Risk |
|---|---|---|---|
| `api/metrics/retrieval` | GET | `branch` free string param, `hours` bounded via `Math.max/min(1,72)` | Low — read-only telemetry dashboard, no mutation |
| `api/retrieval/cache-layers/health` | GET | No params | Low — read-only cache-layer health probe |
| `api/retrieval/cache-layers/metrics` | GET | No params | Low — read-only Prometheus metrics export |

Also not chased further: `api/trpc/[...procedure]` has no route-level auth guard, but tRPC's
per-procedure auth (if any) lives inside `createContext`/`appRouter` middleware, invisible to a
route-level static check — verify inside the router before assuming it's a gap.

**When ready to fix**: add `requireAuth`/`requireAdmin` (matching this repo's existing pattern, not
a new auth mechanism) to the 8 real gaps above, and add Zod schemas per the G5 convention. Do this
as a deliberate production-hardening pass — with tests added alongside, per operator direction
2026-09-01 — once dev-bypass is no longer the active mode, not piecemeal.

**+1 new route added 2026-09-03, CORRECTED 2026-09-03, CORRECTION ITSELF PARTIALLY RETRACTED
2026-09-03 (same day)** (`openspec/changes/parent-atlas-search-classifier-sidecar` task 2):
`api/atlas/domain-taxonomy/classify` (POST) — exposes `classifyDomainTaxonomy()` for the Python
NLP sidecar to call as a weak-label bootstrap source (service-to-service, not browser-facing).
`.strict()` Zod schema on the request body, read-only, no DB mutation, no PII. Originally logged
here as "unauthenticated"; then corrected to claim `hooks.server.ts`'s global `ADMIN_ONLY` prefix
list (`/api/atlas`, line ~848) was the confirmed root cause of an in-container retraining run's
HTTP 403. **That causal claim is itself now falsified by a live repro, not just re-asserted**:
with the dev server confirmed up, the identical request was sent from both the host and from
inside the live `miniforge-nlp-sidecar` container to `host.docker.internal:5173`, and **both
returned a clean `200 OK`** with a real classification — `DEV_BYPASS_AUTH` grants `role: 'admin'`
whenever no session cookie is present, which both a bare `curl` and a bare Python `urllib` request
satisfy, so the `ADMIN_ONLY` gate does not block either caller under current conditions.
`vite.config.ts`'s `allowedHosts` (also a candidate 403 source — Vite's own host-rejection
mechanism) was checked too and found unchanged since 2026-05-28 (commit `90fd865d45`), so it can't
explain a fresh failure either. **The real cause of the original 403 is unestablished** — no
response body was captured at the time. Per the operator's direct instruction, the resolved path
forward is architectural rather than forensic: remove live HTTP from the offline-training critical
path entirely via a frozen weak-label bundle
(`scripts/atlas/build-domain-classifier-weak-label-bundle-v1.mts`) — see
`openspec/changes/parent-atlas-search-classifier-sidecar/tasks.md` Next Steps item 2 for the full,
live-proved build. This route itself is left as-is (still reachable, still behind whatever
`hooks.server.ts` actually enforces for `/api/atlas` — that enforcement's exact real-world
behavior under the container caller's original conditions remains unresolved, not proven safe or
unsafe either way).

### G5 open finding — 18 authenticated mutating routes with zero Zod validation (2026-09-01 /deep-audit)

**Distinct from the G4 finding above.** The graph's `hasZod === false` flag surfaced 200 routes,
but 175 of those are GET-only (no body to validate — likely a false inclusion in the raw flag, not
a real gap). Narrowing to routes with a mutating method (POST/PUT/PATCH/DELETE) drops the count to
25. Individually checking each of those 25 for an auth guard found **every one of them already has
real auth** (`locals.user`, `requireAdmin`, or an explicit `DEV_BYPASS_AUTH` check) — this is NOT
the same 12-false-positive detector blind spot from the G4 section above; these routes are
genuinely authenticated. The real, remaining risk is narrower but still live: an **authenticated**
caller can send a malformed/malicious body with nothing rejecting it before it reaches business
logic or a Drizzle query.

18 confirmed authenticated-but-unvalidated mutating routes:

| Route | Methods | Auth pattern found |
|---|---|---|
| `api/admin/atlas/taxonomy-candidates` | GET, POST | `requireAdmin(event)` |
| `api/admin/citations/discover` | POST | `locals.user \|\| DEV_BYPASS_AUTH` |
| `api/admin/packets/enrich-labels` | GET, POST | `locals.user?.role !== 'admin'` |
| `api/analytics/research-summaries/[id]` | GET, DELETE | `locals.user?.id` |
| `api/cases/[id]/export/pdf` | POST | `locals.user?.id` |
| `api/codebase-index/cluster-assign` | POST | `locals.user?.id` |
| `api/codebase-index/couchdb-pagerank` | GET, POST | `locals.user?.id` (body read via `request.json().catch(() => null)`, no schema) |
| `api/codebase-index/index-stream` | GET, POST | `locals.user?.id` |
| `api/evidence/analyze` | GET, POST | `locals.user?.id` |
| `api/evidence/[id]/gpu-analysis` | GET, POST | `locals.user?.id` |
| `api/evidence/[id]/suggest-summary` | POST | `locals.user?.id` |
| `api/files/[id]` | DELETE | `locals.user \|\| DEV_BYPASS_AUTH` |
| `api/library/ingest-codebase-docs` | POST | `locals.user?.id` |
| `api/persons-of-interest/[id]/associates/[associateId]` | DELETE | `locals.user` |
| `api/persons-of-interest/[id]/gpu-analyze` | POST | `locals.user?.id` |
| `api/phase89/analysis` | POST | `locals.user` |
| `api/phase89/reindex` | POST | `locals.user` |
| `api/reports/[id]/publish` | POST, DELETE | `locals.user` |
| `api/wiki/watch` | GET, POST, DELETE | `locals.user` |

Not double-counted here: `api/ai/emotion` (already tracked above — it has neither auth nor Zod, a
strictly worse dual gap). Not chased: `api/auth/logout`, `api/dev/login-demo`,
`api/test/redis-direct`, `api/test/webgpu-modules` (auth/dev/test-only routes, low value to
Zod-harden) and `api/trpc/[...procedure]` (per-procedure validation, if any, lives in the tRPC
router, invisible to this route-level check).

**When ready to fix**: add Zod schemas to these 18 in the same production-hardening pass as the G4
list above — same deferred posture (dev-bypass active, tests added alongside per operator
direction), not a separate or earlier pass.

### Decision Tree (post-gate)

1. **G1-G9 all zero?** → Orphan candidate
2. **Read the file** — corrupted, <10 lines, garbled? → **ARCHIVE**
3. **Unique feature?** — superseded by another module? → **ARCHIVE**
4. **Svelte 4 syntax** (`export let`, `$:`, `on:click`) but valuable? → **REWRITE**
5. **No integration point?** — no route/layout to host it? → **ARCHIVE**
6. **< 30 min to wire?** → **WIRE** / else **DEFER**
7. **After wiring**, verify: import → render → trigger → API routes → props → data flow. Gap? → **SHALLOW**

**Shallow wiring indicators:** no-op `() => {}` callbacks, imported but never rendered, fetch to nonexistent API, props bound to unset `$state`, conditional render that never triggers.

**Automated:** `/audit-components [dir]`, `/prune-codebase [dir]`, `/wire-modules [dir]`

### Known False Negatives (LOOK dead but ARE wired)

- `$lib/webgpu/` — root layout WebGPU init (every page)
- `$lib/gpu/` — active compute pipeline (3 WGSL shaders, search reranker)
- `$lib/ai/onnx/` — client ONNX inference (WebGPU → WASM → CPU)
- `simd-bridge/cpp/` — LibTorch/CUDA N-API addon (3 GPU functions, G14)
- `AnalysisPanel.svelte` — dynamic import + `yorha:open-analysis` event (G2+G8)
- `KeyboardShortcutsPanel.svelte` — dynamic-only import in layout (G2, 0 static)
- `chr97-builder.ts` / `cartridge-tensor-bridge.ts` — tensor caching (4 API endpoints)
- `lib/server/db/drizzle.ts` — `@vite-ignore` variable import (G4)

**`deeds_labs/` is gitignored** — moving files there is permanent deletion. Measure twice, cut once.

---

