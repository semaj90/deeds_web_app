---
type: "file"
path: "scripts/seed-graph-and-vectors.mjs"
aliases: ["seed-graph-and-vectors.mjs","scripts/seed-graph-and-vectors.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 443
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/scripts/seed-graph-and-vectors.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/seed-graph-and-vectors_mjs"]
---

# `scripts/seed-graph-and-vectors.mjs`
## For future Claude
> Seed script: Graph connections + Qdrant evidence vectors
pagerank:: 0.000000
blend:: 0.000000
lines:: 443
## Summary

Seed script: Graph connections + Qdrant evidence vectors

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```