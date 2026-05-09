---
type: "file"
path: "src/lib/server/docling.ts"
aliases: ["docling.ts","src/lib/server/docling.ts"]
clusterId: 56
ext: ".ts"
lineCount: 331
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/docling.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-56]]"]
imports: []
tags: ["file","ext/ts","cluster/56","t/ts","t/src","t/lib"]
---

# `src/lib/server/docling.ts`
## For future Claude
> Docling Integration Module
cluster:: [[Clusters/cluster-56]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 331
## Summary

Docling Integration Module

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```