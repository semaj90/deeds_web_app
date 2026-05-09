---
type: "file"
path: "src/lib/server/llm/gemmaReports.ts"
aliases: ["gemmaReports.ts","src/lib/server/llm/gemmaReports.ts"]
clusterId: 44
ext: ".ts"
lineCount: 113
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/llm/gemmaReports.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-44]]"]
imports: []
tags: ["file","ext/ts","cluster/44","t/ts","t/src","t/lib"]
---

# `src/lib/server/llm/gemmaReports.ts`
## For future Claude
> .ts at src/lib/server/llm/gemmaReports.ts (113 lines).
cluster:: [[Clusters/cluster-44]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 113
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```