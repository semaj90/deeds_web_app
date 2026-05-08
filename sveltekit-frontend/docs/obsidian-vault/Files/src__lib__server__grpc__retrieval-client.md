---
type: "file"
path: "src/lib/server/grpc/retrieval-client.ts"
aliases: ["retrieval-client.ts","src/lib/server/grpc/retrieval-client.ts"]
clusterId: 58
ext: ".ts"
lineCount: 1044
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/grpc/retrieval-client.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/client-options]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/grpc/retrieval-client.ts`
## For future Claude
> gRPC Retrieval Client — server-only.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1044
## Summary

gRPC Retrieval Client — server-only.

## Imports

- imports:: [[Files/client-options]] `./client-options.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```