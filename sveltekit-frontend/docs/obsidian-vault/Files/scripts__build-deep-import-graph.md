---
type: "file"
path: "scripts/build-deep-import-graph.mjs"
aliases: ["build-deep-import-graph.mjs","scripts/build-deep-import-graph.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 516
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/build-deep-import-graph.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/build-deep-import-graph_mjs"]
---

# `scripts/build-deep-import-graph.mjs`
## For future Claude
> Phase 1 — Deep Import Graph Builder
pagerank:: 0.000000
blend:: 0.000000
lines:: 516
## Summary

Phase 1 — Deep Import Graph Builder

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```