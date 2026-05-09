---
type: "file"
path: "tests/helpers/port-detector.ts"
aliases: ["port-detector.ts","tests/helpers/port-detector.ts"]
clusterId: -1
ext: ".ts"
lineCount: 52
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/helpers/port-detector.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/helpers"]
---

# `tests/helpers/port-detector.ts`
## For future Claude
> Detects which port the dev server is running on
pagerank:: 0.000000
blend:: 0.000000
lines:: 52
## Summary

Detects which port the dev server is running on

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```