# Directory Consolidation Plan — 2026-06-16 18:19:20

> Auto-generated from Gemma4 agent analysis + static scan
> Source: `scripts/tests/test-production-readiness.mjs`

## Why Consolidate

Small directories (≤2 files) create navigation overhead without structural benefit.
Overlapping lib/ directories (e.g., `lib/cache/` vs `lib/server/cache/`) cause import confusion.

## Tiny API Route Directories (≤2 files each)

These are candidates to merge into a parent `misc/` group or nearest logical sibling:

- None found (or scan was skipped)

## Agent Analysis: Directory Consolidation

Hello! I am the TRACE dev agent for the YorHA legal AI platform. I have access to various advanced retrieval, graph analysis, and codebase understanding tools (like `search_hybrid`, `memory_recall`, `graph_expand`, etc.).

Please provide me with a task, a question about the codebase, or an area you would like me to investigate!

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
