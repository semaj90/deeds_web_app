---
type: "file"
path: "src/routes/(app)/codebase-graph/fast-ast/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/codebase-graph/fast-ast/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 397
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/codebase-graph/fast-ast/+page.svelte"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/codebasegraphcanvas]]"]
tags: ["file","ext/svelte","route","svelte","auth","zod","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/codebase-graph/fast-ast/+page.svelte`
## For future Claude
> Fast-AST codebase graph viewer
pagerank:: 0.000000
blend:: 0.000000
lines:: 397
## Summary

Fast-AST codebase graph viewer

## Imports

- imports:: [[Files/codebasegraphcanvas]] `../CodebaseGraphCanvas.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```