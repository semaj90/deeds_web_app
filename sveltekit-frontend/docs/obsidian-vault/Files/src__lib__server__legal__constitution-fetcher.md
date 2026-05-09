---
type: "file"
path: "src/lib/server/legal/constitution-fetcher.ts"
aliases: ["constitution-fetcher.ts","src/lib/server/legal/constitution-fetcher.ts"]
clusterId: 47
ext: ".ts"
lineCount: 171
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/legal/constitution-fetcher.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-47]]"]
imports: ["[[Files/html-normalizer]]","[[Files/constitution-registry]]"]
tags: ["file","ext/ts","cluster/47","t/ts","t/src","t/lib"]
---

# `src/lib/server/legal/constitution-fetcher.ts`
## For future Claude
> Constitution Fetcher
cluster:: [[Clusters/cluster-47]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 171
## Summary

Constitution Fetcher

## Imports

- imports:: [[Files/html-normalizer]] `./html-normalizer`
- imports:: [[Files/constitution-registry]] `./constitution-registry`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```