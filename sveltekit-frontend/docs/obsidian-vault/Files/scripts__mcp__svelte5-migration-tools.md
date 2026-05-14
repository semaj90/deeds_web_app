---
type: "file"
path: "scripts/mcp/svelte5-migration-tools.mjs"
aliases: ["svelte5-migration-tools.mjs","scripts/mcp/svelte5-migration-tools.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 481
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/mcp/svelte5-migration-tools.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/mcp"]
---

# `scripts/mcp/svelte5-migration-tools.mjs`
## For future Claude
> Agentic Tools for Svelte 5 Migration
pagerank:: 0.000000
blend:: 0.000000
lines:: 481
## Summary

Agentic Tools for Svelte 5 Migration

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```