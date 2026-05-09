---
type: "file"
path: "src/lib/components/shells/BridgeActions.svelte"
aliases: ["BridgeActions.svelte","src/lib/components/shells/BridgeActions.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 250
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/shells/BridgeActions.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/shells/BridgeActions.svelte`
## For future Claude
> Where is the user now — determines which bridge actions to show
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 250
## Summary

Where is the user now — determines which bridge actions to show

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```