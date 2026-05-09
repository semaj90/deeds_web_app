---
type: "file"
path: "src/lib/server/legal/constitution-tagger.ts"
aliases: ["constitution-tagger.ts","src/lib/server/legal/constitution-tagger.ts"]
clusterId: 47
ext: ".ts"
lineCount: 201
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/legal/constitution-tagger.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-47]]"]
imports: []
tags: ["file","ext/ts","cluster/47","t/ts","t/src","t/lib"]
---

# `src/lib/server/legal/constitution-tagger.ts`
## For future Claude
> Constitution Auto-Tagger
cluster:: [[Clusters/cluster-47]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 201
## Summary

Constitution Auto-Tagger

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```