---
type: "file"
path: "scripts/check-all-tools.mjs"
aliases: ["check-all-tools.mjs","scripts/check-all-tools.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 674
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/check-all-tools.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/check-all-tools_mjs"]
---

# `scripts/check-all-tools.mjs`
## For future Claude
> check-all-tools.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 674
## Summary

check-all-tools.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```