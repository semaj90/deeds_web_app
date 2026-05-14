---
type: "file"
path: "scripts/tests/deep-directory-audit.mjs"
aliases: ["deep-directory-audit.mjs","scripts/tests/deep-directory-audit.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 740
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/scripts/tests/deep-directory-audit.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/ensure-inference]]"]
tags: ["file","ext/mjs","test","auth","zod","t/mjs","t/scripts","t/tests"]
---

# `scripts/tests/deep-directory-audit.mjs`
## For future Claude
> deep-directory-audit.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 740
## Summary

deep-directory-audit.mjs

## Imports

- imports:: [[Files/ensure-inference]] `./ensure-inference.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```