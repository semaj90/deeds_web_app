---
type: "file"
path: "src/lib/server/grpc/codeintel-client.ts"
aliases: ["codeintel-client.ts","src/lib/server/grpc/codeintel-client.ts"]
clusterId: 82
ext: ".ts"
lineCount: 190
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/grpc/codeintel-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-82]]"]
imports: []
tags: ["file","ext/ts","cluster/82","t/ts","t/src","t/lib"]
---

# `src/lib/server/grpc/codeintel-client.ts`
## For future Claude
> codeintel-client.ts — gRPC client for the CodeIntel service (port 50058)
cluster:: [[Clusters/cluster-82]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 190
## Summary

codeintel-client.ts — gRPC client for the CodeIntel service (port 50058)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```