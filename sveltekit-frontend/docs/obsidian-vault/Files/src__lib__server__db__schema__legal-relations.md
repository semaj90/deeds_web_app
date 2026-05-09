---
type: "file"
path: "src/lib/server/db/schema/legal-relations.ts"
aliases: ["legal-relations.ts","src/lib/server/db/schema/legal-relations.ts"]
clusterId: 88
ext: ".ts"
lineCount: 115
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 11
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/legal-relations.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-88]]"]
imports: ["[[Files/jurisdictions]]","[[Files/library-documents]]","[[Files/library-document-versions]]","[[Files/legal-nodes]]","[[Files/legal-chunks]]","[[Files/legal-definitions]]","[[Files/legal-citations]]","[[Files/page-artifacts]]","[[Files/ingestion-jobs]]","[[Files/state-constitution-sources]]"]
tags: ["file","ext/ts","cluster/88","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/legal-relations.ts`
## For future Claude
> .ts at src/lib/server/db/schema/legal-relations.ts (115 lines).
cluster:: [[Clusters/cluster-88]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 115
## Imports

- imports:: [[Files/jurisdictions]] `./jurisdictions`
- imports:: [[Files/library-documents]] `./library-documents`
- imports:: [[Files/library-document-versions]] `./library-document-versions`
- imports:: [[Files/legal-nodes]] `./legal-nodes`
- imports:: [[Files/legal-chunks]] `./legal-chunks`
- imports:: [[Files/legal-definitions]] `./legal-definitions`
- imports:: [[Files/legal-citations]] `./legal-citations`
- imports:: [[Files/page-artifacts]] `./page-artifacts`
- imports:: [[Files/ingestion-jobs]] `./ingestion-jobs`
- imports:: [[Files/state-constitution-sources]] `./state-constitution-sources`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```