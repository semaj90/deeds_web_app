---
type: "file"
path: "src/routes/(app)/demos/toc-reader/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/demos/toc-reader/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 27
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/demos/toc-reader/+page.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/demos/toc-reader/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/demos/toc-reader/+page.svelte (27 lines), SvelteKit route, Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 27
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```