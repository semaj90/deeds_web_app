---
type: "file"
path: "src/lib/utils/index.ts"
aliases: ["index.ts","src/lib/utils/index.ts"]
clusterId: 1
ext: ".ts"
lineCount: 259
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","zod","t/ts","t/src","t/lib"]
---

# `src/lib/utils/index.ts`
## For future Claude
> Comprehensive Utility Functions
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 259
## Summary

Comprehensive Utility Functions

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```