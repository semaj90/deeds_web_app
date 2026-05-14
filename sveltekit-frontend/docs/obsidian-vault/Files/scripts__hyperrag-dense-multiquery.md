---
type: "file"
path: "scripts/hyperrag-dense-multiquery.mjs"
aliases: ["hyperrag-dense-multiquery.mjs","scripts/hyperrag-dense-multiquery.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 448
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/hyperrag-dense-multiquery.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/hyperrag-dense-multiquery_mjs"]
---

# `scripts/hyperrag-dense-multiquery.mjs`
## For future Claude
> scripts/hyperrag-dense-multiquery.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 448
## Summary

scripts/hyperrag-dense-multiquery.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```