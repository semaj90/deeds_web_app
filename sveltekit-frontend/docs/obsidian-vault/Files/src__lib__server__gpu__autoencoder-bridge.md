---
type: "file"
path: "src/lib/server/gpu/autoencoder-bridge.ts"
aliases: ["autoencoder-bridge.ts","src/lib/server/gpu/autoencoder-bridge.ts"]
clusterId: 20
ext: ".ts"
lineCount: 130
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/autoencoder-bridge.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: []
tags: ["file","ext/ts","cluster/20","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/autoencoder-bridge.ts`
## For future Claude
> autoencoder-bridge.ts — GPU autoencoder + PCA projection (server-only).
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 130
## Summary

autoencoder-bridge.ts — GPU autoencoder + PCA projection (server-only).

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```