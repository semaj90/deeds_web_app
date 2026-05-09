---
type: "file"
path: "src/lib/server/gpu/libtorch-bridge.ts"
aliases: ["libtorch-bridge.ts","src/lib/server/gpu/libtorch-bridge.ts"]
clusterId: 20
ext: ".ts"
lineCount: 1469
pagerank: 0.20716
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/libtorch-bridge.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: []
tags: ["file","ext/ts","cluster/20","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/libtorch-bridge.ts`
## For future Claude
> LibTorch N-API Bridge — server-only.
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.207160
blend:: 0.000000
lines:: 1469
## Summary

LibTorch N-API Bridge — server-only.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```