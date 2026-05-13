---
type: "file"
path: "src/lib/components/codebase/CodebaseWikiDashboard.svelte"
aliases: ["CodebaseWikiDashboard.svelte","src/lib/components/codebase/CodebaseWikiDashboard.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 819
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/codebase/CodebaseWikiDashboard.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/codebase/CodebaseWikiDashboard.svelte`
## For future Claude
> /
pagerank:: 0.000000
blend:: 0.000000
lines:: 819
## Summary

/

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```