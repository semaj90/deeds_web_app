---
type: "file"
path: "src/lib/server/graph/relationship-extractor.ts"
aliases: ["relationship-extractor.ts","src/lib/server/graph/relationship-extractor.ts"]
clusterId: 73
ext: ".ts"
lineCount: 466
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/relationship-extractor.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/relationship-extractor.ts`
## For future Claude
> Relationship Extractor — P5 Codebase Relationship Mapper
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 466
## Summary

Relationship Extractor — P5 Codebase Relationship Mapper

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```