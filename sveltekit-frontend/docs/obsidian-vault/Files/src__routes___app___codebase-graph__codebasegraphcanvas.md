---
type: "file"
path: "src/routes/(app)/codebase-graph/CodebaseGraphCanvas.svelte"
aliases: ["CodebaseGraphCanvas.svelte","src/routes/(app)/codebase-graph/CodebaseGraphCanvas.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 277
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/codebase-graph/CodebaseGraphCanvas.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/codebase-graph/CodebaseGraphCanvas.svelte`
## For future Claude
> .svelte at src/routes/(app)/codebase-graph/CodebaseGraphCanvas.svelte (277 lines), Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 277
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```