---
type: "file"
path: "src/lib/server/unified/legal-ai-service.ts"
aliases: ["legal-ai-service.ts","src/lib/server/unified/legal-ai-service.ts"]
clusterId: 6
ext: ".ts"
lineCount: 284
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 11
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/unified/legal-ai-service.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/unified/legal-ai-service.ts`
## For future Claude
> Unified Legal AI Service
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 284
## Summary

Unified Legal AI Service

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```