---
type: "file"
path: "src/routes/(app)/admin/chat-memory/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/admin/chat-memory/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 823
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: true
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/admin/chat-memory/+page.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/svelte","route","svelte","auth","zod","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/admin/chat-memory/+page.svelte`
## For future Claude
> Auto-refresh metrics every 5s while page is visible.
pagerank:: 0.000000
blend:: 0.000000
lines:: 823
## Summary

Auto-refresh metrics every 5s while page is visible.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```