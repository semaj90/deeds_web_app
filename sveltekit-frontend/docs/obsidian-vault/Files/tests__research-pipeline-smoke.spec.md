---
type: "file"
path: "tests/research-pipeline-smoke.spec.ts"
aliases: ["research-pipeline-smoke.spec.ts","tests/research-pipeline-smoke.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 335
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/research-pipeline-smoke.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","zod","t/ts","t/tests","t/research-pipeline-smoke_spec_ts"]
---

# `tests/research-pipeline-smoke.spec.ts`
## For future Claude
> Research pipeline end-to-end smoke test.
pagerank:: 0.000000
blend:: 0.000000
lines:: 335
## Summary

Research pipeline end-to-end smoke test.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```