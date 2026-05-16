---
type: "file"
path: "scripts/api-cleanup/reports/cleanup-report.json"
aliases: ["cleanup-report.json","scripts/api-cleanup/reports/cleanup-report.json"]
clusterId: -1
ext: ".json"
lineCount: 5311
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/scripts/api-cleanup/reports/cleanup-report.json"
last_updated_by_llm: "2026-05-15T22:12:05.184Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `scripts/api-cleanup/reports/cleanup-report.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 5311
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```