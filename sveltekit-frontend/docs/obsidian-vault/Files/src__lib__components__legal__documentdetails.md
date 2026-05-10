---
type: "file"
path: "src/lib/components/legal/DocumentDetails.svelte"
aliases: ["DocumentDetails.svelte","src/lib/components/legal/DocumentDetails.svelte"]
clusterId: 21
ext: ".svelte"
lineCount: 462
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal/DocumentDetails.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-21]]"]
imports: []
tags: ["file","ext/svelte","cluster/21","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal/DocumentDetails.svelte`
## For future Claude
> .svelte at src/lib/components/legal/DocumentDetails.svelte (462 lines), Svelte component.
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 462
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```