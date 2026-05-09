---
type: "file"
path: "src/lib/server/ai/kv-context-controller.ts"
aliases: ["kv-context-controller.ts","src/lib/server/ai/kv-context-controller.ts"]
clusterId: 19
ext: ".ts"
lineCount: 315
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/kv-context-controller.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/context-compression]]","[[Files/context-compression]]"]
tags: ["file","ext/ts","cluster/19","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/kv-context-controller.ts`
## For future Claude
> kv-context-controller.ts
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 315
## Summary

kv-context-controller.ts

## Imports

- imports:: [[Files/context-compression]] `./context-compression.js`
- imports:: [[Files/context-compression]] `./context-compression.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```