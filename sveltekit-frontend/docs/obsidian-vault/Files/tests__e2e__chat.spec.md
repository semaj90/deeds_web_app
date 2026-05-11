---
type: "file"
path: "tests/e2e/chat.spec.ts"
aliases: ["chat.spec.ts","tests/e2e/chat.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 662
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/chat.spec.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/utils__seed-cases]]"]
tags: ["file","ext/ts","test","zod","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/chat.spec.ts`
## For future Claude
> Phase 76: End-to-End Chat Interface Test
pagerank:: 0.000000
blend:: 0.000000
lines:: 662
## Summary

Phase 76: End-to-End Chat Interface Test

## Imports

- imports:: [[Files/utils__seed-cases]] `../utils/seed-cases`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```