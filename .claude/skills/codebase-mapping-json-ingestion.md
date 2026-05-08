# Claude Code Skill: Codebase Mapping JSON Ingestion + KAG/DAG/RAG Analysis

You are working in:

`C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`

## Mission

Build, verify, and improve the codebase mapping + JSON/JSONL ingestion pipeline for local agentic research.

The goal is to make this loop reliable:

```
VS Code / Claude Code
  → graphify codebase mapping
  → JSON / JSONL artifacts
  → Postgres structured rows
  → Neo4j KAG/DAG graph
  → Qdrant dense vector retrieval
  → Redis fast cache
  → CouchDB optional docstore mirror
  → TRACE MCP tools on :8788
  → Gemma4 / llama-server.exe tool-calling
  → compressed context packet
  → next_actions.md implementation plan
  → operator-gated patch/test/fix logging
```

Do not auto-patch production logic unless explicitly asked.
Do not mutate source code before mapping the current state.
Do not bypass audit gates.
Do not treat scanner raw counts as failures until exemptions are applied.

---

## Current Architecture

Primary stores:

- **Postgres**: Canonical relational state, code_relations, audit rows, JSONB metadata, diagnostics.
- **Neo4j**: Codebase graph, CodebaseFile nodes, IMPORTS edges, SIMILAR_TOPOLOGY edges, PageRank, Louvain communityId, graphAuthorityScore.
- **Qdrant**: Dense vector index for codebase chunks, legal documents, evidence, chat messages, embedding cache.
- **Redis**: Fast cache, manifests, KAG notes, ace:authority:top, NES/GRPO cluster risk cards.
- **CouchDB**: Optional document mirror / offline docstore / agent notes / sync lane. Do not treat CouchDB as canonical unless a contract says so.
- **TRACE MCP**: HTTP MCP server at `http://127.0.0.1:8788`. Required tools include:
  - `trace.kag_search`, `trace.explain_retrieval`
  - `graph.expand_neighborhood`, `graph.pagerank_top`
  - `topology.search_4d`, `clusters.get_summary_lenses`
  - `context.build_kv_packet`, `context.get_compressed_card`
  - `search.hybrid`, `search.go_hybrid`
  - `kag.ingest_error`, `ops.propose_patch`
  - `ops.run_targeted_test`, `ops.record_fix_attempt`, `ops.run_quality_gate`
- **Gemma4 / llama-server.exe**: Local LLM planner/orchestrator through OpenAI-compatible tool calling.

---

## Health Baseline

Before changing code, run or inspect:

```bash
node scripts/check-all-tools.mjs
```

Expected healthy state:
- 0 FAIL
- Neo4j reachable + GDS plugin available
- codeGraph projection exists
- graphPageRank / communityId / graphAuthorityScore present on CodebaseFile nodes
- Qdrant reachable
- Redis reachable
- TRACE MCP reachable + `graph.pagerank_top` executes
- latest synthesis run exists

Known acceptable warnings:
- `DATABASE_URL not set` when Postgres container/env is not active
- CouchDB DBs missing until graphify/docstore/pagerank lanes are run
- GRPO wire artifact missing until `npm run wire:synthesis:grpo`
- tsgo ENOENT when bash PATH cannot resolve Windows npx

---

## Phase 1 — Map Current Codebase

```bash
npm run graphify:full
npm run graphify:gds       # if available
npm run graph:synthesize
```

Expected outputs:
- `docs/graph/codebase-graph.json`
- `docs/graph/deep-import-graph.json`
- `docs/graph/cluster-summaries.json`
- `memory/runs/<timestamp>/next_actions.md`
- `memory/runs/<timestamp>/audit_failures.json`
- `logs/task-output/tool-health-latest.json`

If graphify fails, classify the failure:
- **Infrastructure missing**: Docker, Neo4j, Redis, Qdrant, CouchDB, Postgres, MCP.
- **Plugin missing**: Neo4j GDS, APOC, etc.
- **Data missing**: empty Qdrant collection, missing CouchDB DB, missing Redis keys.
- **Code bug**: thrown TypeScript/JS error, bad import path, wrong schema, bad query.
- **Scanner false positive**: comments, JSDoc examples, dev localhost fallback, decommissioned services, tests.

---

## Phase 2 — JSON / JSONL Ingestion

Check pending ingest:

```bash
ls memory/ingest/pending
ls memory/ingest/processed
ls memory/ingest/failed
```

Start TRACE MCP if needed:

```bash
npm run mcp:trace
```

Verify tools:

