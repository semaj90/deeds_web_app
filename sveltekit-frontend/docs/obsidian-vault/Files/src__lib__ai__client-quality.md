---
type: "file"
path: "src/lib/ai/client-quality.ts"
aliases: ["client-quality.ts","src/lib/ai/client-quality.ts"]
clusterId: 14
ext: ".ts"
lineCount: 343
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/client-quality.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: []
tags: ["file","ext/ts","cluster/14","zod","t/ts","t/src","t/lib"]
---

# `src/lib/ai/client-quality.ts`
## For future Claude
> Client-Side Quality Schema — Determines when local synthesis is sufficient
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 343
## Summary

Client-Side Quality Schema — Determines when local synthesis is sufficient

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```