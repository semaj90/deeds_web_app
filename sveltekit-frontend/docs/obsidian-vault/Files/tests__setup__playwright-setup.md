---
type: "file"
path: "tests/setup/playwright-setup.ts"
aliases: ["playwright-setup.ts","tests/setup/playwright-setup.ts"]
clusterId: -1
ext: ".ts"
lineCount: 226
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/tests/setup/playwright-setup.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/e2e__utils__screenshot-utils]]","[[Files/e2e__utils__test-fixtures]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/setup"]
---

# `tests/setup/playwright-setup.ts`
## For future Claude
> Playwright E2E Test Setup
pagerank:: 0.000000
blend:: 0.000000
lines:: 226
## Summary

Playwright E2E Test Setup

## Imports

- imports:: [[Files/e2e__utils__screenshot-utils]] `../e2e/utils/screenshot-utils`
- imports:: [[Files/e2e__utils__test-fixtures]] `../e2e/utils/test-fixtures`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```