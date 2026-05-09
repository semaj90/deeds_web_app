---
type: "file"
path: "src/lib/server/gpu/topology-projection.ts"
aliases: ["topology-projection.ts","src/lib/server/gpu/topology-projection.ts"]
clusterId: 20
ext: ".ts"
lineCount: 257
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/topology-projection.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: ["[[Files/libtorch-bridge]]"]
tags: ["file","ext/ts","cluster/20","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/topology-projection.ts`
## For future Claude
> Topology Projection Bridge — GPU-accelerated PCA and autoencoder projection.
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 257
## Summary

Topology Projection Bridge — GPU-accelerated PCA and autoencoder projection.

## Imports

- imports:: [[Files/libtorch-bridge]] `./libtorch-bridge.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```