---
type: "file"
path: "src/lib/server/ocr/extractText.ts"
aliases: ["extractText.ts","src/lib/server/ocr/extractText.ts"]
clusterId: 6
ext: ".ts"
lineCount: 54
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ocr/extractText.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ocr/extractText.ts`
## For future Claude
> Basic OCR implementation using Tesseract.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 54
## Summary

Basic OCR implementation using Tesseract.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```