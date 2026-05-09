---
type: "file"
path: "src/lib/components/ui/tabs/index.ts"
aliases: ["index.ts","src/lib/components/ui/tabs/index.ts"]
clusterId: 67
ext: ".ts"
lineCount: 26
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/tabs/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-67]]"]
imports: ["[[Files/tabs]]","[[Files/tabscontent]]","[[Files/tabslist]]","[[Files/tabsroot]]","[[Files/tabstrigger]]"]
tags: ["file","ext/ts","cluster/67","t/ts","t/src","t/lib"]
---

# `src/lib/components/ui/tabs/index.ts`
## For future Claude
> .ts at src/lib/components/ui/tabs/index.ts (26 lines).
cluster:: [[Clusters/cluster-67]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 26
## Imports

- imports:: [[Files/tabs]] `./Tabs.svelte`
- imports:: [[Files/tabscontent]] `./TabsContent.svelte`
- imports:: [[Files/tabslist]] `./TabsList.svelte`
- imports:: [[Files/tabsroot]] `./TabsRoot.svelte`
- imports:: [[Files/tabstrigger]] `./TabsTrigger.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```