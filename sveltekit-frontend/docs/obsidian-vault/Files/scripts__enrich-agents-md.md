---
type: "file"
path: "scripts/enrich-agents-md.mjs"
aliases: ["enrich-agents-md.mjs","scripts/enrich-agents-md.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 615
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/enrich-agents-md.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","auth","zod","t/mjs","t/scripts","t/enrich-agents-md_mjs"]
---

# `scripts/enrich-agents-md.mjs`
## For future Claude
> enrich-agents-md.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 615
## Summary

enrich-agents-md.mjs


## TODOs

- TODO
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```