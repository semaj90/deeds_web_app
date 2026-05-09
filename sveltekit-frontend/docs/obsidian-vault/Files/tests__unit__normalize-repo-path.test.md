---
type: "file"
path: "tests/unit/normalize-repo-path.test.ts"
aliases: ["normalize-repo-path.test.ts","tests/unit/normalize-repo-path.test.ts"]
clusterId: -1
ext: ".ts"
lineCount: 139
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/unit/normalize-repo-path.test.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/..__scripts__graph__build-codebase-relationships]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/unit"]
---

# `tests/unit/normalize-repo-path.test.ts`
## For future Claude
> Regression tests for normalizeRepoPath() and ACE relation matching.
pagerank:: 0.000000
blend:: 0.000000
lines:: 139
## Summary

Regression tests for normalizeRepoPath() and ACE relation matching.

## Imports

- imports:: [[Files/..__scripts__graph__build-codebase-relationships]] `../../scripts/graph/build-codebase-relationships.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```