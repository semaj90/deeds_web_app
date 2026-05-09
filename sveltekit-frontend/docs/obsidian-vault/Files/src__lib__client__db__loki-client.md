---
type: "file"
path: "src/lib/client/db/loki-client.ts"
aliases: ["loki-client.ts","src/lib/client/db/loki-client.ts"]
clusterId: 57
ext: ".ts"
lineCount: 91
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/client/db/loki-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/client/db/loki-client.ts`
## For future Claude
> Lightweight LokiJS client-side cache for editor drafts.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 91
## Summary

Lightweight LokiJS client-side cache for editor drafts.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```