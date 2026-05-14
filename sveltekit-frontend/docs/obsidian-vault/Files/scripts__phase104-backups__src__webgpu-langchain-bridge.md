---
type: "file"
path: "scripts/phase104-backups/src/webgpu-langchain-bridge.ts"
aliases: ["webgpu-langchain-bridge.ts","scripts/phase104-backups/src/webgpu-langchain-bridge.ts"]
clusterId: -1
ext: ".ts"
lineCount: 468
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/webgpu-langchain-bridge.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/embedding-cache-middleware]]","[[Files/webgpu-redis-optimizer]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/webgpu-langchain-bridge.ts`
## For future Claude
> WebGPU-LangChain Integration Bridge
pagerank:: 0.000000
blend:: 0.000000
lines:: 468
## Summary

WebGPU-LangChain Integration Bridge

## Imports

- imports:: [[Files/embedding-cache-middleware]] `./embedding-cache-middleware.js`
- imports:: [[Files/webgpu-redis-optimizer]] `./webgpu-redis-optimizer.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```