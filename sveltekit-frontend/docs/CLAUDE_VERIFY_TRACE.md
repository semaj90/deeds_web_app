# Claude Code Verification Contract — TRACE/Karpathy Stack

Before editing code, verify the runtime and build a context plan.

## Golden Rule

Do not patch first. First verify:

1. Runtime health
2. Graph/KAG search
3. GPU/worker health
4. Karpathy wiki/memory health
5. Audit gates
6. Relevant files from rg/awk
7. Claude plan with evidence

## Startup

```bash
npm run trace:start
```

Or for dev mode:

```bash
npm run dev
```

Expected detached services:

| Service | URL |
|---------|-----|
| SvelteKit | http://127.0.0.1:5173 |
| llama-server (TurboQuant) | http://127.0.0.1:8090 |
| topology-search | http://127.0.0.1:8101 |
| TRACE MCP | http://127.0.0.1:8788 |

## Smoke Checks

```bash
npm run verify:trace
npm run smoke:trace
npm run smoke:agentic-tools
npm run smoke:graphify
npx svelte-check --threshold error
npx tsgo --noEmit
```

If any fail, stop and summarize the failure before editing.

## Context Harvest

For any task, run:

```bash
rg "<main term>" src tests scripts -n
rg "<related term>" src tests scripts -n
rg "TODO|FIXME|HACK|throw new Error|console.error" src/lib/server src/routes scripts -n
```

For file counts by area:

```bash
find src/lib/server -type f | awk -F/ '{print $1"/"$2"/"$3}' | sort | uniq -c | sort -nr | head -30
```

For route/API work:

```bash
find src/routes -name "+server.ts" | sort
```

For tests:

```bash
find tests -name "*.test.ts" -o -name "*.spec.ts" | sort
```

Or use the automated context plan generator:

```bash
node scripts/claude-context-plan.mjs
# reads: scratch/claude/context-plan.md
```

## Graph/KAG Context

Ask the MCP tools or HTTP endpoints for context before editing. Provide
the TRACE MCP server (`http://127.0.0.1:8788`) with these tool calls:

```json
{ "tool": "trace.kag_search",           "args": { "query": "...",           "limit": 8 } }
{ "tool": "topology.search_near",       "args": { "query": "...",           "radius": 0.25, "limit": 20 } }
{ "tool": "graph.expand_neighborhood",  "args": { "stableKey": "file:...", "depth": 2, "limit": 30 } }
{ "tool": "clusters.get_summary_lenses","args": { "clusterIds": [3, 7, 12] } }
{ "tool": "trace.explain_retrieval",    "args": { "query": "..." } }
```

Use graph results to identify related files **before** editing.

## Required Claude Plan

Before patching, produce a plan with this shape:

```json
{
  "task":          "...",
  "intent":        "bug_fix | feature | test_generation | performance | refactor",
  "evidence": [
    { "source": "rg | graph | qdrant | audit | test | file", "reason": "..." }
  ],
  "filesToInspect":  [],
  "filesToModify":   [],
  "commandsToRun":   [],
  "riskLevel":       "low | medium | high",
  "patchPolicy":     "propose_only"
}
```

## Validation After Patch

Always run:

```bash
npx svelte-check --threshold error
npx tsgo --noEmit
npm test
npm run smoke:graphify
```

For graph/search changes:

```bash
npm run smoke:trace
npm run smoke:agentic-tools
```

For GPU/indexing changes:

```bash
node scripts/smoke-compute-worker-gpu.mjs
node scripts/audit-parity.mjs --strict --sample=250
```

For route changes:

```bash
npm run audit:test-stubs -- --mutating-only
```

## Never Do

- Do **not** let the model run raw SQL/Cypher directly.
- Do **not** bypass MCP tools for graph/search context.
- Do **not** write memory without Information Gain validation.
- Do **not** run full `graphify:full` when a targeted smoke check is enough.
- Do **not** apply destructive patches without explicit user approval.

## Verification Checklist (for PR/commit notes)

### Runtime
- [ ] `npm run trace:start` works
- [ ] SvelteKit :5173 healthy
- [ ] llama-server :8090 healthy
- [ ] topology-search :8101 healthy
- [ ] TRACE MCP :8788 healthy

### Search/Graph
- [ ] `trace.kag_search` returns hits
- [ ] `topology.search_near` returns hits
- [ ] `graph.expand_neighborhood` returns nodes
- [ ] `graph.pagerank_top` returns data or known-empty reason

### GPU/Indexing
- [ ] compute-worker GPU path smoke passes
- [ ] CPU fallback works
- [ ] graphify smoke passes
- [ ] audit-parity strict passes

### Memory/Wiki
- [ ] CouchDB reachable
- [ ] Redis `wiki:note:*` keys present
- [ ] Obsidian watcher status ok

### Quality
- [ ] `svelte-check` clean
- [ ] `tsgo` clean
- [ ] tests pass
- [ ] deep audit gates pass

## Priority Backlog (updated 2026-05-06)

| # | Task | Commands |
|---|------|----------|
| P1 | Populate PageRank | `npx tsx scripts/run-pagerank.ts` then verify `graph.pagerank_top` |
| P2 | Warm forest cluster embeddings | `node scripts/warm-forest-clusters.mjs` |
| P3 | Wire file-stream → hash → chunk → metadata → Qdrant in worker pool | (see indexer-worker-tasks.spec.ts) |
| P4 | Async N-API wrappers for large GPU calls | (async path already in libtorch-bridge.ts) |
| P5 | Claude Code "Create Plan" button in code-intel views | topology, cluster, retrieval subagents |
