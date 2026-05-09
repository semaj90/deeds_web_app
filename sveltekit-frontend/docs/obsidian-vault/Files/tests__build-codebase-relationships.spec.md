---
type: "file"
path: "tests/build-codebase-relationships.spec.ts"
aliases: ["build-codebase-relationships.spec.ts","tests/build-codebase-relationships.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 131
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/tests/build-codebase-relationships.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","zod","t/ts","t/tests","t/build-codebase-relationships_spec_ts"]
---

# `tests/build-codebase-relationships.spec.ts`
## For future Claude
> Regression tests for build-codebase-relationships.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 131
## Summary

Regression tests for build-codebase-relationships.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```