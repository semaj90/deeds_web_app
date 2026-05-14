---
type: "file"
path: "scripts/kag-error.mjs"
aliases: ["kag-error.mjs","scripts/kag-error.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 588
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/kag-error.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/kag-error_mjs"]
---

# `scripts/kag-error.mjs`
## For future Claude
> kag-error.mjs — KAG error-analysis memory CLI
pagerank:: 0.000000
blend:: 0.000000
lines:: 588
## Summary

kag-error.mjs — KAG error-analysis memory CLI

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```