---
type: "file"
path: "src/lib/server/indexer/directory-summarizer.ts"
aliases: ["directory-summarizer.ts","src/lib/server/indexer/directory-summarizer.ts"]
clusterId: -1
ext: ".ts"
lineCount: 524
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/directory-summarizer.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/directory-summarizer.ts`
## For future Claude
> Directory Summarizer — Graph Layer Integration
pagerank:: 0.000000
blend:: 0.000000
lines:: 524
## Summary

Directory Summarizer — Graph Layer Integration

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```