---
type: "file"
path: "src/lib/server/ace/hmm-wiki-logger.ts"
aliases: ["hmm-wiki-logger.ts","src/lib/server/ace/hmm-wiki-logger.ts"]
clusterId: 6
ext: ".ts"
lineCount: 252
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/hmm-wiki-logger.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/hmm-wiki-logger.ts`
## For future Claude
> HMM Wiki Logger — 4D Topology Store
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 252
## Summary

HMM Wiki Logger — 4D Topology Store

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```