---
type: "file"
path: "src/lib/components/ai/EnhancedDocumentUploader.svelte"
aliases: ["EnhancedDocumentUploader.svelte","src/lib/components/ai/EnhancedDocumentUploader.svelte"]
clusterId: 5
ext: ".svelte"
lineCount: 989
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ai/EnhancedDocumentUploader.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-5]]"]
imports: []
tags: ["file","ext/svelte","cluster/5","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ai/EnhancedDocumentUploader.svelte`
## For future Claude
> .svelte at src/lib/components/ai/EnhancedDocumentUploader.svelte (989 lines), Svelte component.
cluster:: [[Clusters/cluster-5]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 989
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```