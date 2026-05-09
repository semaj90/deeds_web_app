---
type: "file"
path: "src/lib/test-utils/setup.ts"
aliases: ["setup.ts","src/lib/test-utils/setup.ts"]
clusterId: 57
ext: ".ts"
lineCount: 11
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/test-utils/setup.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: []
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/test-utils/setup.ts`
## For future Claude
> Test utilities — minimal setup/cleanup for component tests.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 11
## Summary

Test utilities — minimal setup/cleanup for component tests.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```