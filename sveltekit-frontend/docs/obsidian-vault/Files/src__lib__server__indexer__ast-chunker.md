---
type: "file"
path: "src/lib/server/indexer/ast-chunker.ts"
aliases: ["ast-chunker.ts","src/lib/server/indexer/ast-chunker.ts"]
clusterId: -1
ext: ".ts"
lineCount: 514
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/ast-chunker.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/ast-ingest-logger]]","[[Files/workspace-metadata-extractor]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/ast-chunker.ts`
## For future Claude
> AST-Aware Code Chunker
pagerank:: 0.000000
blend:: 0.000000
lines:: 514
## Summary

AST-Aware Code Chunker

## Imports

- imports:: [[Files/ast-ingest-logger]] `./ast-ingest-logger.js`
- imports:: [[Files/workspace-metadata-extractor]] `./workspace-metadata-extractor.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```