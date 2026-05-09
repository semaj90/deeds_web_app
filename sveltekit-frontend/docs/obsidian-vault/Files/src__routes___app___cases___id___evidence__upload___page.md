---
type: "file"
path: "src/routes/(app)/cases/[id]/evidence/upload/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/cases/[id]/evidence/upload/+page.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 599
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/cases/[id]/evidence/upload/+page.svelte"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","route","svelte","auth","zod","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/cases/[id]/evidence/upload/+page.svelte`
## For future Claude
> Scan a text-based file for PII before upload
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 599
## Summary

Scan a text-based file for PII before upload

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```