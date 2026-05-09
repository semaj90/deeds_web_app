---
type: "file"
path: "src/lib/server/grpc/embedding-client.ts"
aliases: ["embedding-client.ts","src/lib/server/grpc/embedding-client.ts"]
clusterId: 82
ext: ".ts"
lineCount: 914
pagerank: 0.213436
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/grpc/embedding-client.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-82]]"]
imports: ["[[Files/client-options]]"]
tags: ["file","ext/ts","cluster/82","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/grpc/embedding-client.ts`
## For future Claude
> Multi-Protocol Embedding Client — server-only.
cluster:: [[Clusters/cluster-82]]
pagerank:: 0.213436
blend:: 0.000000
lines:: 914
## Summary

Multi-Protocol Embedding Client — server-only.

## Imports

- imports:: [[Files/client-options]] `./client-options.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```