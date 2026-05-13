---
type: "file"
path: "src/lib/server/ace/ace-wiki.ts"
aliases: ["ace-wiki.ts","src/lib/server/ace/ace-wiki.ts"]
clusterId: -1
ext: ".ts"
lineCount: 782
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/ace-wiki.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/codeintel-datastore]]","[[Files/gemma4-codeintel]]","[[Files/grpc__retrieval-client]]","[[Files/retrieval__codebase-context]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/ace-wiki.ts`
## For future Claude
> ace-wiki.ts — Generate wiki-style articles from ACE codebase context.
pagerank:: 0.000000
blend:: 0.000000
lines:: 782
## Summary

ace-wiki.ts — Generate wiki-style articles from ACE codebase context.

## Imports

- imports:: [[Files/codeintel-datastore]] `./codeintel-datastore.js`
- imports:: [[Files/gemma4-codeintel]] `./gemma4-codeintel.js`
- imports:: [[Files/grpc__retrieval-client]] `../grpc/retrieval-client.js`
- imports:: [[Files/retrieval__codebase-context]] `../retrieval/codebase-context.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```