---
type: "file"
path: "src/lib/components/ui/select/Select.svelte"
aliases: ["Select.svelte","src/lib/components/ui/select/Select.svelte"]
clusterId: 50
ext: ".svelte"
lineCount: 49
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/select/Select.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-50]]"]
imports: ["[[Files/selectroot]]","[[Files/selecttrigger]]","[[Files/selectcontent]]"]
tags: ["file","ext/svelte","cluster/50","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/select/Select.svelte`
## For future Claude
> Convenient all-in-one Select component.
cluster:: [[Clusters/cluster-50]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 49
## Summary

Convenient all-in-one Select component.

## Imports

- imports:: [[Files/selectroot]] `./SelectRoot.svelte`
- imports:: [[Files/selecttrigger]] `./SelectTrigger.svelte`
- imports:: [[Files/selectcontent]] `./SelectContent.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```