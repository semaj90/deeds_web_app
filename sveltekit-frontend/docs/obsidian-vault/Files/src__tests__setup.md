---
type: "file"
path: "src/tests/setup.ts"
aliases: ["setup.ts","src/tests/setup.ts"]
clusterId: -1
ext: ".ts"
lineCount: 10
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/tests/setup.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/src","t/tests"]
---

# `src/tests/setup.ts`
## For future Claude
> Test Setup Configuration
pagerank:: 0.000000
blend:: 0.000000
lines:: 10
## Summary

Test Setup Configuration

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```