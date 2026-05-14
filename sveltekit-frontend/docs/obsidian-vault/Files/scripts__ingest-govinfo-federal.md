---
type: "file"
path: "scripts/ingest-govinfo-federal.ts"
aliases: ["ingest-govinfo-federal.ts","scripts/ingest-govinfo-federal.ts"]
clusterId: -1
ext: ".ts"
lineCount: 918
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/ingest-govinfo-federal.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/src__lib__server__vector__bm42-sparse]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/ingest-govinfo-federal_ts"]
---

# `scripts/ingest-govinfo-federal.ts`
## For future Claude
> GovInfo Federal Corpus Ingest  (Phase 2)
pagerank:: 0.000000
blend:: 0.000000
lines:: 918
## Summary

GovInfo Federal Corpus Ingest  (Phase 2)

## Imports

- imports:: [[Files/src__lib__server__vector__bm42-sparse]] `../src/lib/server/vector/bm42-sparse.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```