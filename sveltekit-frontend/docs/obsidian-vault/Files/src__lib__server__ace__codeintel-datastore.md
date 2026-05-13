---
type: "file"
path: "src/lib/server/ace/codeintel-datastore.ts"
aliases: ["codeintel-datastore.ts","src/lib/server/ace/codeintel-datastore.ts"]
clusterId: -1
ext: ".ts"
lineCount: 416
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/codeintel-datastore.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/research__web-research-ingester]]","[[Files/grpc__retrieval-client]]","[[Files/ai__hypergraph-store]]","[[Files/research__lane4-feedback]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/codeintel-datastore.ts`
## For future Claude
> codeintel-datastore.ts — ACE-facing normalized datastore for CodeIntel.
pagerank:: 0.000000
blend:: 0.000000
lines:: 416
## Summary

codeintel-datastore.ts — ACE-facing normalized datastore for CodeIntel.

## Imports

- imports:: [[Files/research__web-research-ingester]] `../research/web-research-ingester.js`
- imports:: [[Files/grpc__retrieval-client]] `../grpc/retrieval-client.js`
- imports:: [[Files/ai__hypergraph-store]] `../ai/hypergraph-store.js`
- imports:: [[Files/research__lane4-feedback]] `../research/lane4-feedback.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```