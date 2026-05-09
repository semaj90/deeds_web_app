---
type: "file"
path: "src/lib/components/case/SummaryEditor.svelte"
aliases: ["SummaryEditor.svelte","src/lib/components/case/SummaryEditor.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 368
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/case/SummaryEditor.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/legal-ai__citationdetail]]","[[Files/legal-ai__citationlist]]","[[Files/legal-ai__citationsearch]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/case/SummaryEditor.svelte`
## For future Claude
> .svelte at src/lib/components/case/SummaryEditor.svelte (368 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 368
## Imports

- imports:: [[Files/legal-ai__citationdetail]] `../legal-ai/CitationDetail.svelte`
- imports:: [[Files/legal-ai__citationlist]] `../legal-ai/CitationList.svelte`
- imports:: [[Files/legal-ai__citationsearch]] `../legal-ai/CitationSearch.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```