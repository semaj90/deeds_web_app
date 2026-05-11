---
type: "file"
path: "src/lib/components/ui/RichTextEditor.svelte"
aliases: ["RichTextEditor.svelte","src/lib/components/ui/RichTextEditor.svelte"]
clusterId: 34
ext: ".svelte"
lineCount: 677
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/RichTextEditor.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-34]]"]
imports: []
tags: ["file","ext/svelte","cluster/34","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/RichTextEditor.svelte`
## For future Claude
> .svelte at src/lib/components/ui/RichTextEditor.svelte (677 lines), Svelte component.
cluster:: [[Clusters/cluster-34]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 677
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```