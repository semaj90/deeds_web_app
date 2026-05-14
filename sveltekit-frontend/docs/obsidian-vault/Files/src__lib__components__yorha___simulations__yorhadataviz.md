---
type: "file"
path: "src/lib/components/yorha/_simulations/YoRHaDataViz.svelte"
aliases: ["YoRHaDataViz.svelte","src/lib/components/yorha/_simulations/YoRHaDataViz.svelte"]
clusterId: -1
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
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/yorha/_simulations/YoRHaDataViz.svelte`
## For future Claude
> .svelte at src/lib/components/yorha/_simulations/YoRHaDataViz.svelte (658 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 658
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```