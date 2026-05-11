---
type: "file"
path: "src/lib/components/rag/RagDocumentGrid.svelte"
aliases: ["RagDocumentGrid.svelte","src/lib/components/rag/RagDocumentGrid.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 428
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/rag/RagDocumentGrid.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/documentcard]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/rag/RagDocumentGrid.svelte`
## For future Claude
> .svelte at src/lib/components/rag/RagDocumentGrid.svelte (428 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 428
## Imports

- imports:: [[Files/documentcard]] `./DocumentCard.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```