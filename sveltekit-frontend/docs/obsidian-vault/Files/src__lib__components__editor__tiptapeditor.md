---
type: "file"
path: "src/lib/components/editor/TipTapEditor.svelte"
aliases: ["TipTapEditor.svelte","src/lib/components/editor/TipTapEditor.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 443
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/editor/TipTapEditor.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/editor/TipTapEditor.svelte`
## For future Claude
> .svelte at src/lib/components/editor/TipTapEditor.svelte (443 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 443
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```