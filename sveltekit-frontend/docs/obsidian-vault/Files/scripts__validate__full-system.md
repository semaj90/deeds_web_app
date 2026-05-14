---
type: "file"
path: "scripts/validate/full-system.mjs"
aliases: ["full-system.mjs","scripts/validate/full-system.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1258
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/validate/full-system.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","auth","zod","t/mjs","t/scripts","t/validate"]
---

# `scripts/validate/full-system.mjs`
## For future Claude
> full-system.mjs — single-command system validator (27-gate audit)
pagerank:: 0.000000
blend:: 0.000000
lines:: 1258
## Summary

full-system.mjs — single-command system validator (27-gate audit)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```