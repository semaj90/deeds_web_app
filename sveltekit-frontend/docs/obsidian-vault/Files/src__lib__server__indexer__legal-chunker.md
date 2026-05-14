---
type: "file"
path: "src/lib/server/indexer/legal-chunker.ts"
aliases: ["legal-chunker.ts","src/lib/server/indexer/legal-chunker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 749
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/legal-chunker.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/legal-chunker.ts`
## For future Claude
> Structure-Aware Legal Document Chunker
pagerank:: 0.000000
blend:: 0.000000
lines:: 749
## Summary

Structure-Aware Legal Document Chunker

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```