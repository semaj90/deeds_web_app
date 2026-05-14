---
type: "file"
path: "scripts/index-legal-pdfs.ts"
aliases: ["index-legal-pdfs.ts","scripts/index-legal-pdfs.ts"]
clusterId: -1
ext: ".ts"
lineCount: 564
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/scripts/index-legal-pdfs.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/src__lib__server__vector__bm42-sparse]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/index-legal-pdfs_ts"]
---

# `scripts/index-legal-pdfs.ts`
## For future Claude
> Index Legal PDFs into Legal Library
pagerank:: 0.000000
blend:: 0.000000
lines:: 564
## Summary

Index Legal PDFs into Legal Library

## Imports

- imports:: [[Files/src__lib__server__vector__bm42-sparse]] `../src/lib/server/vector/bm42-sparse.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```