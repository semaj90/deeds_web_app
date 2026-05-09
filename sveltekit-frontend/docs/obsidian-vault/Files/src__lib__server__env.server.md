---
type: "file"
path: "src/lib/server/env.server.ts"
aliases: ["env.server.ts","src/lib/server/env.server.ts"]
clusterId: 6
ext: ".ts"
lineCount: 259
pagerank: 0.553206
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/env.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/env.server.ts`
## For future Claude
> Legal reasoning / chat / tool-calling model (unified GRPO legal + VLM, 5.3GB)
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.553206
blend:: 0.000000
lines:: 259
## Summary

Legal reasoning / chat / tool-calling model (unified GRPO legal + VLM, 5.3GB)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```