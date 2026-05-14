---
type: "file"
path: "scripts/generate-schema-manifest.mjs"
aliases: ["generate-schema-manifest.mjs","scripts/generate-schema-manifest.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1400
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/generate-schema-manifest.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/generate-schema-manifest_mjs"]
---

# `scripts/generate-schema-manifest.mjs`
## For future Claude
> .mjs at scripts/generate-schema-manifest.mjs (1400 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 1400
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```