---
type: "file"
path: "src/routes/(app)/couchdb-analytics/ClusterInspector.svelte"
aliases: ["ClusterInspector.svelte","src/routes/(app)/couchdb-analytics/ClusterInspector.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 519
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/couchdb-analytics/ClusterInspector.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/couchdb-analytics/ClusterInspector.svelte`
## For future Claude
> .svelte at src/routes/(app)/couchdb-analytics/ClusterInspector.svelte (519 lines), Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 519
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```