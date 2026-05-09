---
type: "file"
path: "src/lib/server/ace/kag-dag-runner.ts"
aliases: ["kag-dag-runner.ts","src/lib/server/ace/kag-dag-runner.ts"]
clusterId: 6
ext: ".ts"
lineCount: 174
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/kag-dag-runner.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/kag-dag-runner.ts`
## For future Claude
> .ts at src/lib/server/ace/kag-dag-runner.ts (174 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 174
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```