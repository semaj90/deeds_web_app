---
type: "file"
path: "src/lib/server/indexer/audit-triage.ts"
aliases: ["audit-triage.ts","src/lib/server/indexer/audit-triage.ts"]
clusterId: 58
ext: ".ts"
lineCount: 59
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/audit-triage.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/audit-triage.ts`
## For future Claude
> Audit Triage Utility: Analyzes file-level audit signals to identify
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 59
## Summary

Audit Triage Utility: Analyzes file-level audit signals to identify

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```