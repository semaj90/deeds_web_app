---
type: "file"
path: "src/lib/components/yorha/_simulations/YoRHaDataViz.svelte"
aliases: ["YoRHaDataViz.svelte","src/lib/components/yorha/_simulations/YoRHaDataViz.svelte"]
clusterId: 50
ext: ".svelte"
lineCount: 658
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/yorha/_simulations/YoRHaDataViz.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-50]]"]
imports: []
tags: ["file","ext/svelte","cluster/50","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/yorha/_simulations/YoRHaDataViz.svelte`
## For future Claude
> .svelte at src/lib/components/yorha/_simulations/YoRHaDataViz.svelte (658 lines), Svelte component.
cluster:: [[Clusters/cluster-50]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 658
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```