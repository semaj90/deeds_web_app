---
type: "file"
path: "src/lib/gpu/global-gpu-manager.ts"
aliases: ["global-gpu-manager.ts","src/lib/gpu/global-gpu-manager.ts"]
clusterId: 17
ext: ".ts"
lineCount: 133
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/gpu/global-gpu-manager.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/hybrid-gpu-context]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/gpu/global-gpu-manager.ts`
## For future Claude
> .ts at src/lib/gpu/global-gpu-manager.ts (133 lines).
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 133
## Imports

- imports:: [[Files/hybrid-gpu-context]] `./hybrid-gpu-context.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```