---
type: "file"
path: "src/lib/components/ai/AIChatWidget.svelte"
aliases: ["AIChatWidget.svelte","src/lib/components/ai/AIChatWidget.svelte"]
clusterId: 5
ext: ".svelte"
lineCount: 69
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ai/AIChatWidget.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-5]]"]
imports: ["[[Files/simpleworkingchat]]"]
tags: ["file","ext/svelte","cluster/5","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ai/AIChatWidget.svelte`
## For future Claude
> .svelte at src/lib/components/ai/AIChatWidget.svelte (69 lines), Svelte component.
cluster:: [[Clusters/cluster-5]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 69
## Imports

- imports:: [[Files/simpleworkingchat]] `./SimpleWorkingChat.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```