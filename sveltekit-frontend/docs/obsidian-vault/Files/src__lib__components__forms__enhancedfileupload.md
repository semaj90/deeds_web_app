---
type: "file"
path: "src/lib/components/forms/EnhancedFileUpload.svelte"
aliases: ["EnhancedFileUpload.svelte","src/lib/components/forms/EnhancedFileUpload.svelte"]
clusterId: 1
ext: ".svelte"
lineCount: 496
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/forms/EnhancedFileUpload.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/svelte","cluster/1","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/forms/EnhancedFileUpload.svelte`
## For future Claude
> .svelte at src/lib/components/forms/EnhancedFileUpload.svelte (496 lines), Svelte component.
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 496
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```