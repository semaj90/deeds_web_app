---
type: "file"
path: "src/lib/server/chrrom/bus.ts"
aliases: ["bus.ts","src/lib/server/chrrom/bus.ts"]
clusterId: 6
ext: ".ts"
lineCount: 34
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/chrrom/bus.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/patterns]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/chrrom/bus.ts`
## For future Claude
> Minimal in-memory SSE bus for CHR-ROM patterns
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 34
## Summary

Minimal in-memory SSE bus for CHR-ROM patterns

## Imports

- imports:: [[Files/patterns]] `./patterns.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```