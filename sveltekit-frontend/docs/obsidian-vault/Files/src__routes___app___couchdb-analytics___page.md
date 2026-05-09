---
type: "file"
path: "src/routes/(app)/couchdb-analytics/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/couchdb-analytics/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 291
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/couchdb-analytics/+page.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/clusterinspector]]","[[Files/dependencychart]]","[[Files/errorpropagationgraph]]","[[Files/summarycard]]"]
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/couchdb-analytics/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/couchdb-analytics/+page.svelte (291 lines), SvelteKit route, Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 291
## Imports

- imports:: [[Files/clusterinspector]] `./ClusterInspector.svelte`
- imports:: [[Files/dependencychart]] `./DependencyChart.svelte`
- imports:: [[Files/errorpropagationgraph]] `./ErrorPropagationGraph.svelte`
- imports:: [[Files/summarycard]] `./SummaryCard.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```