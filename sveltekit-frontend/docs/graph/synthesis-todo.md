# Codebase Synthesis — Todo + Enhancement Report
_Generated: 2026-05-06 · 3590 files · 715 route handlers_

---

## Summary Dashboard

| Gate | Status | Count |
|------|--------|-------|
| G18 Auth on API routes | ✅ 32 unguarded are correctly public | 0 real fails |
| G19 Zod on body-parsing routes | ❌ 4 routes unvalidated | 4 fails |
| G20 SSR safety | ⚠️ 1 intentional browser shim | skip |
| G21-24 Svelte 5 rune compliance | ✅ 0 Svelte 4 patterns | 0 fails |
| G25 Runes in plain .ts | ✅ | 0 fails |
| G26 Route test pairing | ⚠️ 77 routes without stubs | 77 to stub |
| G17 Hardcoded localhost | ❌ 55 files | 55 to fix |
| G27 kmeansWithCentroids + trainSOM | ✅ Wired | — |
| G32 SIMILAR_TOPOLOGY (Neo4j) | ✅ Wired | — |
| G33 pageRankGPU | ✅ Wired | — |
| CouchDB PageRank | ✅ Wired | — |

---

## HIGH Priority

### G19 — 4 Body-Parsing Routes Without Zod

- `src/routes/(app)/admin/api-testing/agentic-events/+server.ts`
- `src/routes/(app)/admin/api-testing/ast-topology/+server.ts`
- `src/routes/api/ace/health/+server.ts`
- `src/routes/api/admin/cache-stats/+server.ts`

Add `import { z } from "zod"` and validate `request.json()` / `request.formData()` before destructuring.

### G17 — Files With Hardcoded localhost Breaking Env Isolation

- `src/lib/server/agent/tools/web-search-searxng.ts` → http://localhost:8888
- `src/lib/server/ai/gemma4-tool-controller.ts` → http://localhost:8788
- `src/lib/server/chrrom/patterns.ts` → http://localhost:8094, http://localhost:5174
- `src/lib/server/clients/ollama.ts` → http://localhost:11434
- `src/lib/server/config.ts` → http://localhost:4000, http://localhost:8000
- `src/lib/server/db/mirror-query.ts` → http://localhost:9000
- `src/lib/server/docling.ts` → http://localhost:8085
- `src/lib/server/endpoints.ts` → http://localhost:8094
- `src/lib/server/env/endpoints.ts` → http://localhost:11434
- `src/lib/server/gpu/mapreduce-cuda-analyzer.ts` → http://127.0.0.1:11434
- `src/lib/server/gpu/mapreduce-worker.mjs` → http://127.0.0.1:11434
- `src/lib/server/graph/neo4j-gds.ts` → http://127.0.0.1:6333
- `src/lib/server/grpc/generation-client.ts` → http://localhost:50052
- `src/lib/server/helpers/service-discovery.ts` → http://localhost:9000, http://localhost:11434
- `src/lib/server/langextract-client.ts` → http://127.0.0.1:8095, http://127.0.0.1:8095
- `src/lib/server/ml/topic-clustering-worker.ts` → http://localhost:6333
- `src/lib/server/ollama-cached.ts` → http://localhost:11434
- `src/lib/server/utils/endpoints.ts` → http://localhost:8080
- `src/lib/server/vector/qdrant-api-wrapper.ts` → http://localhost:6333
- `src/routes/api/ai/chat-direct/+server.ts` → http://localhost:11434

Replace with `ENV.SERVICE_URL ?? "http://localhost:PORT"` via `env.server.ts`.

---

## MEDIUM Priority

### G26 — Authenticated API Routes Without Paired Tests (top 20)

- `src/routes/api/code-intel/clusters/[clusterKey]/+server.ts`
- `src/routes/api/code-intel/clusters/[clusterKey]/lenses/+server.ts`
- `src/routes/api/code-intel/graph/impact/+server.ts`
- `src/routes/api/code-intel/latest-index/+server.ts`
- `src/routes/api/code-intel/memory-gain/+server.ts`
- `src/routes/api/code-intel/memory-gain/rejected/+server.ts`
- `src/routes/api/code-intel/research-memory/+server.ts`
- `src/routes/api/code-intel/research-provenance/[id]/+server.ts`
- `src/routes/api/code-intel/retrieval-runs/+server.ts`
- `src/routes/api/code-intel/retrieval-runs/[id]/+server.ts`
- `src/routes/api/code-intel/topology/node/[stableKey]/+server.ts`
- `src/routes/api/code-intel/wiki-status/+server.ts`
- `src/routes/api/graph/topology-neighbors/+server.ts`

Run `npm run audit:test-stubs` to auto-generate G26-compliant stub files.

### TODO Comments (16 tracked)

