---
type: "file"
path: "src/routes/(app)/admin/codebase-viewer/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/admin/codebase-viewer/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 562
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/admin/codebase-viewer/+page.svelte"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/admin/codebase-viewer/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/admin/codebase-viewer/+page.svelte (562 lines), SvelteKit route, Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 562
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```