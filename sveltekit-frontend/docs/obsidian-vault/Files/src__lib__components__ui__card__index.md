---
type: "file"
path: "src/lib/components/ui/card/index.ts"
aliases: ["index.ts","src/lib/components/ui/card/index.ts"]
clusterId: 34
ext: ".ts"
lineCount: 28
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/card/index.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-34]]"]
imports: ["[[Files/card]]","[[Files/cardcontent]]","[[Files/carddescription]]","[[Files/cardfooter]]","[[Files/cardheader]]","[[Files/cardtitle]]"]
tags: ["file","ext/ts","cluster/34","t/ts","t/src","t/lib"]
---

# `src/lib/components/ui/card/index.ts`
## For future Claude
> .ts at src/lib/components/ui/card/index.ts (28 lines).
cluster:: [[Clusters/cluster-34]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 28
## Imports

- imports:: [[Files/card]] `./Card.svelte`
- imports:: [[Files/cardcontent]] `./CardContent.svelte`
- imports:: [[Files/carddescription]] `./CardDescription.svelte`
- imports:: [[Files/cardfooter]] `./CardFooter.svelte`
- imports:: [[Files/cardheader]] `./CardHeader.svelte`
- imports:: [[Files/cardtitle]] `./CardTitle.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```