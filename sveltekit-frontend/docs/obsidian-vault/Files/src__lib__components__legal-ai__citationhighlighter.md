---
type: "file"
path: "src/lib/components/legal-ai/CitationHighlighter.svelte"
aliases: ["CitationHighlighter.svelte","src/lib/components/legal-ai/CitationHighlighter.svelte"]
clusterId: 35
ext: ".svelte"
lineCount: 437
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal-ai/CitationHighlighter.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-35]]"]
imports: []
tags: ["file","ext/svelte","cluster/35","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal-ai/CitationHighlighter.svelte`
## For future Claude
> Called when user clicks "→ Research" — triggers deep-research task creation
cluster:: [[Clusters/cluster-35]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 437
## Summary

Called when user clicks "→ Research" — triggers deep-research task creation

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```