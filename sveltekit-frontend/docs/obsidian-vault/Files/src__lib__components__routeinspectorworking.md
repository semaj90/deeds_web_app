---
type: "file"
path: "src/lib/components/RouteInspectorWorking.svelte"
aliases: ["RouteInspectorWorking.svelte","src/lib/components/RouteInspectorWorking.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 589
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/RouteInspectorWorking.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/RouteInspectorWorking.svelte`
## For future Claude
> .svelte at src/lib/components/RouteInspectorWorking.svelte (589 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 589

## TODOs

- TODO
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```