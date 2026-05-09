---
type: "file"
path: "src/lib/server/ai/llm-cache-trace.ts"
aliases: ["llm-cache-trace.ts","src/lib/server/ai/llm-cache-trace.ts"]
clusterId: 19
ext: ".ts"
lineCount: 16
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/llm-cache-trace.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/llm-cache-trace.ts`
## For future Claude
> .ts at src/lib/server/ai/llm-cache-trace.ts (16 lines).
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 16
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```