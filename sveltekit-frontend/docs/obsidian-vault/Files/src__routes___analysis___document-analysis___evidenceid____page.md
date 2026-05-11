---
type: "file"
path: "src/routes/(analysis)@/document-analysis/[evidenceId]/+page.svelte"
aliases: ["+page.svelte","src/routes/(analysis)@/document-analysis/[evidenceId]/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 746
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/(analysis)@/document-analysis/[evidenceId]/+page.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/svelte","route","svelte","t/svelte","t/src","t/routes"]
---

# `src/routes/(analysis)@/document-analysis/[evidenceId]/+page.svelte`
## For future Claude
> .svelte at src/routes/(analysis)@/document-analysis/[evidenceId]/+page.svelte (746 lines), SvelteKit route, Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 746
## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```