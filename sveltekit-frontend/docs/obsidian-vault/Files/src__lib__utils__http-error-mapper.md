---
type: "file"
path: "src/lib/utils/http-error-mapper.ts"
aliases: ["http-error-mapper.ts","src/lib/utils/http-error-mapper.ts"]
clusterId: 1
ext: ".ts"
lineCount: 88
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/http-error-mapper.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","zod","t/ts","t/src","t/lib"]
---

# `src/lib/utils/http-error-mapper.ts`
## For future Claude
> Map a fetch Response to a ServiceError
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 88
## Summary

Map a fetch Response to a ServiceError

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```