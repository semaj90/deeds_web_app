---
type: "file"
path: "src/routes/(app)/cases/[id]/board/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/cases/[id]/board/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 3570
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 12
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/cases/[id]/board/+page.svelte"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/cases/[id]/board/+page.svelte`
## For future Claude
> Places every filtered+unplaced evidence item onto the canvas in a grid around the visible center.
pagerank:: 0.000000
blend:: 0.000000
lines:: 3570
## Summary

Places every filtered+unplaced evidence item onto the canvas in a grid around the visible center.

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```