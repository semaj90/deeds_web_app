---
type: "file"
path: "src/lib/server/indexer/workspace-metadata-extractor.ts"
aliases: ["workspace-metadata-extractor.ts","src/lib/server/indexer/workspace-metadata-extractor.ts"]
clusterId: -1
ext: ".ts"
lineCount: 583
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/workspace-metadata-extractor.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/workspace-metadata-extractor.ts`
## For future Claude
> workspace-metadata-extractor.ts
pagerank:: 0.000000
blend:: 0.000000
lines:: 583
## Summary

workspace-metadata-extractor.ts

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```