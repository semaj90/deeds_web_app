---
type: "file"
path: "src/lib/server/evidence/services/ocr.ts"
aliases: ["ocr.ts","src/lib/server/evidence/services/ocr.ts"]
clusterId: 66
ext: ".ts"
lineCount: 31
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/evidence/services/ocr.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-66]]"]
imports: []
tags: ["file","ext/ts","cluster/66","t/ts","t/src","t/lib"]
---

# `src/lib/server/evidence/services/ocr.ts`
## For future Claude
> .ts at src/lib/server/evidence/services/ocr.ts (31 lines).
cluster:: [[Clusters/cluster-66]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 31
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```