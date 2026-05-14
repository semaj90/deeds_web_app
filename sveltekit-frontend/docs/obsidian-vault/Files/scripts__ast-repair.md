---
type: "file"
path: "scripts/ast-repair.ts"
aliases: ["ast-repair.ts","scripts/ast-repair.ts"]
clusterId: -1
ext: ".ts"
lineCount: 1018
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/ast-repair.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/scripts","t/ast-repair_ts"]
---

# `scripts/ast-repair.ts`
## For future Claude
> AST-Based Repair Tool — ts-morph diagnostic scanner + targeted repair
pagerank:: 0.000000
blend:: 0.000000
lines:: 1018
## Summary

AST-Based Repair Tool — ts-morph diagnostic scanner + targeted repair

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```