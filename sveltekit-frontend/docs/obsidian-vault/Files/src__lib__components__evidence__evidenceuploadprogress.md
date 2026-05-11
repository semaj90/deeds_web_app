---
type: "file"
path: "src/lib/components/evidence/EvidenceUploadProgress.svelte"
aliases: ["EvidenceUploadProgress.svelte","src/lib/components/evidence/EvidenceUploadProgress.svelte"]
clusterId: 59
ext: ".svelte"
lineCount: 571
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceUploadProgress.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-59]]"]
imports: []
tags: ["file","ext/svelte","cluster/59","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceUploadProgress.svelte`
## For future Claude
> Evidence Upload Progress with Real-Time SSE Tracking
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 571
## Summary

Evidence Upload Progress with Real-Time SSE Tracking

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```