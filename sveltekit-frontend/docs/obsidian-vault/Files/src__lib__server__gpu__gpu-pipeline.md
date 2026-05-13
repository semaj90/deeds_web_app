---
type: "file"
path: "src/lib/server/gpu/gpu-pipeline.ts"
aliases: ["gpu-pipeline.ts","src/lib/server/gpu/gpu-pipeline.ts"]
clusterId: -1
ext: ".ts"
lineCount: 554
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/gpu-pipeline.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/libtorch-bridge]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/gpu/gpu-pipeline.ts`
## For future Claude
> GPU Pipeline — stream-aware async queuing + Redis shape-cache for MCP tool calls.
pagerank:: 0.000000
blend:: 0.000000
lines:: 554
## Summary

GPU Pipeline — stream-aware async queuing + Redis shape-cache for MCP tool calls.

## Imports

- imports:: [[Files/libtorch-bridge]] `./libtorch-bridge.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```