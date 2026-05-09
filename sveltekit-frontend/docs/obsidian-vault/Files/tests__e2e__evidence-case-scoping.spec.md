---
type: "file"
path: "tests/e2e/evidence-case-scoping.spec.ts"
aliases: ["evidence-case-scoping.spec.ts","tests/e2e/evidence-case-scoping.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 183
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/e2e/evidence-case-scoping.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/utils__seed-cases]]"]
tags: ["file","ext/ts","test","auth","t/ts","t/tests","t/e2e"]
---

# `tests/e2e/evidence-case-scoping.spec.ts`
## For future Claude
> Evidence Search — Case-Scoping Regression Test
pagerank:: 0.000000
blend:: 0.000000
lines:: 183
## Summary

Evidence Search — Case-Scoping Regression Test

## Imports

- imports:: [[Files/utils__seed-cases]] `../utils/seed-cases`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```