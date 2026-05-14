---
type: "file"
path: "scripts/graph/synthesize-next-actions.mjs"
aliases: ["synthesize-next-actions.mjs","scripts/graph/synthesize-next-actions.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 854
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/graph/synthesize-next-actions.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","auth","zod","t/mjs","t/scripts","t/graph"]
---

# `scripts/graph/synthesize-next-actions.mjs`
## For future Claude
> synthesize-next-actions.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 854
## Summary

synthesize-next-actions.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```