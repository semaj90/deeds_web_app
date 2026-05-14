---
type: "file"
path: "scripts/index-lawpdfs-to-rag.ts"
aliases: ["index-lawpdfs-to-rag.ts","scripts/index-lawpdfs-to-rag.ts"]
clusterId: -1
ext: ".ts"
lineCount: 643
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/scripts/index-lawpdfs-to-rag.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/src__lib__server__indexer__legal-chunker]]","[[Files/src__lib__server__indexer__legal-chunker]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/index-lawpdfs-to-rag_ts"]
---

# `scripts/index-lawpdfs-to-rag.ts`
## For future Claude
> Legal-aware lawpdfs → legal library + evidence indexer  (v2)
pagerank:: 0.000000
blend:: 0.000000
lines:: 643
## Summary

Legal-aware lawpdfs → legal library + evidence indexer  (v2)

## Imports

- imports:: [[Files/src__lib__server__indexer__legal-chunker]] `../src/lib/server/indexer/legal-chunker.js`
- imports:: [[Files/src__lib__server__indexer__legal-chunker]] `../src/lib/server/indexer/legal-chunker.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```