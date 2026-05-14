---
type: "file"
path: "scripts/graphify-semantic-cluster.mjs"
aliases: ["graphify-semantic-cluster.mjs","scripts/graphify-semantic-cluster.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 543
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/graphify-semantic-cluster.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/graphify-semantic-cluster_mjs"]
---

# `scripts/graphify-semantic-cluster.mjs`
## For future Claude
> graphify-semantic-cluster.mjs — Phase B: Semantic cluster mapping
pagerank:: 0.000000
blend:: 0.000000
lines:: 543
## Summary

graphify-semantic-cluster.mjs — Phase B: Semantic cluster mapping

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```