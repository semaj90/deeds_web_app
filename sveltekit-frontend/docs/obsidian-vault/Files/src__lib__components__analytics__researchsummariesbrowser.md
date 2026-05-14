---
type: "file"
path: "src/lib/components/analytics/ResearchSummariesBrowser.svelte"
aliases: ["ResearchSummariesBrowser.svelte","src/lib/components/analytics/ResearchSummariesBrowser.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 565
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/analytics/ResearchSummariesBrowser.svelte"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/analytics/ResearchSummariesBrowser.svelte`
## For future Claude
> ResearchSummariesBrowser — unified paginated browser for all research_summaries content.
pagerank:: 0.000000
blend:: 0.000000
lines:: 565
## Summary

ResearchSummariesBrowser — unified paginated browser for all research_summaries content.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```