```bash
curl -s http://127.0.0.1:8788/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Then ingest:

```bash
npm run kag:ingest
```

Pass condition: pending decreases, processed increases, failed is empty or failures are explainable, TRACE MCP remains reachable, Redis health summary is updated.

---

## Phase 3 — KAG/DAG/RAG Join Rules

Use this identity model:
- **Primary**: `filePath` / `relativePath`
- **Secondary**: `stable_key`
- **Fallback**: `basename` only for degraded matching

When joining Neo4j ↔ Qdrant ↔ Postgres, prefer `filePath`, `relativePath`, `file_path`. Add alias maps for: `stable_key`, `stableKey`, `relativePath`, `relative_path`, `file_path`, `filePath`, `path`.

If Qdrant authority enrichment is low:

```bash
node scripts/neo4j-graph-enrich.mjs
node scripts/check-all-tools.mjs
```

If Qdrant enrichment times out, check whether the probe is running without `await` (concurrently with tsgo's 20s+ run). Prefer sequential `await` for heavy Qdrant scrolls; set timeout ≥ 30s.

---

## Phase 4 — Graph Authority Pipeline

Neo4j GDS must support: `RETURN gds.version();`

GDS smoke should pass all 10 gates (GDS1–GDS10). If GDS2/GDS3/GDS4 fail, this is usually infrastructure.

Docker Compose GDS environment:

```yaml
NEO4J_PLUGINS: '["graph-data-science"]'
NEO4J_dbms_security_procedures_unrestricted: "gds.*"
NEO4J_dbms_security_procedures_allowlist: "gds.*"
```

If using APOC too:

```yaml
NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
NEO4J_dbms_security_procedures_unrestricted: "apoc.*,gds.*"
NEO4J_dbms_security_procedures_allowlist: "apoc.*,gds.*"
```

---

## Phase 5 — MCP Entrypoint Policy

Correct default for agentic TRACE/Gemma4 workflow:

```json
"dev:agent": "concurrently -n \"Docker,Health,Frontend,TRACE-MCP\" -c \"blue,green,cyan,yellow\" \"npm run orchestrator:docker:up\" \"npm run orchestrator:health:watch\" \"npm run dev:gpu\" \"npm run mcp:trace\""
```

Script meanings:
- `mcp:trace` — Primary TRACE/Gemma4 HTTP MCP server on port 8788
- `mcp:stdio` / `rag:mcp` — Claude Desktop / stdio RAG MCP compatibility
- `mcp:legacy:python` / `mcp:server` — Python FastMCP compatibility path

Do NOT use legacy Python MCP as the default for TRACE/Gemma4 dev-agent workflows.

---

## Phase 6 — Audit Gate Interpretation

Never rely only on raw scanner counts. Classify every issue as:

**REAL_FAIL**:
- hardcoded full service URL in live server code
- credentials in source
- missing auth guard on externally callable sensitive route
- TypeScript compile error or broken import
- failed graph projection after plugin is installed
- failed MCP tool call after server is running

**WARN**:
- CouchDB DB missing before docstore/pagerank lanes
- DATABASE_URL missing while DB lane inactive
- tsgo unavailable due to shell PATH
- Qdrant scroll timeout in health check
- missing GRPO artifact
- Svelte shallow-wiring cluster
- raw fetch without timeout, no-op UI callback, console.log-only handler

**ALLOW**:
- comments, JSDoc examples, tests/specs, seed scripts
- explicit `audit:ignore-localhost`
- decommissioned service references
- local Ollama fallback, hostname-only local dev fallback when ENV is primary
- localhost origin security checks

---

## Phase 7 — RAG/KAG/DAG Retrieval Contract

Target query flow:

```
Gemma4 / Claude Code query
  → TRACE MCP trace.kag_search
  → Go hybrid search if available
  → Postgres FTS
  → Qdrant vector search
  → Neo4j graph expansion / PageRank / community
  → Redis cache/cards
  → context.build_kv_packet
  → compressed context returned to LLM
  → implementation plan
  → operator-gated action
  → record_fix_attempt / audit log
