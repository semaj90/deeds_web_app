---
type: "file"
path: "scripts/tests/test-production-readiness.mjs"
aliases: ["test-production-readiness.mjs","scripts/tests/test-production-readiness.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1626
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/tests/test-production-readiness.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/ensure-inference]]"]
tags: ["file","ext/mjs","test","auth","zod","t/mjs","t/scripts","t/tests"]
---

# `scripts/tests/test-production-readiness.mjs`
## For future Claude
> test-production-readiness.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 1626
## Summary

test-production-readiness.mjs

## Imports

- imports:: [[Files/ensure-inference]] `./ensure-inference.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```