# Agent Recommendations

> Generated: 2026-05-11T02:09:22Z
> Ranked by error-fix churn — most fixes = most fragile. Use Fix Timeline in AGENTS.md for per-directory detail.

## High-Churn Directories

| Directory | Fixes | Feats | Last Activity | Action |
|-----------|-------|-------|---------------|--------|
| `src/lib/server/db` | 11 | 1 | 2026-05-10 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/mcp` | 5 | 9 | 2026-05-10 | ⚠️ Stabilize — add tests + circuit breaker |
| `src/lib/server/admin` | 4 | 4 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server/ai` | 3 | 4 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/routes/api/evidence/upload` | 3 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server/graph` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server` | 2 | 1 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/routes/(app)/evidence/[id]/view` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/routes/(app)/cases` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/routes/(app)/cases/new` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server/indexer` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/utils` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/routes/api/synthesis/generate` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/components/admin` | 2 | 2 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server/analytics` | 2 | 0 | 2026-05-10 | 🟠 Review — add G26 tests |
| `src/lib/server/ace` | 1 | 8 | 2026-05-10 | ✅ Healthy |
| `src/routes/(app)/admin/gpu-evidence-graph` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/analytics/context-timeline` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/analytics/rl-signal` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/codebase-index/claude-assist` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/codebase-index/claude-assist/feedback` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/evidence/[id]/chain-of-custody` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/(app)/evidence` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/(app)/evidence/upload` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/rag/search` | 1 | 1 | 2026-05-10 | ✅ Healthy |
| `src` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/analyze/stream` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/canvas` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/chat` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/citations` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/connections` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/evidence` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/export/pdf` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/key-points` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/laws` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/notes` | 1 | 0 | 2026-05-10 | ✅ Healthy |
| `src/routes/api/cases/[id]/notes/[noteId]` | 1 | 0 | 2026-05-10 | ✅ Healthy |

## Feature Implementation TODOs

> Recent feat commits that may need wiring, tests, or documentation.

- [ ] **2026-05-10** feat(mcp): research.synthesize → legal-ai-langgraph:8091 (89th tool) — dirs: `src/mcp`
- [ ] **2026-05-10** feat(sw): Phase D offline analytics queue (CACHE_VERSION v1.6.0) — dirs: `src/lib/client`, `src/lib/server/ai`
- [ ] **2026-05-10** feat(evidence): SSE /api/evidence/[id]/analyze/stream — Phase 3 Item 6 — dirs: `src/routes/api/evidence/[id]/analyze/stream`
- [ ] **2026-05-10** feat(intent): Phase C demo page at /intent-chat — dirs: `src/routes/(dev)/intent-chat`
- [ ] **2026-05-10** feat(sw+intent): Phase C SW telemetry + contextual-chat store + dispatch tests — dirs: `src/lib/stores`, `src/routes/api/admin/telemetry/batch`
- [ ] **2026-05-10** feat(intent): Phase B intent-router + /api/ai/intent-dispatch route — dirs: `src/lib/server/ai`, `src/lib/server/mcp`
- [ ] **2026-05-10** feat(rag): RAG_RRF_ENABLED canary in /api/rag/search for legal queries — dirs: `src/lib/server`, `src/routes/api/rag/search`
- [ ] **2026-05-10** feat(intent): Phase A regex intent classifier — pure module + 31 tests — dirs: `src/lib/intent`
- [ ] **2026-05-10** feat(retrieval): wire RRF into new /api/rag/search-fused endpoint — dirs: `src/routes/api/rag/search-fused`
- [ ] **2026-05-10** feat(retrieval): Phase 1 sparse+dense lane — tsvector + RRF + BM25 — dirs: `src/lib/server/retrieval`
- [ ] **2026-05-10** feat(speculative): wire gemma3:270m as draft model for llama-server speculative decoding — dirs: root
- [ ] **2026-05-10** feat(agent): wire Langfuse tracing + Redis pattern recall into agentic-error-fix — dirs: root
- [ ] **2026-05-10** feat(ace): QueryRouter4x4 dispatch + web_search L10 lane + smoke 10/10 — dirs: `src/lib/server/ace`, `src/lib/server/routing`
- [ ] **2026-05-10** feat(mcp+image): image.enrich_tags MCP tool + batch enrichment script (78 tools) — dirs: `src/mcp`
- [ ] **2026-05-10** feat(mcp): image search tools — 4 new TRACE MCP tools (77 total) — dirs: `src/mcp`
- [ ] **2026-05-09** feat(evidence+synth): image search UI + GRPO synthesis loop scripts — dirs: `src/lib/components/evidence`, `src/lib/server/vector`
- [ ] **2026-05-09** feat(karpathy): GPU batch stream log, AGENTS.md T1 patch, lane atlas, ACE hit-rate — dirs: root
- [ ] **2026-05-09** feat(hyperrag): HyperRAG Feature Atlas + Trust-Tier system (§1-§13 blueprint) — dirs: `src/lib/server/ace`, `src/lib/server/db`
- [ ] **2026-05-09** feat(session): browser-context lane, admin AI chat, external research agent, mcp:tail-errors, smoke suite — dirs: `src/lib/components/admin`, `src/lib/server/admin`
- [ ] **2026-05-09** feat(mcp): un-gate canonical tools, fix ioredis cold-starts, expand multi-lane, wire prior-fix recall — dirs: `src/lib/server/ace`, `src/mcp`
- [ ] **2026-05-09** feat(claude-code): Phase D — PreToolUse deny + PostToolUse audit hooks — dirs: root
- [ ] **2026-05-09** feat(synth): Phase C — Gemma4 ⇄ MCP synthesis loop CLI — dirs: root
- [ ] **2026-05-09** feat(mcp): Phase B — read-only db.* inspection tools + G33 gate — dirs: `src/mcp`
- [ ] **2026-05-09** feat(mcp): adopted MCP servers (enabled:false) + smoke probe + plan amendments — dirs: root
- [ ] **2026-05-09** feat(mcp): gemma4-offload stdio MCP + G29/G30/G31 validator gates — dirs: root

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

