---
type: "file"
path: "src/lib/components/chat/ChatPromptBar.svelte"
aliases: ["ChatPromptBar.svelte","src/lib/components/chat/ChatPromptBar.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 149
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/chat/ChatPromptBar.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/documentchip]]","[[Files/fileuploadmodal]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/chat/ChatPromptBar.svelte`
## For future Claude
> .svelte at src/lib/components/chat/ChatPromptBar.svelte (149 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 149
## Imports

- imports:: [[Files/documentchip]] `./DocumentChip.svelte`
- imports:: [[Files/fileuploadmodal]] `./FileUploadModal.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```