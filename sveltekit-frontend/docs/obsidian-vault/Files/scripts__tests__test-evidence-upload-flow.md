---
type: "file"
path: "scripts/tests/test-evidence-upload-flow.mjs"
aliases: ["test-evidence-upload-flow.mjs","scripts/tests/test-evidence-upload-flow.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 743
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/tests/test-evidence-upload-flow.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","test","t/mjs","t/scripts","t/tests"]
---

# `scripts/tests/test-evidence-upload-flow.mjs`
## For future Claude
> Evidence Upload UX Flow Test
pagerank:: 0.000000
blend:: 0.000000
lines:: 743
## Summary

Evidence Upload UX Flow Test

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```