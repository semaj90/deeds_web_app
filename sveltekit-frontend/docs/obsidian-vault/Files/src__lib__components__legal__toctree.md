---
type: "file"
path: "src/lib/components/legal/TocTree.svelte"
aliases: ["TocTree.svelte","src/lib/components/legal/TocTree.svelte"]
clusterId: 21
ext: ".svelte"
lineCount: 120
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal/TocTree.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-21]]"]
imports: ["[[Files/toctree]]"]
tags: ["file","ext/svelte","cluster/21","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal/TocTree.svelte`
## For future Claude
> .svelte at src/lib/components/legal/TocTree.svelte (120 lines), Svelte component.
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 120
## Imports

- imports:: [[Files/toctree]] `./TocTree.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```