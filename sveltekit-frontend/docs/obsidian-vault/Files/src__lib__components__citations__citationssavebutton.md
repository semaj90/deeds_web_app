---
type: "file"
path: "src/lib/components/citations/CitationsSaveButton.svelte"
aliases: ["CitationsSaveButton.svelte","src/lib/components/citations/CitationsSaveButton.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 115
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/citations/CitationsSaveButton.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/citations/CitationsSaveButton.svelte`
## For future Claude
> .svelte at src/lib/components/citations/CitationsSaveButton.svelte (115 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 115
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```