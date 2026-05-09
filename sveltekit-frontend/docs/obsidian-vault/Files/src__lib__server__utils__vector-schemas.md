---
type: "file"
path: "src/lib/server/utils/vector-schemas.ts"
aliases: ["vector-schemas.ts","src/lib/server/utils/vector-schemas.ts"]
clusterId: 43
ext: ".ts"
lineCount: 16
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/utils/vector-schemas.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-43]]"]
imports: []
tags: ["file","ext/ts","cluster/43","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/utils/vector-schemas.ts`
## For future Claude
> .ts at src/lib/server/utils/vector-schemas.ts (16 lines).
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 16
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```