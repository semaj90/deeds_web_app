---
type: "file"
path: "src/lib/server/embedding/embed.ts"
aliases: ["embed.ts","src/lib/server/embedding/embed.ts"]
clusterId: 6
ext: ".ts"
lineCount: 262
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/embedding/embed.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/embedding/embed.ts`
## For future Claude
> Embedding Facade — unified import point for all embedding operations.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 262
## Summary

Embedding Facade — unified import point for all embedding operations.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```