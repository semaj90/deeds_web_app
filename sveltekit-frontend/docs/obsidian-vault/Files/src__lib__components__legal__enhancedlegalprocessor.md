---
type: "file"
path: "src/lib/components/legal/EnhancedLegalProcessor.svelte"
aliases: ["EnhancedLegalProcessor.svelte","src/lib/components/legal/EnhancedLegalProcessor.svelte"]
clusterId: 21
ext: ".svelte"
lineCount: 268
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal/EnhancedLegalProcessor.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-21]]"]
imports: []
tags: ["file","ext/svelte","cluster/21","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal/EnhancedLegalProcessor.svelte`
## For future Claude
> EnhancedLegalProcessor — Document upload + AI analysis pipeline
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 268
## Summary

EnhancedLegalProcessor — Document upload + AI analysis pipeline

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```