```

Do not let LLM output directly mutate database or source files unless operator-gated.

---

## Phase 8 — Codebase Mapping JSON Schema

```json
{
  "schemaVersion": "codebase-map.v1",
  "generatedAt": "ISO_DATE",
  "repoRoot": "C:/Users/james/Videos/deeds-web-app/sveltekit-frontend",
  "source": "graphify",
  "files": [
    {
      "filePath": "src/lib/server/example.ts",
      "stableKey": "optional-stable-key",
      "language": "typescript",
      "kind": "server-module",
      "symbols": [], "imports": [], "exports": [],
      "protocols": ["w3c-fetch", "sql-drizzle", "redis-cache"],
      "tags": [],
      "clusterId": "cluster:gpu:92",
      "somCluster": 92,
      "communityId": 123,
      "graphPageRank": 0.0,
      "graphAuthorityScore": 0.0,
      "diagnostics": [],
      "audit": { "failures": [], "warnings": [], "exemptions": [] }
    }
  ],
  "edges": [
    { "from": "src/a.ts", "to": "src/b.ts", "type": "IMPORTS", "confidence": 1.0, "source": "ast" }
  ],
  "clusters": [
    {
      "clusterId": "cluster:gpu:92",
      "memberCount": 186,
      "risk": 0.3,
      "protocols": ["sql-drizzle", "w3c-fetch", "svelte5-runes"],
      "topFiles": [],
      "summary": ""
    }
  ]
}
```

For JSONL, each line is one independent event/card:

```jsonl
{"type":"code_file","filePath":"src/lib/server/example.ts","stableKey":"...","protocols":["redis-cache"],"clusterId":"cluster:gpu:92"}
{"type":"graph_edge","from":"src/a.ts","to":"src/b.ts","edgeType":"IMPORTS"}
{"type":"audit_warning","filePath":"src/x.svelte","gate":"shallow-wiring","reason":"fetch without AbortSignal.timeout"}
{"type":"fix_attempt","filePath":"src/x.svelte","result":"planned","operatorGated":true}
```

---

## Phase 9 — Protocol Detection

```js
const PROTOCOL_DETECTORS = {
  'grpc-proto':           /import.*\.proto|grpc\.|GrpcClient/,
  'sql-drizzle':          /\.from\(|\.select\(|\.insert\(|drizzle/,
  'cypher-neo4j':         /MATCH\s*\(|CREATE\s*\(|neo4j\.run|session\.run/,
  'qdrant-vector':        /qdrant\.search|QdrantClient|collections\/.*\/points/,
  'redis-cache':          /redis\.(get|set|setEx|hSet|multi)|createClient/,
  'sse-http':             /EventSource|text\/event-stream/,
  'w3c-fetch':            /fetch\(/,
  'webgpu-wgsl':          /device\.createShaderModule|\.wgsl/,
  'otel-trace':           /tracer\.(startSpan|startActiveSpan)|Langfuse/,
  'llm-openai-compatible':/\/v1\/chat\/completions|tools:\s*\[/,
  'mcp-json-rpc':         /jsonrpc|tools\/call|tools\/list|FastMCP|MCP/,
  'svelte5-runes':        /\$state|\$derived|\$effect|\$props/,
};
```

---

## Phase 10 — Synthesis / next_actions.md

After graph + audit data is refreshed, synthesize priorities:

**P0** (production blockers): failed audit gates, broken graph/retrieval path, TypeScript compile break, tool-call loop cannot execute.

**P1** (quality improvements): shallow wiring, missing response validation, missing timeouts, degraded retrieval quality, incomplete CouchDB/docstore wiring, GRPO artifact missing.

**P2** (performance): N-API native acceleration, CUDA/vector autoencoding, deeper hypergraph research, UI polish.

Current P1:
- cluster:gpu:92 Svelte shallow wiring
- CouchDB DB/docstore/pagerank lane
- GRPO wire artifact
- DATABASE_URL/Postgres table checks
- tsgo PATH issue in bash
- Qdrant authority enrichment coverage if low

---

## Phase 11 — Svelte P1 Cleanup Rules

For Svelte components:
- Use typed `$props()`, avoid `any`
- Use discriminated unions for callback payloads
- Remove no-op callbacks or wire them
- Replace `console.log`-only handlers with real telemetry/state/toast
- Client fetch must use `AbortSignal.timeout(...)`, `response.ok`, typed JSON parsing, Zod schema where response shape matters

```typescript
const response = await fetch('/api/example', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`Request failed: ${response.status}`);
const data = ExampleResponseSchema.parse(await response.json());
```

---

## Phase 12 — Final Verification

```bash
node scripts/check-all-tools.mjs
npm run graphify:gds
npm run graphify:full
npm run graph:synthesize
npm run check          # TypeScript
npm run mcp:trace      # if TRACE MCP needed
npm run kag:ingest
```

Final expected state: 0 FAIL, GDS 10/10, TRACE MCP tools reachable, all stores enriched, P0 clear, G17 failureCount 0, latest `next_actions.md` updated.

---

## Reporting Style

Always separate: what passed · what failed · what is only warning/noise · what command fixes it · what should be committed · what remains P1/P2.

Example:
```
Status: 35 PASS / 7 WARN / 0 FAIL

Real missing:
- CouchDB docstore DBs
- GRPO wire artifact
- DATABASE_URL for Postgres table checks

Not bugs:
- localhost JSDoc examples
- ENV fallback patterns
- missing CouchDB DBs before docstore generation
```

---

## Safety Rules

- Do not auto-run destructive migrations.
- Do not delete data from Neo4j, Qdrant, Redis, CouchDB, or Postgres without explicit approval.
- Do not run heavy GPU indexing without confirmation.
- Do not expose patch tools to Gemma4 without operator gating.
- Treat `ops.propose_patch`, `ops.run_targeted_test`, `ops.record_fix_attempt`, `ops.run_quality_gate` as operator-gated.
- Prefer read-only mapping, synthesis, and explicit implementation plans.