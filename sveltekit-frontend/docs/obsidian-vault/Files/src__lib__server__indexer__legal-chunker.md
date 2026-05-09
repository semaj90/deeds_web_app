---
type: "file"
path: "src/lib/server/indexer/legal-chunker.ts"
aliases: ["legal-chunker.ts","src/lib/server/indexer/legal-chunker.ts"]
clusterId: 58
ext: ".ts"
lineCount: 540
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/legal-chunker.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/legal-chunker.ts`
## For future Claude
> Structure-Aware Legal Document Chunker
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 540
## Summary

Structure-Aware Legal Document Chunker

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```