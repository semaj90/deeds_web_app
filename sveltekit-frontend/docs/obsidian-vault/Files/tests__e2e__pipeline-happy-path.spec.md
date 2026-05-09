---
type: "file"
path: "tests/e2e/pipeline-happy-path.spec.ts"
aliases: ["pipeline-happy-path.spec.ts","tests/e2e/pipeline-happy-path.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 149
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/pipeline-happy-path.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/pipeline-happy-path.spec.ts`
## For future Claude
> Pipeline V2 Happy Path Test
pagerank:: 0.000000
blend:: 0.000000
lines:: 149
## Summary

Pipeline V2 Happy Path Test

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```