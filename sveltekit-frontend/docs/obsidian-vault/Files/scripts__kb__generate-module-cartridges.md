---
type: "file"
path: "scripts/kb/generate-module-cartridges.mjs"
aliases: ["generate-module-cartridges.mjs","scripts/kb/generate-module-cartridges.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 605
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/kb/generate-module-cartridges.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","auth","zod","t/mjs","t/scripts","t/kb"]
---

# `scripts/kb/generate-module-cartridges.mjs`
## For future Claude
> generate-module-cartridges.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 605
## Summary

generate-module-cartridges.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```