---
type: "file"
path: "src/lib/components/ui/tabs/Tabs.svelte"
aliases: ["Tabs.svelte","src/lib/components/ui/tabs/Tabs.svelte"]
clusterId: 67
ext: ".svelte"
lineCount: 62
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/tabs/Tabs.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-67]]"]
imports: ["[[Files/tabslist]]","[[Files/tabsroot]]","[[Files/tabstrigger]]","[[Files/types]]"]
tags: ["file","ext/svelte","cluster/67","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/tabs/Tabs.svelte`
## For future Claude
> Convenient all-in-one Tabs component
cluster:: [[Clusters/cluster-67]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 62
## Summary

Convenient all-in-one Tabs component

## Imports

- imports:: [[Files/tabslist]] `./TabsList.svelte`
- imports:: [[Files/tabsroot]] `./TabsRoot.svelte`
- imports:: [[Files/tabstrigger]] `./TabsTrigger.svelte`
- imports:: [[Files/types]] `./types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```