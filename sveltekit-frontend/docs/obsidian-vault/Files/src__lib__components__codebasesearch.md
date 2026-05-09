---
type: "file"
path: "src/lib/components/CodebaseSearch.svelte"
aliases: ["CodebaseSearch.svelte","src/lib/components/CodebaseSearch.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 360
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/CodebaseSearch.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/CodebaseSearch.svelte`
## For future Claude
> Codebase Search — Command Palette / Search Panel
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 360
## Summary

Codebase Search — Command Palette / Search Panel

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```