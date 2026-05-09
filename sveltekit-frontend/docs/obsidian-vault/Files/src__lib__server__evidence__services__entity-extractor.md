---
type: "file"
path: "src/lib/server/evidence/services/entity-extractor.ts"
aliases: ["entity-extractor.ts","src/lib/server/evidence/services/entity-extractor.ts"]
clusterId: 32
ext: ".ts"
lineCount: 38
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/evidence/services/entity-extractor.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-32]]"]
imports: []
tags: ["file","ext/ts","cluster/32","t/ts","t/src","t/lib"]
---

# `src/lib/server/evidence/services/entity-extractor.ts`
## For future Claude
> .ts at src/lib/server/evidence/services/entity-extractor.ts (38 lines).
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 38
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```