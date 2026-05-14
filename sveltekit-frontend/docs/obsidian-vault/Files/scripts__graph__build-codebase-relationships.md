---
type: "file"
path: "scripts/graph/build-codebase-relationships.mjs"
aliases: ["build-codebase-relationships.mjs","scripts/graph/build-codebase-relationships.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 589
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/graph/build-codebase-relationships.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/graph"]
---

# `scripts/graph/build-codebase-relationships.mjs`
## For future Claude
> build-codebase-relationships.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 589
## Summary

build-codebase-relationships.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```