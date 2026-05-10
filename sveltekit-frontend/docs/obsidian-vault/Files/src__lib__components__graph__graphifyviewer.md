---
type: "file"
path: "src/lib/components/graph/GraphifyViewer.svelte"
aliases: ["GraphifyViewer.svelte","src/lib/components/graph/GraphifyViewer.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 1408
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/graph/GraphifyViewer.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/bagofwordstexturepanel]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/graph/GraphifyViewer.svelte`
## For future Claude
> .svelte at src/lib/components/graph/GraphifyViewer.svelte (1408 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1408
## Imports

- imports:: [[Files/bagofwordstexturepanel]] `./BagOfWordsTexturePanel.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```