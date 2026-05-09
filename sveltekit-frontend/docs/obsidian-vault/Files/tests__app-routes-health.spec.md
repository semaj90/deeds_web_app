---
type: "file"
path: "tests/app-routes-health.spec.ts"
aliases: ["app-routes-health.spec.ts","tests/app-routes-health.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 98
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/app-routes-health.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/helpers__env-ports]]"]
tags: ["file","ext/ts","test","auth","t/ts","t/tests","t/app-routes-health_spec_ts"]
---

# `tests/app-routes-health.spec.ts`
## For future Claude
> App Routes Health Check
pagerank:: 0.000000
blend:: 0.000000
lines:: 98
## Summary

App Routes Health Check

## Imports

- imports:: [[Files/helpers__env-ports]] `./helpers/env-ports.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```