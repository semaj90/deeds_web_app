---
type: "file"
path: "src/lib/components/LegalCorpusSearch.svelte"
aliases: ["LegalCorpusSearch.svelte","src/lib/components/LegalCorpusSearch.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 470
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/LegalCorpusSearch.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/LegalCorpusSearch.svelte`
## For future Claude
> Legal Corpus Search — Command Palette for Legal Knowledge Base
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 470
## Summary

Legal Corpus Search — Command Palette for Legal Knowledge Base

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```