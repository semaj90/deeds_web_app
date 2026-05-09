---
type: "file"
path: "src/lib/server/tools/registry.ts"
aliases: ["registry.ts","src/lib/server/tools/registry.ts"]
clusterId: 78
ext: ".ts"
lineCount: 356
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tools/registry.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-78]]"]
imports: []
tags: ["file","ext/ts","cluster/78","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/tools/registry.ts`
## For future Claude
> ACE Tool Registry
cluster:: [[Clusters/cluster-78]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 356
## Summary

ACE Tool Registry

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```