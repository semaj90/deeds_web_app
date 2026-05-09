---
type: "file"
path: "src/lib/config/env.ts"
aliases: ["env.ts","src/lib/config/env.ts"]
clusterId: 75
ext: ".ts"
lineCount: 128
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/config/env.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-75]]"]
imports: []
tags: ["file","ext/ts","cluster/75","t/ts","t/src","t/lib"]
---

# `src/lib/config/env.ts`
## For future Claude
> Clamp GPU memory limit to sane range (64–8192 MB)
cluster:: [[Clusters/cluster-75]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 128
## Summary

Clamp GPU memory limit to sane range (64–8192 MB)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```