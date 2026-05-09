---
type: "file"
path: "src/lib/components/yorha/YoRHaAIChat.svelte"
aliases: ["YoRHaAIChat.svelte","src/lib/components/yorha/YoRHaAIChat.svelte"]
clusterId: 50
ext: ".svelte"
lineCount: 269
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/yorha/YoRHaAIChat.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-50]]"]
imports: []
tags: ["file","ext/svelte","cluster/50","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/yorha/YoRHaAIChat.svelte`
## For future Claude
> Resolves the Ollama endpoint dynamically.
cluster:: [[Clusters/cluster-50]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 269
## Summary

Resolves the Ollama endpoint dynamically.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```