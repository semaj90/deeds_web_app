---
type: "cluster"
cluster_id: "cluster-90"
clusterId: 90
topic: "function chunks in `src/lib/server` (tag: auth)"
aliases: ["cluster-90","function chunks in `src/lib/server` (tag: auth)"]
memberCount: 158
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["auth","api","server"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
contains: ["[[Files/src__lib__server__lucia]]","[[Files/src__routes__api__auth__logout___server]]","[[Files/src__lib__server__auth]]","[[Files/src__lib__server__auth-guard]]","[[Files/src__lib__types__auth.d]]","[[Files/src__routes__api__auth__session___server]]","[[Files/src__routes__api__dev__login-demo___server]]"]
same: ["[[Clusters/cluster-64]]","[[Clusters/cluster-44]]","[[Clusters/cluster-26]]","[[Clusters/cluster-31]]","[[Clusters/cluster-80]]"]
tags: ["cluster","cluster/90","topic/auth","topic/routes","topic/types","topic/sym_invalidate","topic/sym_get"]
---

# function chunks in `src/lib/server` (tag: auth)
## For future Claude
> Cluster of 7 files. Top dirs: src/lib/server, src/routes/api/auth/logout, src/lib/types. Top tags: auth, api, server. Risk: medium.
cluster:: cluster-90
cluster_id:: 90
member_count:: 7
pagerank_sum:: 0
risk:: medium
top_tags:: auth, api, server
## Agent hints
Use this cluster when investigating auth, api, server.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-64]] (jaccard 0.67)
- same:: [[Clusters/cluster-44]] (jaccard 0.60)
- same:: [[Clusters/cluster-26]] (jaccard 0.40)
- same:: [[Clusters/cluster-31]] (jaccard 0.40)
- same:: [[Clusters/cluster-80]] (jaccard 0.40)
## Top Directories
- `src/lib/server` (10)
- `src/routes/api/auth/logout` (2)
- `src/lib/types` (1)
## Top Tags
- auth (15)
- api (4)
- server (4)
## Members (7)
- contains:: [[Files/src__lib__server__lucia|src/lib/server/lucia.ts]]
- contains:: [[Files/src__routes__api__auth__logout___server|src/routes/api/auth/logout/+server.ts]]
- contains:: [[Files/src__lib__server__auth|src/lib/server/auth.ts]]
- contains:: [[Files/src__lib__server__auth-guard|src/lib/server/auth-guard.js]]
- contains:: [[Files/src__lib__types__auth.d|src/lib/types/auth.d.ts]]
- contains:: [[Files/src__routes__api__auth__session___server|src/routes/api/auth/session/+server.ts]]
- contains:: [[Files/src__routes__api__dev__login-demo___server|src/routes/api/dev/login-demo/+server.ts]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 90 SORT pagerank DESC LIMIT 30
```