---
type: "file"
path: "tests/e2e/utils/screenshot-utils.ts"
aliases: ["screenshot-utils.ts","tests/e2e/utils/screenshot-utils.ts"]
clusterId: -1
ext: ".ts"
lineCount: 163
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/utils/screenshot-utils.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/utils/screenshot-utils.ts`
## For future Claude
> Screenshot Utilities for E2E Testing
pagerank:: 0.000000
blend:: 0.000000
lines:: 163
## Summary

Screenshot Utilities for E2E Testing

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```