---
type: "file"
path: "src/lib/utils/telemetry.ts"
aliases: ["telemetry.ts","src/lib/utils/telemetry.ts"]
clusterId: 1
ext: ".ts"
lineCount: 64
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/telemetry.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","auth","t/ts","t/src","t/lib"]
---

# `src/lib/utils/telemetry.ts`
## For future Claude
> .ts at src/lib/utils/telemetry.ts (64 lines), auth-guarded.
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 64
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```