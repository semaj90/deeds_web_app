---
type: "file"
path: "src/routes/api/evidence/upload/+server.ts"
aliases: ["+server.ts","src/routes/api/evidence/upload/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 2304
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 30
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/evidence/upload/+server.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/evidence/upload/+server.ts`
## For future Claude
> Min text length before we try OCR fallback for scanned PDFs
pagerank:: 0.000000
blend:: 0.000000
lines:: 2304
## Summary

Min text length before we try OCR fallback for scanned PDFs

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```