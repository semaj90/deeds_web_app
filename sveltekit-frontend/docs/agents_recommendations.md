# Agent Recommendations

> Generated: 2026-05-07T21:47:25Z
> Ranked by error-fix churn — most fixes = most fragile. Use Fix Timeline in AGENTS.md for per-directory detail.

## High-Churn Directories

| Directory | Fixes | Feats | Last Activity | Action |
|-----------|-------|-------|---------------|--------|
| `src/lib/server/ai` | 13 | 1 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server` | 12 | 0 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server/ace` | 8 | 12 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server/db` | 7 | 2 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/mcp` | 7 | 3 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server/ff1/agent` | 6 | 0 | 2026-05-07 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server/couchdb` | 4 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/wiki` | 4 | 7 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/graph` | 4 | 4 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/indexer` | 4 | 1 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/retrieval` | 4 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/chrrom` | 3 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/gpu` | 3 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/grpc` | 3 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/queue` | 3 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/cache` | 3 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/search` | 2 | 3 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/config` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/evidence` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/ff1` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/ff1/storage` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/vector` | 2 | 1 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/minio` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/utils` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/analytics` | 2 | 1 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/hypergraph` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/ml` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/server/legal` | 2 | 0 | 2026-05-07 | 🟠 Review — add G26 tests |
| `src/lib/components/ui` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/components/yorha` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/routes/(app)/demos/yorha/components` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/connections` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/agent/tools` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/error-brain/transport` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/observability` | 1 | 1 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/integrations` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/langextract` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/lib/server/streaming` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/routes/api/code-intel/claude-plan` | 1 | 0 | 2026-05-07 | ✅ Healthy |
| `src/routes/api/code-intel/smoke/health` | 1 | 0 | 2026-05-07 | ✅ Healthy |

## Feature Implementation TODOs

> Recent feat commits that may need wiring, tests, or documentation.

- [ ] **2026-05-07** feat(smoke): add agent roundtrip smoke scripts — dirs: root
- [ ] **2026-05-07** feat(health): check-all-tools 42-gate probe, 35 PASS 0 FAIL — dirs: root
- [ ] **2026-05-07** feat(startup): write startup_health/pids/bg-jobs artifacts; stability-test run-dir output; docs/startup.md — dirs: root
- [ ] **2026-05-07** feat(startup+synthesis): TurboQuant stability gate, Node orchestrator, audit pipeline, fetch-rerank mget batch — dirs: `src/lib/server/ace`, `src/lib/server/observability`
- [ ] **2026-05-07** feat(startup): parallel Full AI Stack VS Code task + 28-step audit — dirs: root
- [ ] **2026-05-07** feat(graph): cluster→AGENTS.md index for fast ACE retrieval hits — dirs: root
- [ ] **2026-05-07** feat(tile-engine): SemanticTile, TileEngineTrace, standardized quaternion pipeline — dirs: `src/lib/server/ace`, `src/lib/server/search`
- [ ] **2026-05-07** feat(topology): standardise manifold4 axes before quaternion projection — dirs: `src/lib/server/search`
- [ ] **2026-05-07** feat(mcp): rank FastMCP tools by HMM state and gain history — dirs: `src/lib/server/mcp`
- [ ] **2026-05-06** feat(mcp): Redis 24hr ACE hits cache for trace.kag_search — dirs: `src/lib/server/ace`, `src/mcp`
- [ ] **2026-05-06** feat(mcp+feedback): normalizeJsonFilter, search.go_hybrid hardening + 19 tests — dirs: `src/mcp`
- [ ] **2026-05-06** feat(mapreduce): harden reduce-neo4j + add 16 unit tests — dirs: root
- [ ] **2026-05-06** feat(ace): add glyph_cluster lane to multi-lane-retrieval — dirs: `src/lib/server/ace`
- [ ] **2026-05-06** feat(agent): expose goToolClusterContext in A2A task response — dirs: `src/routes/api/ai/agent`
- [ ] **2026-05-06** feat(agent): inject Go cluster context + complete synthesis memory archival — dirs: `src/lib/server/ai`
- [ ] **2026-05-06** feat(ace): chain both rerank writeback scripts in graphify:full — dirs: root
- [ ] **2026-05-06** feat(ace): detailed rerank breakdown writeback + synthesis TODO docs — dirs: root
- [ ] **2026-05-06** feat(mcp+authority): inline neo4j-gds logic + normalized retrieval result types — dirs: `src/mcp`
- [ ] **2026-05-06** feat(proto+config): TRACE proto contracts + memory artifacts + vitest config — dirs: root
- [ ] **2026-05-06** feat(scripts): wiki/mapreduce/graph pipeline scripts — dirs: root
- [ ] **2026-05-06** feat(db+routes): code_relations + error_fingerprints schema + API routes — dirs: `src/lib/server/db`, `src/routes/api/admin/pipeline/events`
- [ ] **2026-05-06** feat(ace): add ACE spine modules + graph/wiki infrastructure — dirs: `src/lib/server/ace`, `src/lib/server/agents`
- [ ] **2026-05-06** feat(indexer): extend worker pool with chunk/hash/metadata/qdrant_payload tasks — dirs: `src/lib/server/workers`, `src/lib/workers`

## Gate Violations (from enrich-agents-md)

> Source: `docs/TODO-enhancements.md`. Refresh: `npm run agents:enrich`.

## 1. Critical Hotspots (High Fan-In → High Risk)

Files with the most dependents — changes here cascade widely. Each needs:
1. Paired test (G26), 2. Circuit-breaker / dependency inversion assessment

| File | Fan-In | Zone | Action |
|------|--------|------|--------|


## 2. Test Coverage Gaps (fanIn ≥ 15, no paired test)

> G26 compliance: every high-fanIn server file needs a test in `tests/routes/auto/`
> Pattern: `@vitest-environment node` + `vi.hoisted` + lazy `beforeEach` import + 401/400/200/degraded cases



## 3. Audit Gate Violations to Address

### G17 — Hardcoded localhost refs (must use ENV.* getters)
Run: `rg "localhost|127\.0\.0\.1" src/lib/server/ --type ts --glob "!env.server.ts"` — all hits are violations

### G8a — SvelteKit error() in service layer
Run: `rg "import .*error.*from .@sveltejs/kit." src/lib/server/ --type ts` — all hits are violations
Use `HttpServiceError` subclasses from `$lib/server/errors.ts` instead

### G8b — GPU/Analysis layer importing SvelteKit
Run: `rg "from .@sveltejs/kit.|from .\$app/" src/lib/server/gpu/ src/lib/server/analysis/ src/lib/server/vector/` — must be 0

### G11 — Wrong DB client import
Run: `rg "from.*db/index" src/ --type ts` — must be 0 (use `db/client` for node-postgres Pool)

### G21-G24 — Svelte 4 patterns in .svelte files
Run: `rg "export\s+let|^\s*\$:[^:]|\bon:[a-z]|createEventDispatcher" src/ --glob "*.svelte"` — must be 0

