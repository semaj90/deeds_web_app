---
type: "file"
path: "src/lib/server/research/research-utils.ts"
aliases: ["research-utils.ts","src/lib/server/research/research-utils.ts"]
clusterId: 43
ext: ".ts"
lineCount: 59
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/research-utils.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: []
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/research-utils.ts`
## For future Claude
> research-utils.ts — Shared utilities for Lane 3 research pipeline
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 59
## Summary

research-utils.ts — Shared utilities for Lane 3 research pipeline

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```