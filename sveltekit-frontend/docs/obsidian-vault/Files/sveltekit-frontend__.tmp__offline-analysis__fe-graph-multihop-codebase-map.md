---
type: "file"
path: "sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json"
aliases: ["fe-graph-multihop-codebase-map.json","sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json"]
clusterId: -1
ext: ".json"
lineCount: 236850
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json"
last_updated_by_llm: "2026-05-31T20:57:35.121Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `sveltekit-frontend/.tmp/offline-analysis/fe-graph-multihop-codebase-map.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 236850
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```