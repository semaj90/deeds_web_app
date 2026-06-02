# Feature-Pillar Barrel Migration

## What This Is

The `src/lib/server/features/` directory contains 8 "barrel" `index.ts` files that aggregate exports from scattered server modules into logical feature domains. This document tracks the migration of import consumers from old scattered paths to the barrel index paths.

## Barrel Inventory

| Barrel | Path | Modules Re-Exported |
|--------|------|---------------------|
| `ai` | `src/lib/server/features/ai/index.ts` | ACE, context-assembler, gemma4-agent, token-tracker, hermes tools, kv-context, model-security, opencode-skill, ... (24 modules) |
| `observability` | `src/lib/server/features/observability/index.ts` | search-analytics, search-cache, api-audit-buffer, codebase-research, architectural-guard, mapreduce-matrix-analysis, unified-research-query |
| `rag` | `src/lib/server/features/rag/index.ts` | codebase-context, multi-lane-retrieval, ngram-retrieval, retrieval-lanes, cold-storage-retrieval, context-buffer, ace-retrieval-logger |
| `cases` | `src/lib/server/features/cases/index.ts` | deep-research, hypergraph-4d, research-graph-rl, research-summaries-db, web-research-crawler, reward-events, telemetry |
| `codebase-intel` | `src/lib/server/features/codebase-intel/index.ts` | karpathy-wiki, cluster-summary, directory-summarizer, run-cluster-assign |
| `evidence` | `src/lib/server/features/evidence/index.ts` | evidence-audit, batch-entity-storer, video-ingest-service, seed |
| `legal-corpus` | `src/lib/server/features/legal-corpus/index.ts` | law-citations, ingestion-worker, constitution-pipeline, seed-citations |
| `identity` | `src/lib/server/features/identity/index.ts` | seed-dev-user |

## Backward-Compat Shims

The old scattered paths (e.g. `src/lib/server/analytics/search-analytics.ts`) are kept as **one-line re-export shims** that point to the features/ location:

```typescript
// src/lib/server/analytics/search-analytics.ts
export * from '$lib/server/features/observability/search-analytics.js';
```

This means both old and new import paths resolve to the same module — no breaking changes.

## Migration Wave 1 (2026-06-01)

Migrated **16 files** across 3 barrel categories to use the barrel index:

### Observability barrel (`$lib/server/features/observability/index.js`)

Previously imported `$lib/server/analytics/search-analytics.js`:

- `src/lib/server/features/ai/ace/context-assembler.ts`
- `src/lib/server/retrieval/query-expander.ts`
- `src/routes/api/agents/chat/+server.ts`
- `src/routes/api/ai/agent/+server.ts`
- `src/routes/api/ai/contextual-chat/+server.ts`

### RAG barrel (`$lib/server/features/rag/index.js`)

Previously imported `$lib/server/retrieval/codebase-context.js`:

- `src/lib/server/ace/ace-wiki.ts`
- `src/lib/server/codeintel/fix-recommender.ts`
- `src/routes/api/codebase/rerank/+server.ts`
- `src/routes/api/codebase-index/claude-assist/+server.ts`
- `src/routes/api/sse/chat/+server.ts`

### Codebase-Intel barrel (`$lib/server/features/codebase-intel/index.js`)

Previously imported `$lib/server/indexer/karpathy-wiki.js`:

- `src/lib/server/obsidian/markdown-wiki-note.ts`
- `src/lib/server/obsidian/wiki-vault-watcher.ts`
- `src/lib/server/research/research-to-wiki-encoder.ts`
- `src/routes/api/codebase-index/wiki/+server.ts`
- `src/routes/api/wiki/moc/+server.ts`
- `src/routes/api/wiki/sync-to-obsidian/+server.ts`

## Why Barrel Imports

1. **Single import surface** — `import { recordSearchQuery, getHotQueries } from '$lib/server/features/observability'` vs. knowing which sub-file each function lives in
2. **Refactoring safety** — moving a module within `features/observability/` only requires updating the barrel's `index.ts`, not every consumer
3. **Feature cohesion signal** — if something is in the `rag` barrel, it belongs to the RAG domain; this makes cross-domain coupling visible at import time
4. **Deprecation path** — old shim paths can be removed once all consumers are migrated (non-urgent; shims have zero runtime cost)

## Remaining Migration Scope

~30+ files still import via old scattered paths. Priority order for next waves:

1. `$lib/server/analytics/search-analytics.js` — 31 remaining consumers (Wave 1 migrated 5)
2. `$lib/server/retrieval/codebase-context.js` — 0 remaining (all 5 migrated)
3. `$lib/server/indexer/karpathy-wiki.js` — 0 remaining (all 6 migrated)
4. `$lib/server/ace/context-assembler.js` — 9 consumers → `$lib/server/features/ai/index.js`
5. `$lib/server/ai/token-tracker.js` — 9 consumers → `$lib/server/features/ai/index.js`

## How to Migrate (for future waves)

```bash
# Find remaining consumers
grep -r "from.*server/analytics/search-analytics" src/ --include="*.ts" -l

# Apply migration (example)
sed -i "s|from '\$lib/server/analytics/search-analytics.js'|from '\$lib/server/features/observability/index.js'|g" <files...>

# Verify
npx svelte-check --threshold error
```
