---
type: "file"
path: "tests/quick-ui-test.js"
aliases: ["quick-ui-test.js","tests/quick-ui-test.js"]
clusterId: -1
ext: ".js"
lineCount: 130
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/tests/quick-ui-test.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/js","test","t/js","t/tests","t/quick-ui-test_js"]
---

# `tests/quick-ui-test.js`
## For future Claude
> Quick Manual UI Test - No Test Infrastructure Required
pagerank:: 0.000000
blend:: 0.000000
lines:: 130
## Summary

Quick Manual UI Test - No Test Infrastructure Required

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```