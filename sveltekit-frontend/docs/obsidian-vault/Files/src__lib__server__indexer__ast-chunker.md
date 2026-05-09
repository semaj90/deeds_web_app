---
type: "file"
path: "src/lib/server/indexer/ast-chunker.ts"
aliases: ["ast-chunker.ts","src/lib/server/indexer/ast-chunker.ts"]
clusterId: 58
ext: ".ts"
lineCount: 510
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/ast-chunker.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/ast-ingest-logger]]","[[Files/workspace-metadata-extractor]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/ast-chunker.ts`
## For future Claude
> AST-Aware Code Chunker
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 510
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