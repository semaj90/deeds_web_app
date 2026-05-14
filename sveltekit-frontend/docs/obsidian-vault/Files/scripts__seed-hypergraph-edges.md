---
type: "file"
path: "scripts/seed-hypergraph-edges.mjs"
aliases: ["seed-hypergraph-edges.mjs","scripts/seed-hypergraph-edges.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 524
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/seed-hypergraph-edges.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/seed-hypergraph-edges_mjs"]
---

# `scripts/seed-hypergraph-edges.mjs`
## For future Claude
> seed-hypergraph-edges.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 524
## Summary

seed-hypergraph-edges.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```