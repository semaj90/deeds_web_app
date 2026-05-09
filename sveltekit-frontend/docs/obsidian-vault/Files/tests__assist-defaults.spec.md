---
type: "file"
path: "tests/assist-defaults.spec.ts"
aliases: ["assist-defaults.spec.ts","tests/assist-defaults.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 188
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/tests/assist-defaults.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/assist-defaults_spec_ts"]
---

# `tests/assist-defaults.spec.ts`
## For future Claude
> Tests for GET/POST /api/codebase-index/claude-assist/defaults
pagerank:: 0.000000
blend:: 0.000000
lines:: 188
## Summary

Tests for GET/POST /api/codebase-index/claude-assist/defaults

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```