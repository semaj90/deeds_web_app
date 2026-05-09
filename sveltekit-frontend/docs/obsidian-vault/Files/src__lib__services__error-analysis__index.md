---
type: "file"
path: "src/lib/services/error-analysis/index.ts"
aliases: ["index.ts","src/lib/services/error-analysis/index.ts"]
clusterId: 16
ext: ".ts"
lineCount: 26
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/error-analysis/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-16]]"]
imports: []
tags: ["file","ext/ts","cluster/16","t/ts","t/src","t/lib"]
---

# `src/lib/services/error-analysis/index.ts`
## For future Claude
> Error Analysis barrel export
cluster:: [[Clusters/cluster-16]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 26
## Summary

Error Analysis barrel export

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```