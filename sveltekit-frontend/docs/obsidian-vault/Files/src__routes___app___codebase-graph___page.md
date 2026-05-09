---
type: "file"
path: "src/routes/(app)/codebase-graph/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/codebase-graph/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 153
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/codebase-graph/+page.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/codebasegraphcanvas]]","[[Files/codebasegraphsidebar]]"]
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/codebase-graph/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/codebase-graph/+page.svelte (153 lines), SvelteKit route, Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 153
## Imports

- imports:: [[Files/codebasegraphcanvas]] `./CodebaseGraphCanvas.svelte`
- imports:: [[Files/codebasegraphsidebar]] `./CodebaseGraphSidebar.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```