- `src/lib/ai/onnx/inference.ts`: TODO
- `src/lib/components/RouteDecisionModal.svelte`: TODO
- `src/lib/components/RouteInspectorWorking.svelte`: TODO
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte`: TODO
- `src/lib/components/ui/enhanced-bits/SSRWebGPULoader.svelte`: TODO
- `src/lib/components/ui/Form.svelte`: TODO
- `src/lib/components/yorha/dashboard/GPUMetrics.svelte`: TODO
- `src/lib/workers/embedding-worker-enhanced.js`: TODO
- `src/lib/workers/embedding-worker-enhanced.js`: TODO
- `src/routes/(app)/admin/component-analysis/+page.svelte`: TODO
- `src/routes/(app)/admin/component-analysis/+page.svelte`: TODO
- `src/routes/(app)/admin/phase89/+page.svelte`: TODO
- `src/routes/(app)/admin/phase89/+page.svelte`: TODO
- `src/routes/(app)/chat/+page.server.ts`: TODO
- `src/routes/(app)/demos/yorha/components/dashboard/GPUMetrics.svelte`: TODO
- `src/routes/api/synthesis/generate/+server.ts`: TODO

---

## LOW Priority — Env Isolation (G17 full list)

- `src/lib/ai/` (2 files) — http://127.0.0.1:8070, http://127.0.0.1:8085
- `src/lib/components/ai/` (2 files) — http://localhost:11434, http://localhost:11434
- `src/lib/components/` (2 files) — http://localhost:3001
- `src/lib/components/yorha/` (1 file) — http://localhost:11434, http://localhost:8093
- `src/lib/config/` (2 files) — http://localhost:8095
- `src/lib/gpu/` (1 file) — http://localhost:8098, http://localhost:8097
- `src/lib/machines/` (1 file) — http://localhost:3001
- `src/lib/server/agent/tools/` (1 file) — http://localhost:8888
- `src/lib/server/ai/` (1 file) — http://localhost:8788
- `src/lib/server/chrrom/` (1 file) — http://localhost:8094, http://localhost:5174
- `src/lib/server/clients/` (1 file) — http://localhost:11434
- `src/lib/server/` (5 files) — http://localhost:4000, http://localhost:8000
- `src/lib/server/db/` (1 file) — http://localhost:9000
- `src/lib/server/env/` (1 file) — http://localhost:11434
- `src/lib/server/gpu/` (2 files) — http://127.0.0.1:11434
- `src/lib/server/graph/` (1 file) — http://127.0.0.1:6333
- `src/lib/server/grpc/` (1 file) — http://localhost:50052
- `src/lib/server/helpers/` (1 file) — http://localhost:9000, http://localhost:11434
- `src/lib/server/ml/` (1 file) — http://localhost:6333
- `src/lib/server/utils/` (1 file) — http://localhost:8080

All should use `ENV.X ?? "http://localhost:N"` from `src/lib/server/env.server.ts`.

---

## Context Enhancements — ACE Retrieval Quality

### High Fan-In Files (blast radius)

- `$lib/server/db/client` — **526** importers
- `$lib/server/env.server.js` — **328** importers
- `$lib/components/ui/Icon.svelte` — **252** importers
- `$lib/server/redis.js` — **224** importers
- `$lib/server/ollama.js` — **167** importers
- `$lib/server/db/schema-postgres.js` — **144** importers
- `$lib/server/middleware/cache-headers.js` — **113** importers
- `$lib/server/validation.js` — **93** importers
- `$lib/components/ui/Button.svelte` — **88** importers
- `$lib/server/grpc/embedding-client.js` — **83** importers

Consider splitting large modules or adding interface docs.

### Phase A Deep Import Graph

3590 nodes, 11623 edges live in Redis `code:graph:node:*` (12h TTL).
Regen: `npm run graphify:deep:ingest`

### AGENTS.md Coverage

366 directories regenerated with audit gate tables + per-dir todos.
All mirrored to Redis `agents:dir:*` (24h TTL).
Regen: `npm run agents:write`

---

## Neo4j + CouchDB Graph Analysis Status

| Feature | Status | File |
|---------|--------|------|
| SIMILAR_TOPOLOGY edges | ✅ | context-assembler.ts, community-graph.ts |
| SOM coords on Neo4j | ✅ | som-topology-pipeline.ts |
| CouchDB PageRank | ✅ | graph/couchdb-pagerank.ts |
| GPU k-means | ✅ | gpu-graph-analysis.ts, pytorch-graph.ts |
| pageRankGPU | ✅ | pytorch-graph.ts |

**G27-G35 Tier F gates: ALL PASS ✅**

---
_Refresh: `npm run index:codebase:fast && npm run graphify:deep:ingest && npm run agents:write`_
