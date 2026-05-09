---
type: "file"
path: "src/lib/server/rag/uiComplianceRag.ts"
aliases: ["uiComplianceRag.ts","src/lib/server/rag/uiComplianceRag.ts"]
clusterId: 43
ext: ".ts"
lineCount: 94
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/rag/uiComplianceRag.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-43]]"]
imports: []
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/rag/uiComplianceRag.ts`
## For future Claude
> .ts at src/lib/server/rag/uiComplianceRag.ts (94 lines).
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 94
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```