---
type: "file"
path: "scripts/deep-audit-ast.mjs"
aliases: ["deep-audit-ast.mjs","scripts/deep-audit-ast.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1005
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/deep-audit-ast.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/lib__reference-verifier]]"]
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/deep-audit-ast_mjs"]
---

# `scripts/deep-audit-ast.mjs`
## For future Claude
> Deep AST Audit — joins Graphify's codebase-graph.json with AST-level checks
pagerank:: 0.000000
blend:: 0.000000
lines:: 1005
## Summary

Deep AST Audit — joins Graphify's codebase-graph.json with AST-level checks

## Imports

- imports:: [[Files/lib__reference-verifier]] `./lib/reference-verifier.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```