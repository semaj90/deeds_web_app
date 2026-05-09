---
type: "file"
path: "tests/codebase-viewer.spec.ts"
aliases: ["codebase-viewer.spec.ts","tests/codebase-viewer.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 158
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/codebase-viewer.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/codebase-viewer_spec_ts"]
---

# `tests/codebase-viewer.spec.ts`
## For future Claude
> Codebase Viewer Admin UI Tests
pagerank:: 0.000000
blend:: 0.000000
lines:: 158
## Summary

Codebase Viewer Admin UI Tests

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```