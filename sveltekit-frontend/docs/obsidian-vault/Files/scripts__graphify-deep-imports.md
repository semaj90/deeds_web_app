---
type: "file"
path: "scripts/graphify-deep-imports.mjs"
aliases: ["graphify-deep-imports.mjs","scripts/graphify-deep-imports.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 446
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/graphify-deep-imports.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/graphify-deep-imports_mjs"]
---

# `scripts/graphify-deep-imports.mjs`
## For future Claude
> graphify-deep-imports.mjs - Phase A typed deep import graph
pagerank:: 0.000000
blend:: 0.000000
lines:: 446
## Summary

graphify-deep-imports.mjs - Phase A typed deep import graph

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```