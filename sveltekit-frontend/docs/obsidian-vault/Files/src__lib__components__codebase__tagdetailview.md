---
type: "file"
path: "src/lib/components/codebase/TagDetailView.svelte"
aliases: ["TagDetailView.svelte","src/lib/components/codebase/TagDetailView.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 505
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/codebase/TagDetailView.svelte"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/codebase/TagDetailView.svelte`
## For future Claude
> ═══════════════════════════════════════════════════════════════════════
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 505
## Summary

═══════════════════════════════════════════════════════════════════════

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```