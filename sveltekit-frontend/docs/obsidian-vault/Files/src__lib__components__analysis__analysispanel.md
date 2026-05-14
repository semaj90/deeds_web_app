---
type: "file"
path: "src/lib/components/analysis/AnalysisPanel.svelte"
aliases: ["AnalysisPanel.svelte","src/lib/components/analysis/AnalysisPanel.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 2405
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/analysis/AnalysisPanel.svelte"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/analysis/AnalysisPanel.svelte`
## For future Claude
> .svelte at src/lib/components/analysis/AnalysisPanel.svelte (2405 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 2405
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```