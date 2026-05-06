# Directory Consolidation Plan — 2026-05-03 20:44:51

> Auto-generated from Gemma4 agent analysis + static scan
> Source: `scripts/tests/test-production-readiness.mjs`

## Why Consolidate

Small directories (≤2 files) create navigation overhead without structural benefit.
Overlapping lib/ directories (e.g., `lib/cache/` vs `lib/server/cache/`) cause import confusion.

## Tiny API Route Directories (≤2 files each)

These are candidates to merge into a parent `misc/` group or nearest logical sibling:

- `src/routes/api/acp/` — 2 file(s)
- `src/routes/api/agent/` — 1 file(s)
- `src/routes/api/agents/` — 1 file(s)
- `src/routes/api/analysis/` — 1 file(s)
- `src/routes/api/analyze-file/` — 1 file(s)
- `src/routes/api/analyze-tag/` — 1 file(s)
- `src/routes/api/audit/` — 2 file(s)
- `src/routes/api/case-theory/` — 1 file(s)
- `src/routes/api/charges/` — 1 file(s)
- `src/routes/api/consolidation/` — 1 file(s)
- `src/routes/api/conversations/` — 1 file(s)
- `src/routes/api/courtroom/` — 1 file(s)
- `src/routes/api/dashboard/` — 1 file(s)
- `src/routes/api/db/` — 1 file(s)
- `src/routes/api/detective/` — 2 file(s)
- `src/routes/api/dev/` — 1 file(s)
- `src/routes/api/docs/` — 1 file(s)
- `src/routes/api/document/` — 2 file(s)
- `src/routes/api/embed/` — 1 file(s)
- `src/routes/api/engagement/` — 2 file(s)
- `src/routes/api/feedback/` — 1 file(s)
- `src/routes/api/fictional-cases/` — 2 file(s)
- `src/routes/api/generate-cluster-summaries/` — 1 file(s)
- `src/routes/api/gpu-wasm-integration/` — 1 file(s)
- `src/routes/api/hypergraph/` — 1 file(s)
- `src/routes/api/indexing/` — 1 file(s)
- `src/routes/api/infrastructure/` — 1 file(s)
- `src/routes/api/ingest/` — 2 file(s)
- `src/routes/api/ingest-constitution/` — 1 file(s)
- `src/routes/api/internal/` — 2 file(s)
- `src/routes/api/investigate/` — 1 file(s)
- `src/routes/api/kb/` — 2 file(s)
- `src/routes/api/mcp/` — 1 file(s)
- `src/routes/api/metrics/` — 1 file(s)
- `src/routes/api/ml/` — 1 file(s)
- `src/routes/api/nlp/` — 2 file(s)
- `src/routes/api/observability/` — 1 file(s)
- `src/routes/api/obsidian/` — 1 file(s)
- `src/routes/api/ollama/` — 2 file(s)
- `src/routes/api/onboarding/` — 1 file(s)
- `src/routes/api/orchestrator/` — 1 file(s)
- `src/routes/api/persons/` — 2 file(s)
- `src/routes/api/phase109/` — 2 file(s)
- `src/routes/api/phase82/` — 2 file(s)
- `src/routes/api/ping/` — 1 file(s)
- `src/routes/api/pipeline/` — 2 file(s)
- `src/routes/api/playwright/` — 1 file(s)
- `src/routes/api/precedents/` — 2 file(s)
- `src/routes/api/push/` — 2 file(s)
- `src/routes/api/qlora/` — 1 file(s)
- `src/routes/api/queue/` — 1 file(s)
- `src/routes/api/rabbitmq/` — 1 file(s)
- `src/routes/api/route-operations/` — 1 file(s)
- `src/routes/api/security/` — 1 file(s)
- `src/routes/api/sse/` — 2 file(s)
- `src/routes/api/stream/` — 2 file(s)
- `src/routes/api/sync/` — 1 file(s)
- `src/routes/api/tasks/` — 2 file(s)
- `src/routes/api/topology/` — 2 file(s)
- `src/routes/api/user/` — 1 file(s)
- `src/routes/api/vector-search/` — 1 file(s)
- `src/routes/api/video/` — 1 file(s)
- `src/routes/api/vision/` — 1 file(s)
- `src/routes/api/web/` — 2 file(s)
- `src/routes/api/websearch/` — 1 file(s)
- `src/routes/api/whisper/` — 1 file(s)
- `src/routes/api/worker/` — 1 file(s)
- `src/routes/api/workflow-events/` — 1 file(s)

## Agent Analysis: Directory Consolidation

_Agent did not run — start Ollama and re-run_

## Consolidation Rules

1. **Never move** route files (`+page.svelte`, `+server.ts`) without updating all fetch() paths
2. **Update barrel exports** (`index.ts`) after any lib/ move
3. **Run** `npm run check` after every move — 0 errors required before committing
4. **Run** `node scripts/tests/test-screenshots.mjs` to verify no 500s introduced

## Immediate Action Items

```bash
# 1. Verify each tiny dir has zero consumers before merging
rg "from.*<DIR_NAME>" src/ --type ts --type svelte

# 2. Move files
mv src/routes/api/<small-dir>/* src/routes/api/<parent-dir>/

# 3. Check for broken imports
npm run check

# 4. Run screenshot regression
node scripts/tests/test-screenshots.mjs --all
```
