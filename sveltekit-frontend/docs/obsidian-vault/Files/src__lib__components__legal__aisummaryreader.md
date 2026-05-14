---
type: "file"
path: "src/lib/components/legal/AISummaryReader.svelte"
aliases: ["AISummaryReader.svelte","src/lib/components/legal/AISummaryReader.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 712
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal/AISummaryReader.svelte"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal/AISummaryReader.svelte`
## For future Claude
> AISummaryReader — AI-powered document summary with voice reading
pagerank:: 0.000000
blend:: 0.000000
lines:: 712
## Summary

AISummaryReader — AI-powered document summary with voice reading

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```