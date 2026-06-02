---
type: "file"
path: "memory/exports/parent-atlas/parent_atlas_index.json"
aliases: ["parent_atlas_index.json","memory/exports/parent-atlas/parent_atlas_index.json"]
clusterId: -1
ext: ".json"
lineCount: 131226
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/memory/exports/parent-atlas/parent_atlas_index.json"
last_updated_by_llm: "2026-06-01T22:46:28.142Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `memory/exports/parent-atlas/parent_atlas_index.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 131226
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```