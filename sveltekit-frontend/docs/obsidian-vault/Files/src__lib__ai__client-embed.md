---
type: "file"
path: "src/lib/ai/client-embed.ts"
aliases: ["client-embed.ts","src/lib/ai/client-embed.ts"]
clusterId: 14
ext: ".ts"
lineCount: 280
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/client-embed.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: ["[[Files/model-ids]]","[[Files/onnx__session]]","[[Files/client-cache]]"]
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/client-embed.ts`
## For future Claude
> Client-Side Embedding via ONNX — first real local inference target.
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 280
## Summary

Client-Side Embedding via ONNX — first real local inference target.

## Imports

- imports:: [[Files/model-ids]] `./model-ids.js`
- imports:: [[Files/onnx__session]] `./onnx/session.js`
- imports:: [[Files/client-cache]] `./client-cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```