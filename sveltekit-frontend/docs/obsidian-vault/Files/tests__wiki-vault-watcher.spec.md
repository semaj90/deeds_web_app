---
type: "file"
path: "tests/wiki-vault-watcher.spec.ts"
aliases: ["wiki-vault-watcher.spec.ts","tests/wiki-vault-watcher.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 130
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/wiki-vault-watcher.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/src__lib__server__obsidian__markdown-wiki-note]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/wiki-vault-watcher_spec_ts"]
---

# `tests/wiki-vault-watcher.spec.ts`
## For future Claude
> Unit tests for Commit 5 — chokidar bidirectional vault watcher.
pagerank:: 0.000000
blend:: 0.000000
lines:: 130
## Summary

Unit tests for Commit 5 — chokidar bidirectional vault watcher.

## Imports

- imports:: [[Files/src__lib__server__obsidian__markdown-wiki-note]] `../src/lib/server/obsidian/markdown-wiki-note.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```