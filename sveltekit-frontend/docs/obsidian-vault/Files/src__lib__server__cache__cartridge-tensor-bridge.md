---
type: "file"
path: "src/lib/server/cache/cartridge-tensor-bridge.ts"
aliases: ["cartridge-tensor-bridge.ts","src/lib/server/cache/cartridge-tensor-bridge.ts"]
clusterId: -1
ext: ".ts"
lineCount: 531
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cache/cartridge-tensor-bridge.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/redis-service]]","[[Files/cartridge__chr97-builder]]","[[Files/analysis__concurrency-gate]]","[[Files/grpc__embedding-client]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/cache/cartridge-tensor-bridge.ts`
## For future Claude
> Cartridge-Tensor Bridge — Redis ↔ CHR-ROM97 ↔ GPU Tensor ↔ NES Adaptive Memory
pagerank:: 0.000000
blend:: 0.000000
lines:: 531
## Summary

Cartridge-Tensor Bridge — Redis ↔ CHR-ROM97 ↔ GPU Tensor ↔ NES Adaptive Memory

## Imports

- imports:: [[Files/redis-service]] `../redis-service.js`
- imports:: [[Files/cartridge__chr97-builder]] `../cartridge/chr97-builder.js`
- imports:: [[Files/analysis__concurrency-gate]] `../analysis/concurrency-gate.js`
- imports:: [[Files/grpc__embedding-client]] `../grpc/embedding-client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```