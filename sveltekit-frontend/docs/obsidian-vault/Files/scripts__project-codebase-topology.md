---
type: "file"
path: "scripts/project-codebase-topology.mjs"
aliases: ["project-codebase-topology.mjs","scripts/project-codebase-topology.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 622
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/project-codebase-topology.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/project-codebase-topology_mjs"]
---

# `scripts/project-codebase-topology.mjs`
## For future Claude
> project-codebase-topology.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 622
## Summary

project-codebase-topology.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```