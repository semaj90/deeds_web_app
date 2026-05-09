---
type: "file"
path: "src/lib/components/DocumentDetailModal.svelte"
aliases: ["DocumentDetailModal.svelte","src/lib/components/DocumentDetailModal.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 19
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/DocumentDetailModal.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/legal__documentdetails]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/DocumentDetailModal.svelte`
## For future Claude
> .svelte at src/lib/components/DocumentDetailModal.svelte (19 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 19
## Imports

- imports:: [[Files/legal__documentdetails]] `./legal/DocumentDetails.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```