---
type: "file"
path: "scratch/index-checkpoints/directory-clusters.bak.json"
aliases: ["directory-clusters.bak.json","scratch/index-checkpoints/directory-clusters.bak.json"]
clusterId: -1
ext: ".json"
lineCount: 22858
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/scratch/index-checkpoints/directory-clusters.bak.json"
last_updated_by_llm: "2026-05-30T20:13:52.736Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `scratch/index-checkpoints/directory-clusters.bak.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 22858
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```