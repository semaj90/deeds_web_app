---
type: "file"
path: "scripts/build-atlas-index.mjs"
aliases: ["build-atlas-index.mjs","scripts/build-atlas-index.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 519
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/build-atlas-index.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/build-atlas-index_mjs"]
---

# `scripts/build-atlas-index.mjs`
## For future Claude
> build-atlas-index.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 519
## Summary

build-atlas-index.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```